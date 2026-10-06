#!/usr/bin/env node
'use strict';

/*
 * Conversão de endereço de corrida Uber em GPS no servidor cPanel (sem GRM, sem Puppeteer).
 *
 * Por que aqui: em 06/10/2026 o OpenStreetMap (Nominatim) passou a responder HTTP 403 ao IP
 * das Edge Functions do Supabase; o IP deste servidor tem acesso. Roda a mesma cadeia da
 * função de borda (Nominatim -> Photon, com checagem de rua/cidade/estado), cujo código fica
 * em supabase/functions/uber-geocodificar-gps/ (endereco.ts e geocodificar.ts; no servidor,
 * cópia em ./uber-geocodificar/). Node 22 importa .ts direto.
 *
 * Fila: uber_gps_fila (preenchida pela RPC uber_gps_solicitar, chamada pelos botões "GPS" e
 * "Converter GPS pendentes" da tela Uber). Para cada corrida: grava partida_latitude/longitude
 * (e destino, se pedido), chama uber_validar_por_os_laudo() — que valida sozinha quando há O.S.
 * com laudo do colaborador a até 2 km — e marca a linha da fila com o resultado.
 *
 * Tempo: processa até GRM_UBER_GEOCODIFICAR_ORCAMENTO_MS (7 min) e, se sobrar fila, agenda um
 * job de continuação. GRM_UBER_GEOCODIFICAR_DRY_RUN=true só mostra o que faria (não grava nada
 * e não cria job).
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;
const DRY_RUN = String(process.env.GRM_UBER_GEOCODIFICAR_DRY_RUN ?? 'false').toLowerCase() === 'true';
const ORCAMENTO_MS = Math.max(30_000, Number(process.env.GRM_UBER_GEOCODIFICAR_ORCAMENTO_MS || 7 * 60 * 1000));
const LOTE = 25;
const AGENTE_ID = 'sync-uber-geocodificar';
const NOMINATIM_DELAY_MS = 1100; // política de uso do Nominatim: no máximo 1 requisição por segundo
const ERRO_RETRY_HORAS = 24;
const PREFIXO_CHAVE = 'uber_endereco:';
const USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function carregarGeocodificador() {
  const pastas = [
    path.join(__dirname, 'uber-geocodificar'),
    path.join(__dirname, '..', 'supabase', 'functions', 'uber-geocodificar-gps'),
  ];
  for (const pasta of pastas) {
    const geo = path.join(pasta, 'geocodificar.ts');
    const end = path.join(pasta, 'endereco.ts');
    if (fs.existsSync(geo) && fs.existsSync(end)) {
      const [g, e] = await Promise.all([import(pathToFileURL(geo).href), import(pathToFileURL(end).href)]);
      return { ...g, normKey: e.normKey };
    }
  }
  throw new Error('Módulos do geocodificador não encontrados (uber-geocodificar/geocodificar.ts).');
}

async function recuperarTravadas() {
  const limite = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('uber_gps_fila')
    .update({ status: 'PENDENTE', iniciado_em: null, updated_at: new Date().toISOString() })
    .eq('status', 'PROCESSANDO')
    .lt('iniciado_em', limite);
  if (error) log('WARN', `Falha ao recuperar PROCESSANDO antigo: ${error.message}`);
}

async function proximoLote() {
  const { data, error } = await supabase
    .from('uber_gps_fila')
    .select('*')
    .eq('status', 'PENDENTE')
    .order('solicitado_em', { ascending: true })
    .limit(LOTE);
  if (error) throw error;
  return data || [];
}

async function atualizarFila(id, patch) {
  const { error } = await supabase
    .from('uber_gps_fila')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function agendarContinuacao() {
  const { data: pendentes } = await supabase.from('uber_gps_fila').select('id').eq('status', 'PENDENTE').limit(1);
  if (!pendentes?.length) return;
  const { data: existente } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', AGENTE_ID)
    .in('status', ['pendente'])
    .limit(1);
  if (existente?.length) return;
  const { error } = await supabase.from('grm_sync_jobs').insert({
    agente_id: AGENTE_ID,
    status: 'pendente',
    payload: { origem: 'uber_gps_continuacao' },
  });
  if (error) log('WARN', `Falha ao enfileirar continuação: ${error.message}`);
}

async function main() {
  const geo = await carregarGeocodificador();
  const { geocodificarEndereco, ehAvisoDeFalha, MENSAGEM_FALHA, normKey } = geo;
  const estado = { nominatimBloqueadoAte: 0 };
  let ultimaChamada = 0;
  const aguardar = async () => {
    const espera = ultimaChamada + NOMINATIM_DELAY_MS - Date.now();
    if (espera > 0) await sleep(espera);
    ultimaChamada = Date.now();
  };

  // Busca com cache compartilhado com a função de borda (geocode_cache, chave uber_endereco:).
  async function buscar(endereco) {
    const chave = `${PREFIXO_CHAVE}${normKey(endereco)}`;
    const { data: cache, error: erroLeitura } = await supabase
      .from('geocode_cache')
      .select('latitude,longitude,endereco_resolvido,status,atualizado_em')
      .eq('chave', chave)
      .maybeSingle();
    if (erroLeitura) log('WARN', `Falha ao ler cache: ${erroLeitura.message}`);
    if (cache?.status === 'ok' && cache.latitude != null && cache.longitude != null) {
      return {
        result: { lat: Number(cache.latitude), lng: Number(cache.longitude), display: cache.endereco_resolvido || '', query: 'cache', provider: 'cache', precisao: 'endereco' },
        error: null,
        definitive: true,
      };
    }
    if (cache?.status === 'erro') {
      const quando = cache.atualizado_em ? new Date(cache.atualizado_em).getTime() : 0;
      if (quando > Date.now() - ERRO_RETRY_HORAS * 60 * 60 * 1000) return { result: null, error: null, definitive: true };
    }

    const busca = await geocodificarEndereco(endereco, { aguardar, estado, userAgent: USER_AGENT, email: 'tecnologia@grao1000.com.br', maxPhoton: 3 });
    // Só vira cache o que é resposta firme: achou, ou nenhum provedor falhou nem ficou de fora.
    if (!DRY_RUN && (busca.result || (busca.definitive && !busca.error))) {
      const { error } = await supabase.from('geocode_cache').upsert({
        chave,
        tipo: 'cidade', // geocode_cache tem um CHECK legado só com "cep" e "cidade"
        latitude: busca.result?.lat ?? null,
        longitude: busca.result?.lng ?? null,
        endereco_resolvido: busca.result?.display ?? null,
        status: busca.result ? 'ok' : 'erro',
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'chave' });
      if (error) log('WARN', `Falha ao gravar cache: ${error.message}`);
    }
    return busca;
  }

  async function processar(item) {
    const { data: corrida, error: erroCorrida } = await supabase
      .from('conferencia_uber_corridas')
      .select('id,endereco_partida,endereco_destino,partida_latitude,partida_longitude,destino_latitude,destino_longitude,observacao_validacao')
      .eq('id', item.corrida_id)
      .maybeSingle();
    if (erroCorrida || !corrida) {
      return { status: 'ERRO', motivo: 'corrida_nao_encontrada', detalhe: erroCorrida?.message || 'Corrida não encontrada.' };
    }
    if (!corrida.endereco_partida) {
      return { status: 'NAO_LOCALIZADO', motivo: 'sem_endereco', detalhe: 'Sem endereço de partida.' };
    }

    const jaTem = corrida.partida_latitude != null && corrida.partida_longitude != null;
    const partida = jaTem
      ? { result: { lat: Number(corrida.partida_latitude), lng: Number(corrida.partida_longitude), display: '', query: 'banco', provider: 'banco', precisao: 'endereco' }, error: null, definitive: true }
      : await buscar(corrida.endereco_partida);
    const geoPartida = partida.result;

    const atualizar = {};
    if (geoPartida && !jaTem) {
      atualizar.partida_latitude = geoPartida.lat;
      atualizar.partida_longitude = geoPartida.lng;
    }
    if (item.incluir_destino && corrida.endereco_destino && (corrida.destino_latitude == null || corrida.destino_longitude == null)) {
      const destino = (await buscar(corrida.endereco_destino)).result;
      if (destino) { atualizar.destino_latitude = destino.lat; atualizar.destino_longitude = destino.lng; }
    }

    const motivoFalha = partida.motivo === 'endereco_incompleto' ? 'endereco_incompleto'
      : partida.motivo === 'busca_parcial' ? 'busca_parcial'
        : partida.error ? 'provedor_indisponivel' : 'endereco_nao_localizado';
    if (!geoPartida) {
      atualizar.observacao_validacao = MENSAGEM_FALHA[motivoFalha];
    } else if (ehAvisoDeFalha(String(corrida.observacao_validacao || ''))) {
      atualizar.observacao_validacao = null; // aviso de uma tentativa anterior que não vale mais
    }

    if (DRY_RUN) {
      log('INFO', `DRY_RUN: ${corrida.endereco_partida} => ${geoPartida ? `${geoPartida.lat},${geoPartida.lng} (${geoPartida.provider}/${geoPartida.precisao})` : motivoFalha}`);
      return { status: geoPartida ? 'OK' : 'NAO_LOCALIZADO', motivo: geoPartida ? null : motivoFalha, simulado: true };
    }

    if (Object.keys(atualizar).length) {
      atualizar.updated_at = new Date().toISOString();
      const { error } = await supabase.from('conferencia_uber_corridas').update(atualizar).eq('id', corrida.id);
      if (error) return { status: 'ERRO', motivo: 'falha_ao_salvar', detalhe: `Falha ao salvar coordenadas: ${error.message}` };
    }

    if (!geoPartida) {
      return { status: 'NAO_LOCALIZADO', motivo: motivoFalha, detalhe: partida.error || null };
    }

    const { data: validacao, error: erroValidacao } = await supabase.rpc('uber_validar_por_os_laudo', { p_id: corrida.id });
    if (erroValidacao) {
      return { status: 'ERRO', motivo: 'falha_na_validacao', detalhe: erroValidacao.message, provedor: geoPartida.provider, precisao: geoPartida.precisao };
    }
    return { status: 'OK', provedor: geoPartida.provider, precisao: geoPartida.precisao, resultado: validacao || null };
  }

  await recuperarTravadas();
  const inicio = Date.now();
  const totais = { processadas: 0, ok: 0, validadas: 0, nao_localizadas: 0, erros: 0 };

  while (Date.now() - inicio < ORCAMENTO_MS) {
    const lote = await proximoLote();
    if (!lote.length) break;
    for (const item of lote) {
      if (Date.now() - inicio >= ORCAMENTO_MS) break;
      if (!DRY_RUN) {
        await atualizarFila(item.id, { status: 'PROCESSANDO', tentativas: Number(item.tentativas || 0) + 1, iniciado_em: new Date().toISOString() });
      }
      let resultado;
      try {
        resultado = await processar(item);
      } catch (error) {
        resultado = { status: 'ERRO', motivo: 'excecao', detalhe: String(error?.message || error).slice(0, 500) };
        log('ERROR', `Corrida ${item.corrida_id}: ${resultado.detalhe}`);
      }
      totais.processadas += 1;
      if (resultado.status === 'OK') { totais.ok += 1; if (resultado.resultado?.validado) totais.validadas += 1; }
      else if (resultado.status === 'NAO_LOCALIZADO') totais.nao_localizadas += 1;
      else totais.erros += 1;

      if (DRY_RUN) {
        // não mexe na fila: o lote seguinte devolveria o mesmo item, então só um lote vale no teste
        continue;
      }
      await atualizarFila(item.id, {
        status: resultado.status,
        motivo: resultado.motivo ?? null,
        detalhe: resultado.detalhe ?? null,
        provedor: resultado.provedor ?? null,
        precisao: resultado.precisao ?? null,
        resultado: resultado.resultado ?? null,
        processado_em: new Date().toISOString(),
      });
    }
    if (DRY_RUN) break;
  }

  if (!DRY_RUN) await agendarContinuacao();
  log(totais.erros ? 'WARN' : 'SUCCESS', 'Agente de conversão de GPS do Uber concluído.', { ...totais, dry_run: DRY_RUN, segundos: Math.round((Date.now() - inicio) / 1000) });
  if (totais.erros > 0) process.exitCode = 1;
}

main().catch((error) => {
  log('ERROR', `Erro fatal no agente de conversão de GPS do Uber: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
