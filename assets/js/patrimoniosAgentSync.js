// Sincroniza patrimonios_snapshot/patrimonios_historico_leituras a partir do agente
// sync-patrimonios (tabela grm_patrimonios_importacoes), replicando o mesmo mapeamento
// de campos e efeitos colaterais que a importação manual de planilha já faz em
// importarPatrimonios.js — para os dois caminhos produzirem o mesmo resultado.
import { supabase } from './supabaseClient.js';

const COL = {
  patrimonioCodigo: ['Patrimônio', 'Patrimonio'],
  coordenacao: ['Coordenação', 'Coordenacao'],
  supervisao: ['Supervisão', 'Supervisao'],
  funcionario: ['Funcionário', 'Funcionario'],
  identificacao: ['Identificação', 'Identificacao'],
  categoria: ['Categoria'],
  marca: ['Marca'],
  modelo: ['Modelo'],
  dataAquisicao: ['Data de Aquisição', 'Data de Aquisicao'],
  dataRegistro: ['Data de Registro'],
  situacao: ['Situação', 'Situacao'],
  ultimaLeitura: ['Ultima Leitura', 'Última Leitura'],
  diasSemLeitura: ['Dias sem Leitura'],
};

// lote mínimo aceitável: o agente recarrega a tabela inteira a cada sincronização
// (~2.836 linhas nas últimas execuções); um lote muito menor indica sync parcial/falho
// e não deve sobrescrever o snapshot atual.
const LOTE_MINIMO = 1000;

