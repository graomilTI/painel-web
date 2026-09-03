#!/usr/bin/env node

/**
 * Busca automaticamente a NF de itens de compra em `aguardando_nf` via API do
 * Espião NF-e Cloud (monitora a SEFAZ pelo certificado digital da empresa já
 * cadastrado lá) e:
 *   - anexa sozinho (RPC confirmar_nf_sugerida) SOMENTE quando o item tem
 *     `fornecedor_cnpj` conhecido e ele bate com exatamente 1 candidato;
 *   - senão grava a melhor candidata em `nf_sugestao` (nf_busca_status =
 *     'sugestao_pendente') pra confirmação manual em Compras ADM > aba NF.
 *
 * Uma rodada = uma consulta agregada em /consulta/periodo/nfe-resumo cobrindo
 * a janela de todos os itens pendentes do lote (não uma chamada por item).
 * Desiste (nf_busca_status = 'sem_match') depois de
 * GRM_COMPRAS_NF_JANELA_DESISTENCIA_DIAS dias sem achar nada — o item
 * continua disponível para anexo manual como sempre.
 *
 * Ver plano: C:\Users\graom\.claude\plans\swift-meandering-toucan.md
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SB_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ESPIAO_BASE_URL = 'https://api.espiaonfe.com.br';
const ESPIAO_TOKEN = process.env.ESPIAO_CLOUD_TOKEN || '';
const ESPIAO_USER_TOKEN = process.env.ESPIAO_CLOUD_USER_TOKEN || '';
const ESPIAO_CNPJ_CONTA = digits(process.env.ESPIAO_CLOUD_CNPJ_CONTA || '');

const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_COMPRAS_NF_DRY_RUN ?? 'true').toLowerCase() !== 'false';
const DEBUG = String(process.env.GRM_COMPRAS_NF_DEBUG ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_COMPRAS_NF_MAX_POR_EXECUCAO || 30));
const JANELA_DESISTENCIA_DIAS = Math.max(1, Number(process.env.GRM_COMPRAS_NF_JANELA_DESISTENCIA_DIAS || 30));
const MODELOS = ['55', '65']; // NF-e e NFC-e — cobre fornecedores tipo Mercado Livre também

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parseValor(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(n)) return n;
  const n2 = Number(v);
  return Number.isFinite(n2) ? n2 : null;
}

function isoDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d || '').slice(0, 10);
}

function diasEntre(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function safeFileName(name) {
  return String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

// ─── Cliente Espião NF-e Cloud ─────────────────────────────────────────────
function espiaoHeaders() {
  return {
    'esp-cloud-token': ESPIAO_TOKEN,
    'user-token': ESPIAO_USER_TOKEN,
  };
}

// Descoberto ao vivo (03/09): a API devolve HTTP 429 "API calls quota
// exceeded! maximum admitted 3 per 1s" sem aviso na doc. Serializa as
// chamadas com um intervalo mínimo entre elas pra nunca estourar 3 req/s.
const ESPIAO_MIN_INTERVALO_MS = 400;
let espiaoUltimaChamadaEm = 0;

async function espiaoThrottle() {
  const espera = espiaoUltimaChamadaEm + ESPIAO_MIN_INTERVALO_MS - Date.now();
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
  espiaoUltimaChamadaEm = Date.now();
}

async function espiaoGet(path, params, { tentativa = 1, allow404 = false } = {}) {
  await espiaoThrottle();
  const url = new URL(ESPIAO_BASE_URL + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url, { headers: espiaoHeaders() });
  if (res.status === 429 && tentativa <= 3) {
    log('WARN', `Espião NF-e ${path} -> HTTP 429, aguardando e tentando de novo (tentativa ${tentativa}).`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * tentativa));
    return espiaoGet(path, params, { tentativa: tentativa + 1, allow404 });
  }
  // A consulta por período devolve 404 "Não localizado" (em vez de dados:[])
  // quando não há nenhuma nota no filtro — descoberto ao vivo em 03/09.
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Espião NF-e ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

async function fetchResumoPeriodo({ dataInicial, dataFinal, modelo }) {
  const dados = [];
  let codigoProximaPagina;
  let paginas = 0;
  do {
    const res = await espiaoGet('/v1-cloud/consulta/periodo/nfe-resumo', {
      cnpjCpf: ESPIAO_CNPJ_CONTA,
      dataInicial,
      dataFinal,
      situacao: '1', // autorizadas
      emitidaRecebida: '0', // recebidas
      modelo,
      codigoProximaPagina,
    }, { allow404: true });
    if (!res) break; // sem notas nesse filtro
    const json = await res.json();
    (json?.dados || []).forEach((d) => dados.push(d));
    codigoProximaPagina = json?.codigoProximaPagina || null;
    paginas += 1;
  } while (codigoProximaPagina && paginas < 50);
  return dados;
}

async function baixarXml(chaveAcesso) {
  const res = await espiaoGet('/v1-cloud/consulta/chave/xml', { chaveAcesso });
  return res.text();
}

async function baixarPdf(chaveAcesso) {
  const res = await espiaoGet('/v1-cloud/consulta/chave/pdf', { chaveAcesso });
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

function extrairDescricoesProduto(xmlText) {
  const matches = [...String(xmlText || '').matchAll(/<xProd>([^<]*)<\/xProd>/gi)];
  return matches.map((m) => m[1]);
}

function scoreMaterial(material, descricoes) {
  const alvo = new Set(norm(material).split(' ').filter((w) => w.length > 2));
  if (!alvo.size || !descricoes.length) return 0;
  let melhor = 0;
  for (const desc of descricoes) {
    const palavras = new Set(norm(desc).split(' ').filter((w) => w.length > 2));
    if (!palavras.size) continue;
    const inter = [...alvo].filter((w) => palavras.has(w)).length;
    const score = inter / alvo.size;
    if (score > melhor) melhor = score;
  }
  return melhor;
}

// ─── Storage ────────────────────────────────────────────────────────────────
async function uploadNfArquivo(chaveAcesso, ext, buffer, contentType) {
  const ano = new Date().getFullYear();
  const path = `compras/nf-auto/${ano}/${safeFileName(chaveAcesso)}.${ext}`;
  const { error } = await supabase.storage.from('notas-fiscais').upload(path, buffer, { upsert: true, contentType });
  if (error) throw new Error(`Falha ao enviar ${ext.toUpperCase()} da NF ${chaveAcesso}: ${error.message}`);
  const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}

// ─── Matching ───────────────────────────────────────────────────────────────
function candidatosParaItem(item, candidatosPeriodo) {
  const comprado = item.comprado_em || item.created_at;
  const rejeitadas = new Set(item.nf_sugestoes_rejeitadas || []);
  const valorItem = Number(item.valor_total || 0);
  const toleranciaValor = Math.max(0.01 * valorItem, 1);
  return candidatosPeriodo.filter((c) => {
    if (!c.chaveAcesso || rejeitadas.has(c.chaveAcesso)) return false;
    const valorNf = parseValor(c.valorTotal);
    if (valorNf == null || Math.abs(valorNf - valorItem) > toleranciaValor) return false;
    if (comprado && c.dataEmissao) {
      const emissao = isoDate(c.dataEmissao);
      const compradoIso = isoDate(comprado);
      if (emissao < compradoIso && diasEntre(emissao, compradoIso) > 2) return false;
    }
    return true;
  });
}

async function decidirMatch(item, candidatos) {
  if (!candidatos.length) return null;

  if (item.fornecedor_cnpj) {
    const cnpjItem = digits(item.fornecedor_cnpj);
    const porCnpj = candidatos.filter((c) => digits(c.cnpjCpfEmitente) === cnpjItem);
    if (porCnpj.length === 1) {
      return { candidato: porCnpj[0], auto: true, criterios: ['cnpj', 'valor', 'data'], score: 1 };
    }
  }

  if (candidatos.length === 1) {
    return { candidato: candidatos[0], auto: false, criterios: ['valor', 'data'], score: 0.6 };
  }

  // Mais de um candidato e sem CNPJ decisivo: desempata pela descrição do
  // produto na XML completa (só baixa XML aqui, nunca antes).
  let melhor = null;
  for (const c of candidatos.slice(0, 5)) {
    try {
      const xml = await baixarXml(c.chaveAcesso);
      const descricoes = extrairDescricoesProduto(xml);
      const score = scoreMaterial(item.material, descricoes);
      if (!melhor || score > melhor.score) melhor = { candidato: c, score, criterios: ['valor', 'data', 'material_xml'] };
    } catch (e) {
      log('WARN', `Falha ao baixar XML de desempate ${c.chaveAcesso}: ${e.message}`);
    }
  }
  // Sem nenhuma sobreposição de palavras com a descrição do produto, o
  // "melhor" candidato não passa de um chute entre empatados por valor+data
  // — com centenas/milhares de notas no período, isso é ruído, não sugestão.
  // Descoberto ao vivo em 03/09 (2 itens com score 0 no primeiro teste real).
  const LIMIAR_MINIMO_DESEMPATE = 0.15;
  if (!melhor || melhor.score < LIMIAR_MINIMO_DESEMPATE) return null;
  return { candidato: melhor.candidato, auto: false, criterios: melhor.criterios, score: melhor.score };
}

// ─── Persistência ───────────────────────────────────────────────────────────
async function aplicarSugestao(item, decisao) {
  const { candidato, auto, criterios, score } = decisao;
  const [xmlText, pdfBuffer] = await Promise.all([
    baixarXml(candidato.chaveAcesso).catch((e) => { log('WARN', `XML indisponível p/ ${candidato.chaveAcesso}: ${e.message}`); return null; }),
    baixarPdf(candidato.chaveAcesso).catch((e) => { log('WARN', `PDF indisponível p/ ${candidato.chaveAcesso}: ${e.message}`); return null; }),
  ]);

  let xmlUrl = null;
  let pdfUrl = null;
  if (!DRY_RUN) {
    if (xmlText) xmlUrl = await uploadNfArquivo(candidato.chaveAcesso, 'xml', xmlText, 'application/xml');
    if (pdfBuffer) pdfUrl = await uploadNfArquivo(candidato.chaveAcesso, 'pdf', pdfBuffer, 'application/pdf');
  }

  const sugestao = {
    chaveAcesso: candidato.chaveAcesso,
    cnpjEmitente: candidato.cnpjCpfEmitente || null,
    nomeEmitente: candidato.nomeEmitente || null,
    valorTotal: parseValor(candidato.valorTotal),
    dataEmissao: candidato.dataEmissao || null,
    xmlUrl,
    pdfUrl,
    score,
    criterios,
    geradaEm: new Date().toISOString(),
  };

  if (DRY_RUN) {
    log('INFO', `[dry-run] item ${item.id} (${item.material}) -> ${auto ? 'auto-anexaria' : 'sugeriria'} NF ${candidato.chaveAcesso}`, { criterios, score });
    return;
  }

  if (auto) {
    const { error: updErr } = await supabase.from('compras_itens').update({
      nf_sugestao: sugestao,
      nf_busca_status: 'sugestao_pendente',
      nf_busca_ultima_em: new Date().toISOString(),
    }).eq('id', item.id);
    if (updErr) throw updErr;
    const { data, error } = await supabase.rpc('confirmar_nf_sugerida', { p_item_id: item.id, p_aceitar: true, p_usuario: 'agente-espiao-nfe' });
    if (error) throw error;
    log('SUCCESS', `Item ${item.id} (${item.material}) auto-anexado: NF ${candidato.chaveAcesso} (CNPJ bateu).`);
    return data;
  }

  const { error } = await supabase.from('compras_itens').update({
    nf_sugestao: sugestao,
    nf_busca_status: 'sugestao_pendente',
    nf_busca_ultima_em: new Date().toISOString(),
  }).eq('id', item.id);
  if (error) throw error;
  log('SUCCESS', `Item ${item.id} (${item.material}): sugestão de NF ${candidato.chaveAcesso} registrada para confirmação manual.`, { criterios, score });
}

async function marcarSemCandidato(item) {
  if (DRY_RUN) { log('INFO', `[dry-run] item ${item.id} sem candidato nesta rodada.`); return; }
  const iniciada = item.nf_busca_iniciada_em || item.comprado_em || item.created_at;
  const desistir = diasEntre(iniciada, new Date()) > JANELA_DESISTENCIA_DIAS;
  const { error } = await supabase.from('compras_itens').update({
    nf_busca_status: desistir ? 'sem_match' : 'buscando',
    nf_busca_iniciada_em: item.nf_busca_iniciada_em || iniciada,
    nf_busca_ultima_em: new Date().toISOString(),
  }).eq('id', item.id);
  if (error) throw error;
  if (desistir) log('WARN', `Item ${item.id} (${item.material}): sem match após ${JANELA_DESISTENCIA_DIAS} dias — desistindo da busca automática.`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', `Iniciando agente compras-match-nf (dry_run=${DRY_RUN}, max=${MAX_PER_RUN}).`);
  if (!ESPIAO_TOKEN || !ESPIAO_USER_TOKEN || !ESPIAO_CNPJ_CONTA) {
    throw new Error('ESPIAO_CLOUD_TOKEN / ESPIAO_CLOUD_USER_TOKEN / ESPIAO_CLOUD_CNPJ_CONTA não configurados.');
  }

  const { data: itens, error } = await supabase
    .from('compras_itens')
    .select('id, material, tipo, valor_total, fornecedor, fornecedor_cnpj, comprado_em, created_at, nf_busca_status, nf_busca_iniciada_em, nf_sugestoes_rejeitadas')
    .eq('status', 'aguardando_nf')
    .is('nf_url', null)
    .in('nf_busca_status', ['nunca_buscado', 'buscando'])
    .order('comprado_em', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;

  if (!itens.length) {
    log('INFO', 'Nenhum item aguardando_nf elegível nesta rodada.');
    return { processados: 0 };
  }

  const hoje = isoDate(new Date());
  // A API rejeita período > 31 dias (HTTP 400 "O período não pode ser
  // superior a 31 dias") — descoberto ao vivo em teste real. Itens com
  // comprado_em mais antigo que isso já passam do prazo de desistência de
  // qualquer forma (marcarSemCandidato aplica a mesma regra dos 30 dias
  // independente do que a API retornar), então só limitamos a janela da
  // consulta, sem excluir nenhum item da rodada.
  const LIMITE_API_DIAS = 30;
  const limiteInferior = isoDate(new Date(Date.now() - LIMITE_API_DIAS * 86400000));
  const datasBase = itens.map((i) => isoDate(i.comprado_em || i.created_at)).filter(Boolean);
  const dataInicialDesejada = datasBase.sort()[0] || hoje;
  const dataInicial = dataInicialDesejada < limiteInferior ? limiteInferior : dataInicialDesejada;

  log('INFO', `Consultando Espião NF-e Cloud: ${dataInicial} até ${hoje} (${itens.length} item(ns) pendente(s), janela desejada desde ${dataInicialDesejada}).`);
  let candidatosPeriodo = [];
  for (const modelo of MODELOS) {
    const dados = await fetchResumoPeriodo({ dataInicial, dataFinal: hoje, modelo });
    candidatosPeriodo = candidatosPeriodo.concat(dados);
  }
  log('INFO', `${candidatosPeriodo.length} nota(s) recebida(s) no período (modelos ${MODELOS.join(',')}).`);

  let sugeridos = 0;
  let autoAnexados = 0;
  let semMatch = 0;

  for (const item of itens) {
    // Marca início da busca na primeira vez que o item é processado.
    if (!item.nf_busca_iniciada_em && !DRY_RUN) {
      await supabase.from('compras_itens').update({ nf_busca_iniciada_em: new Date().toISOString(), nf_busca_status: 'buscando' }).eq('id', item.id);
    }

    const candidatos = candidatosParaItem(item, candidatosPeriodo);
    if (!candidatos.length) {
      await marcarSemCandidato(item);
      semMatch += 1;
      continue;
    }

    try {
      const decisao = await decidirMatch(item, candidatos);
      if (!decisao) { await marcarSemCandidato(item); semMatch += 1; continue; }
      await aplicarSugestao(item, decisao);
      if (decisao.auto) autoAnexados += 1; else sugeridos += 1;
    } catch (e) {
      log('ERROR', `Item ${item.id} (${item.material}): ${e.message}`);
    }
  }

  const resumo = { processados: itens.length, autoAnexados, sugeridos, semMatch };
  log('SUCCESS', 'Agente concluído.', resumo);
  return resumo;
}

module.exports = { main, candidatosParaItem, decidirMatch, scoreMaterial, extrairDescricoesProduto, parseValor };

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    log('ERROR', `Erro fatal: ${error.message}`, { stack: error.stack });
    process.exitCode = 1;
    process.exit(1);
  });
}