function normalizeKeyAgente(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getFieldAgente(row, aliases = []) {
  if (!row) return null;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const map = new Map();
  Object.keys(row).forEach((key) => map.set(normalizeKeyAgente(key), row[key]));
  for (const alias of aliases) {
    const hit = map.get(normalizeKeyAgente(alias));
    if (hit !== undefined) return hit;
  }
  return null;
}

function normalizeTextAgente(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeIntegerAgente(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).replace(/[^\d-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizePatrimonioCodigoAgente(value) {
  return normalizeTextAgente(value)?.trim().toUpperCase() || null;
}

function dateTimeToIsoAgente(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const brDateTime = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDateTime) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = brDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }
  const isoDateTime = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoDateTime) {
    const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = isoDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }
  return null;
}

function mapAgentRow(d, dataUpload) {
  const patrimonioCodigo = normalizePatrimonioCodigoAgente(getFieldAgente(d, COL.patrimonioCodigo));
  return {
    data_upload: dataUpload,
    patrimonio_codigo: patrimonioCodigo,
    coordenacao: normalizeTextAgente(getFieldAgente(d, COL.coordenacao)),
    supervisao: normalizeTextAgente(getFieldAgente(d, COL.supervisao)),
    funcionario: normalizeTextAgente(getFieldAgente(d, COL.funcionario)),
    identificacao: normalizeTextAgente(getFieldAgente(d, COL.identificacao)),
    categoria: normalizeTextAgente(getFieldAgente(d, COL.categoria)),
    marca: normalizeTextAgente(getFieldAgente(d, COL.marca)),
    modelo: normalizeTextAgente(getFieldAgente(d, COL.modelo)),
    data_aquisicao: dateTimeToIsoAgente(getFieldAgente(d, COL.dataAquisicao)),
    data_registro: dateTimeToIsoAgente(getFieldAgente(d, COL.dataRegistro)),
    situacao: normalizeTextAgente(getFieldAgente(d, COL.situacao)),
    ultima_leitura: dateTimeToIsoAgente(getFieldAgente(d, COL.ultimaLeitura)),
    dias_sem_leitura: normalizeIntegerAgente(getFieldAgente(d, COL.diasSemLeitura)),
    hash_linha: patrimonioCodigo,
  };
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertBatches(table, rows, batchSize, onConflict) {
  for (const chunk of chunkArray(rows, batchSize)) {
    const query = onConflict
      ? supabase.from(table).upsert(chunk, { onConflict })
      : supabase.from(table).insert(chunk);
    const { error } = await query;
    if (error) throw error;
  }
}

async function buscarUltimoLotePatrimoniosAgente(limite = 10000) {
  const { data: maxRows, error: maxErr } = await supabase
    .from('grm_patrimonios_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
  if (maxErr) throw maxErr;
  const maxCreatedAt = maxRows?.[0]?.created_at;
  if (!maxCreatedAt) return [];
  // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente.
  const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('grm_patrimonios_importacoes').select('dados_json').gte('created_at', threshold).limit(limite);
  if (error) throw error;
  return (data || []).map((row) => row.dados_json);
}

// Associação de regional dos veículos pela placa lida na "Identificação" — réplica do
// que importarPatrimonios.js faz para upload manual (sincronizarRegionaisVeiculosPorLeitura).
const LETRA_PARA_DIGITO = { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9' };

function placaKey(value) {
  const p = String(value || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (p.length !== 7) return p;
  const c4 = p[4];
  return LETRA_PARA_DIGITO[c4] !== undefined ? p.slice(0, 4) + LETRA_PARA_DIGITO[c4] + p.slice(5) : p;
}

function extrairPlacasKeys(texto) {
  const s = String(texto || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = s.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/g) || [];
  return [...new Set(matches.map(placaKey))].filter((k) => k.length === 7);
}

function dataMs(value) {
  const t = value ? Date.parse(value) : 0;
  return Number.isFinite(t) ? t : 0;
}

async function ajustarRegionalVeiculosPorLeitura(rows) {
  const leituras = rows
    .filter((row) => row.coordenacao && row.identificacao)
    .flatMap((row) => extrairPlacasKeys(row.identificacao).map((key) => ({
      key, coordenacao: row.coordenacao, ultima_leitura: row.ultima_leitura, data_upload: row.data_upload,
    })));
  if (!leituras.length) return 0;

  const { data: veiculos, error } = await supabase
    .from('frotas_veiculos').select('id,placa,coordenacao,status').eq('status', 'ATIVO').limit(10000);
  if (error) throw error;

  const porPlaca = new Map((veiculos || []).map((v) => [placaKey(v.placa), v]));
  const melhorPorVeiculo = new Map();
  leituras.forEach((leitura) => {
    const veiculo = porPlaca.get(leitura.key);
    if (!veiculo) return;
    const atual = melhorPorVeiculo.get(veiculo.id);
    const novaData = Math.max(dataMs(leitura.ultima_leitura), dataMs(leitura.data_upload));
    const atualData = atual ? Math.max(dataMs(atual.ultima_leitura), dataMs(atual.data_upload)) : -1;
    if (!atual || novaData >= atualData) melhorPorVeiculo.set(veiculo.id, { ...leitura, veiculo });
  });

  let atualizados = 0;
  for (const { veiculo, coordenacao } of melhorPorVeiculo.values()) {
    if (veiculo.coordenacao === coordenacao) continue;
    const { error: updError } = await supabase.from('frotas_veiculos').update({ coordenacao }).eq('id', veiculo.id);
    if (!updError) atualizados += 1;
  }
  return atualizados;
}

let sincronizando = null;

export async function sincronizarPatrimoniosDoAgente() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const dadosBrutos = await buscarUltimoLotePatrimoniosAgente();
      if (dadosBrutos.length < LOTE_MINIMO) {
        console.warn(`[patrimonios-agente] lote do agente pequeno demais (${dadosBrutos.length} linhas); sincronização ignorada para não sobrescrever a base atual.`);
        return { ignorado: true, linhas: dadosBrutos.length };
      }

      const dataUpload = new Date().toISOString();
      const mappedRaw = dadosBrutos.map((d) => mapAgentRow(d, dataUpload)).filter((row) => row.patrimonio_codigo);
      const uniqueMap = new Map();
      mappedRaw.forEach((row) => uniqueMap.set(row.patrimonio_codigo, row));
      const mapped = [...uniqueMap.values()];

      const { error: limparError } = await supabase.rpc('limpar_patrimonios_snapshot');
      if (limparError) throw limparError;
      await upsertBatches('patrimonios_snapshot', mapped, 500, 'patrimonio_codigo');

      // histórico diário: só grava uma vez por dia (o agente sincroniza a cada ~20min,
      // bem mais frequente que um upload manual; não queremos repetir o lote a cada sync).
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('patrimonios_historico_leituras')
        .select('id', { count: 'exact', head: true })
        .gte('data_upload', inicioHoje.toISOString());
      if (!count) await upsertBatches('patrimonios_historico_leituras', mapped, 500, null);

      let veiculosAtualizados = 0;
      try {
        veiculosAtualizados = await ajustarRegionalVeiculosPorLeitura(mapped);
      } catch (error) {
        console.warn('[patrimonios-agente] falha ao ajustar regional dos veículos', error);
      }

      try {
        await supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
      } catch (error) {
        console.warn('[patrimonios-agente] falha ao associar patrimônios aos veículos', error);
      }

      console.info(`[patrimonios-agente] sincronização automática: ${mapped.length} patrimônios, ${veiculosAtualizados} regionais de veículo ajustadas.`);
      return { ignorado: false, linhas: mapped.length, veiculosAtualizados };
    } catch (error) {
      console.warn('[patrimonios-agente] falha na sincronização automática', error);
      return { ignorado: true, erro: error?.message };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}
