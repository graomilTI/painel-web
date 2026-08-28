import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 1000;
// Quantas páginas buscar em paralelo por tabela. Antes o fetch paginava em
// série (Produção = 30 idas-e-voltas em fila só ela), dominando o tempo de
// carregamento. Buscar em ondas concorrentes derruba o tempo pra ~nº de ondas.
const PAGE_CONCURRENCY = 6;
const MAX_MOV_ROWS = 20000;
const MAX_PROD_ROWS = 30000;
const MAX_NHE_ROWS = 15000;
// Janela (dias) que a RPC fob_lote_recente devolve. Um lote só pode conter
// linhas da data de referência (ontem) se foi criado nessa data ou depois, então
// 3 dias cobrem TODOS os lotes candidatos com folga — o cliente segue rodando
// splitBatches/chooseBatch inalterado sobre o resultado. Ver migração
// fob_lote_recente_rpc.
const FOB_JANELA_DIAS = 3;
const BR_INT = new Intl.NumberFormat('pt-BR');

const state = {
  user: null,
  rows: [],
  stats: null,
  fob: [],
  warnings: [],
  loading: false,
  activeTab: 'OK',
  historyTab: 'PENDENTE',
};

// Abas do resultado, na ordem pedida (Ok | Dois Embarques | Pendente | Fora do Raio).
const FOB_TABS = [
  ['OK', 'Ok', '#bbf7d0'],
  ['DOIS EMBARQUES', 'Dois Embarques', '#fde68a'],
  ['PENDENTE', 'Pendente', '#fecaca'],
  // "Fora do Raio" não vem da comparação Movimentação/Produção/NHE — são O.S.
  // que o bot de lançamento automático (grm-sync-lancar-nhe.js) lançou em
  // nome do GESTOR da regional porque o colaborador que fez o informativo
  // estava fora do raio de 2km da O.S. Existe pra o setor acompanhar quais
  // classificadores mostram esse padrão (pedido do usuário, 2026-07-21).
  ['FORA_DO_RAIO', 'Fora do Raio', '#fdba74'],
];

// Abas do histórico salvo em logistica_fob (fila de revisão do gestor —
// pedido do usuário, 2026-07-21: "Pendente | Ok | Recusado". PENDENTE = veio
// da comparação automática e ainda não foi conferido; VALIDO = gestor deu Ok
// (botão ✓); INVALIDO = gestor recusou (botão ✕).
const HISTORY_TABS = [
  ['PENDENTE', 'Pendente', '#fecaca'],
  ['VALIDO', 'Ok', '#bbf7d0'],
  ['INVALIDO', 'Recusado', '#fca5a5'],
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normHeader(value) {
  return stripAccents(value)
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function normText(value) {
  return stripAccents(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normOs(value) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d+(\.0+)?$/.test(text)) text = text.replace(/\.0+$/, '');
  if (text.includes('/')) text = text.split('/')[0].trim();
  return text.replace(/\s+/g, ' ').trim();
}

function normalizedRow(raw) {
  const output = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    output[normHeader(key)] = value;
  });
  return output;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normHeader(alias);
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return '';
}

function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function ymd(value) {
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function brDate(value) {
  const date = parseDateOnly(value);
  if (!date) return '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function toNumberLoose(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text || text === '--') return 0;
  const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function referenceDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date;
}

function referenceIso() { return ymd(referenceDate()); }
function referenceBr() { return brDate(referenceDate()); }

// Esta página NÃO está na navegação suave do router (é reload completo a cada
// troca de tela) — sair e voltar destrói o DOM/estado e a tela ficava em
// branco ("Carregando fechamento...") até o fetch terminar de novo, mesmo que
// o resultado já tivesse sido calculado há poucos minutos. sessionStorage
// (dura enquanto a aba do navegador ficar aberta, some ao fechar) guarda o
// último resultado bem-sucedido pra pintar a tela na hora ao reabrir a página,
// enquanto uma atualização roda por trás sem apagar o que já está visível.
const REPORT_CACHE_KEY = 'fob_v9_report_cache_v2_sem_carga_ponto';

function readReportCache() {
  try {
    const raw = sessionStorage.getItem(REPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.referenceIso !== referenceIso() || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeReportCache() {
  try {
    sessionStorage.setItem(REPORT_CACHE_KEY, JSON.stringify({
      referenceIso: referenceIso(),
      rows: state.rows,
      stats: state.stats,
      warnings: state.warnings,
      activeTab: state.activeTab,
      ts: Date.now(),
    }));
  } catch (_) {
    // Sem espaço/indisponível: segue sem cache, próxima visita carrega normal.
  }
}

function movementDate(row) {
  // O Apps Script atribui COL_MOV.Data à coluna "Última Atualização".
  return ymd(pick(row, [
    'Última Atualização',
    'Ultima Atualizacao',
    'Última Atualizacao',
    'Ultima Atualização',
  ]));
}

function serviceDate(row) {
  // 'lnsDate' cobre grm_nhe_importacoes desde 05/08/2026, quando o sync desse
  // agente passou a gravar o formato bruto da API do GRM (sorCode/lnsDate/...)
  // em vez do cabeçalho em português do Excel antigo (O.S./Data/...) — sem
  // esse alias, toda linha de NHE virava invisível pro cálculo de pendência
  // (achado investigando a O.S. 90394, 28/08/2026: NHE lançado e confirmado
  // no GRM, mas nunca aparecia como Ok porque essa função não lia a data).
  return ymd(pick(row, ['Data', 'lnsDate', 'Última Atualização', 'Ultima Atualizacao']));
}

async function fetchPaged(builder, maxRows) {
  const rows = [];
  const waveSpan = PAGE_SIZE * PAGE_CONCURRENCY;
  // Busca as páginas em ondas concorrentes (em vez de uma a uma em série).
  // Preserva a ordem original (results[] mantém a ordem das páginas) e ainda
  // corta cedo quando uma página vem incompleta = fim da tabela — assim uma
  // tabela pequena não dispara ondas de requests vazios.
  for (let waveStart = 0; waveStart < maxRows; waveStart += waveSpan) {
    const requests = [];
    for (let from = waveStart; from < waveStart + waveSpan && from < maxRows; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
      requests.push(builder(from, to));
    }
    const results = await Promise.all(requests);
    let reachedEnd = false;
    for (const { data, error } of results) {
      if (error) throw error;
      const chunk = data || [];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) reachedEnd = true;
    }
    if (reachedEnd) break;
  }
  return rows;
}

// IMPORTANTE: `id` dessas tabelas é uuid v4 (gen_random_uuid(), ALEATÓRIO por
// definição — sem nenhuma relação com ordem de inserção). Uma versão anterior
// deste arquivo paginava "order by id desc" pra pegar "as linhas mais
// recentes" — isso está ERRADO: devolve uma amostra essencialmente aleatória
// da tabela inteira, não as N linhas mais novas. Sintoma real que expôs o bug
// (2026-07-21): uma O.S. com lançamento óbvio na Produção Diária de ontem
// aparecia como "Pendente" porque a amostra por id simplesmente não pegou
// aquela linha (o lote existia, só não foi sorteado). NUNCA usar `order by
// id` como proxy de recência aqui — sempre `created_at`, com os índices
// idx_grm_*_created_at (ver migração fob_lote_recente_fix_e_producao_vencedor).

// Fallback correto (não usa id): filtra created_at direto. Só é lento se os
// índices de created_at não existirem — hoje existem nas 3 tabelas.
async function fetchByCreatedAt(table, maxRows, dias = FOB_JANELA_DIAS) {
  const cutoffIso = new Date(Date.now() - dias * 86_400_000).toISOString();
  return fetchPaged((from, to) => supabase
    .from(table)
    .select('id,dados_json,created_at')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .range(from, to), maxRows);
}

// Movimentação/NHE: volume pequeno o bastante (poucos milhares em 3 dias) pra
// baixar a janela inteira e deixar o splitBatches/chooseBatch do cliente
// escolher o lote, sem precisar de lógica extra no servidor. A RPC
// fob_lote_recente só filtra por created_at (índice, rápido); se falhar, cai
// no fallback acima (mesmo resultado, só mais lento se faltar índice).
async function fetchLoteRecente(table, maxRows) {
  try {
    return await fetchPaged((from, to) => supabase
      .rpc('fob_lote_recente', { p_table: table, p_dias: FOB_JANELA_DIAS })
      .order('created_at', { ascending: false })
      .range(from, to), maxRows);
  } catch (error) {
    console.warn(`[FOB v9] RPC fob_lote_recente indisponível para ${table}; usando fallback created_at.`, error);
    return fetchByCreatedAt(table, maxRows);
  }
}

// Produção Diária tem MILHÕES de linhas e lotes de ~10 mil linhas várias
// vezes por dia — mesmo só "últimos 3 dias" são ~190 mil linhas, caro demais
// pra baixar toda vez. fob_producao_lote_vencedor escolhe o lote no SERVIDOR
// (mesmo critério do chooseServiceBatch abaixo: mais linhas batendo a data de
// referência, empate pelo lote mais recente) e devolve só as linhas desse
// lote — o cliente ainda roda chooseServiceBatch em cima (redundante mas
// inofensivo: o resultado já é só 1 lote, então splitBatches devolve só ele).
async function fetchProducaoLoteVencedor(referenciaDdMmYyyy, maxRows) {
  try {
    return await fetchPaged((from, to) => supabase
      .rpc('fob_producao_lote_vencedor', { p_referencia_ddmmyyyy: referenciaDdMmYyyy, p_dias: FOB_JANELA_DIAS })
      .order('created_at', { ascending: false })
      .range(from, to), maxRows);
  } catch (error) {
    console.warn('[FOB v9] RPC fob_producao_lote_vencedor indisponível; usando fallback created_at (baixa a janela inteira, mais lento).', error);
    return fetchByCreatedAt('grm_producao_diaria_importacoes', maxRows);
  }
}

function splitBatches(records, maxGapMs = 90_000) {
  const sorted = [...(records || [])]
    .filter((record) => record?.created_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const batches = [];
  let current = [];
  let previousAt = null;

  sorted.forEach((record) => {
    const currentAt = new Date(record.created_at).getTime();
    if (current.length && previousAt !== null && currentAt - previousAt > maxGapMs) {
      batches.push(current);
      current = [];
    }
    current.push(record);
    previousAt = currentAt;
  });

  if (current.length) batches.push(current);
  return batches;
}

function chooseMovementBatch(records) {
  // União de todos os lotes da janela, não só o "lote vencedor" (mais linhas
  // batendo a referência): o Mapa de Embarque é um snapshot AO VIVO do board
  // do GRM, e uma O.S. pode sumir dele entre um sync e o próximo (ex.: saiu
  // da tela do GRM antes do próximo sync) sem nunca ter sido resolvida.
  // Escolher só o lote com mais matches descartava silenciosamente qualquer
  // O.S. que só aparecia num lote mais antigo/perdedor — achado com a O.S.
  // 90394 (Última Atualização=27/08 presente até 02:53 UTC, sumida dos syncs
  // seguintes). Mantém, por O.S., a ocorrência de created_at mais recente
  // entre todos os lotes da janela.
  const byOs = new Map();
  const rawSeen = new Set();
  let lastBatchAt = null;

  (records || []).forEach((record) => {
    if (!lastBatchAt || String(record.created_at) > String(lastBatchAt)) lastBatchAt = record.created_at;
    const row = normalizedRow(record.dados_json || {});
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S', 'O S']));
    if (!os || normText(os) === 'OS') return;
    rawSeen.add(os);
    if (movementDate(row) !== referenceIso()) return;
    const existing = byOs.get(os);
    if (!existing || String(record.created_at) > String(existing.createdAt)) {
      byOs.set(os, { row, createdAt: record.created_at });
    }
  });

  const rows = [...byOs.values()];
  return { score: rows.length, batchAt: lastBatchAt, rawCount: rawSeen.size, matchingCount: rows.length, rows };
}

function chooseServiceBatch(records, label) {
  let selected = null;

  splitBatches(records).forEach((batch) => {
    const normalized = batch.map((record) => normalizedRow(record.dados_json || {}));
    const matching = normalized.filter((row) => serviceDate(row) === referenceIso());
    const score = matching.length;
    const batchAt = batch[0]?.created_at || null;

    if (!selected || score > selected.score || (score === selected.score && String(batchAt) > String(selected.batchAt))) {
      selected = { score, batchAt, rawCount: normalized.length, rows: matching };
    }
  });

  if (!selected || !selected.rows.length) {
    return {
      rows: [],
      batchAt: selected?.batchAt || null,
      rawCount: selected?.rawCount || 0,
      warning: `${label}: nenhum lote recente contém registros de ${referenceBr()}.`,
    };
  }

  return { ...selected, warning: '' };
}

async function fetchMovementDaily() {
  try {
    const records = await fetchLoteRecente('grm_mapa_embarque_importacoes', MAX_MOV_ROWS);
    const selected = chooseMovementBatch(records);

    if (!selected || !selected.rows.length) {
      return {
        rows: [],
        batchAt: selected?.batchAt || null,
        rawCount: selected?.rawCount || 0,
        warning: `Movimentação Diária: os ${BR_INT.format(records.length)} registros recentes não contêm um lote com Última Atualização em ${referenceBr()}.`,
      };
    }

    return { ...selected, warning: '' };
  } catch (error) {
    return {
      rows: [],
      batchAt: null,
      rawCount: 0,
      warning: `Movimentação Diária: falha ao consultar os lotes recentes (${error.message || error}).`,
    };
  }
}

async function fetchServiceDay(table, label, maxRows) {
  try {
    const records = table === 'grm_producao_diaria_importacoes'
      ? await fetchProducaoLoteVencedor(referenceBr(), maxRows)
      : await fetchLoteRecente(table, maxRows);
    return chooseServiceBatch(records, label);
  } catch (error) {
    return {
      rows: [],
      batchAt: null,
      rawCount: 0,
      warning: `${label}: falha ao consultar os lotes recentes (${error.message || error}).`,
    };
  }
}

function compareFob(movementRows, productionRows, nheRows) {
  // Regra (reformulada pelo usuário em 21/07/2026 — esta tela avalia só
  // pendências de NHE, não de carga em geral):
  // - Base = OS com "Última Atualização" no Mapa de Embarque no dia de
  //   referência.
  // - Na Produção Diária, o campo "Cargas" de uma linha é OU um número (carga
  //   real embarcada) OU o texto "NHE" (marcador) — nunca os dois pra mesma
  //   OS/data (confirmado nos dados: são mutuamente exclusivos).
  // - Se a OS tem CARGA REAL (Cargas numérico > 0) na Produção + Atualização:
  //   situação correta — NÃO entra nesta tela (fora do escopo, que é só
  //   pendência de NHE).
  // - Se a OS tem NHE (tabela NHE OU Cargas="NHE" na Produção) + Atualização:
  //   OK.
  // - Se a OS não tem NHE nem carga real própria, mas OUTRA OS do mesmo
  //   Cliente + Local de Embarque tem (NHE ou carga real): DOIS EMBARQUES —
  //   o embarque foi lançado na O.S. irmã.
  // - Se só tem Atualização, sem nenhuma dessas informações (própria ou de
  //   irmã): PENDENTE.
  const setCargaRealOs = new Set();
  const setNheEmProducaoOs = new Set();
  productionRows.forEach((row) => {
    const os = normOs(pick(row, ['O.S.', 'OS']));
    if (!os) return;
    const cargasRaw = String(pick(row, ['Cargas']) ?? '').trim();
    if (normText(cargasRaw) === 'NHE') {
      setNheEmProducaoOs.add(os);
    } else if (cargasRaw && toNumberLoose(cargasRaw) > 0) {
      setCargaRealOs.add(os);
    }
  });

  const setNheOsOnly = new Set();
  nheRows.forEach((row) => {
    // 'sorCode' é o nome do campo O.S. no formato bruto da API do GRM (ver
    // serviceDate acima) — mesma causa, mesma correção.
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S', 'sorCode']));
    if (os) setNheOsOnly.add(os);
  });

  const temNhe = (os) => setNheOsOnly.has(os) || setNheEmProducaoOs.has(os);
  const temCargaReal = (os) => setCargaRealOs.has(os);

  const grupoKey = (cliente, local) => `${normText(cliente)}|${normText(local)}`;

  const base = [];
  movementRows.forEach(({ row }) => {
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S']));
    const date = movementDate(row);
    if (!os || !date) return;
    base.push({
      os,
      date,
      cliente: pick(row, ['Cliente']),
      cidade: pick(row, ['Cidade']),
      local: pick(row, ['Local', 'Local de Embarque']),
      supervisao: pick(row, ['Supervisão', 'Supervisao']),
      funcionario: pick(row, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario']),
      tons: toNumberLoose(pick(row, ['Tons Hoje', 'TonsHoje', 'Tons'])),
      observacao: pick(row, ['Observações', 'Observacoes', 'Obs']),
    });
  });

  // Regra obrigatória por ponto: se QUALQUER O.S. do mesmo Cliente + Local
  // de Embarque tiver carga real, nenhuma O.S. desse ponto pode gerar FOB/NHE.
  // O ponto inteiro fica fora da relação. "Dois Embarques" só é usado quando
  // existe NHE numa O.S. irmã e não existe carga real em nenhuma O.S. do ponto.
  const grupos = new Map();
  base.forEach((item) => {
    const key = grupoKey(item.cliente, item.local);
    let g = grupos.get(key);
    if (!g) { g = { temCargaReal: false, temNhe: false }; grupos.set(key, g); }
    if (temCargaReal(item.os)) g.temCargaReal = true;
    if (temNhe(item.os)) g.temNhe = true;
  });

  const rows = [];
  base.forEach((item) => {
    const g = grupos.get(grupoKey(item.cliente, item.local));

    // Mesmo que ESTA O.S. esteja zerada, uma carga em outra O.S. do mesmo
    // Cliente + ponto bloqueia o lançamento de FOB para o grupo inteiro.
    if (g && g.temCargaReal) return;

    let status;
    if (temNhe(item.os)) {
      status = 'OK';
    } else {
      status = (g && g.temNhe) ? 'DOIS EMBARQUES' : 'PENDENTE';
    }

    rows.push({
      data: item.date,
      data_br: brDate(item.date),
      os: item.os,
      supervisao: item.supervisao,
      funcionario: item.funcionario,
      cliente: item.cliente,
      cidade: item.cidade,
      local: item.local,
      tons_movimento: item.tons,
      status,
      observacao: item.observacao,
    });
  });

  const rank = { PENDENTE: 0, 'DOIS EMBARQUES': 1, OK: 2 };
  rows.sort((a, b) => (rank[a.status] ?? 99) - (rank[b.status] ?? 99)
    || String(a.data).localeCompare(String(b.data))
    || String(a.supervisao || '').localeCompare(String(b.supervisao || ''), 'pt-BR'));

  return {
    rows,
    stats: {
      movimento: movementRows.length,
      producao: productionRows.length,
      nhe: nheRows.length,
      nheOsOnly: setNheOsOnly.size,
      prodOs: setCargaRealOs.size,
      pendentes: rows.filter((row) => row.status === 'PENDENTE').length,
      dois: rows.filter((row) => row.status === 'DOIS EMBARQUES').length,
      ok: rows.filter((row) => row.status === 'OK').length,
    },
  };
}

function injectStyles() {
  if (document.getElementById('fob-v9-styles')) return;
  const style = document.createElement('style');
  style.id = 'fob-v9-styles';
  style.textContent = `
    .fob-actions{display:flex;gap:8px;flex-wrap:wrap}.fob-actions .btn{width:auto!important}.fob-note{border:1px solid rgba(59,130,246,.28);background:rgba(59,130,246,.08);color:#bfdbfe;border-radius:16px;padding:12px;margin-top:12px;font-size:13px}.fob-reference{border-color:rgba(74,222,128,.38);background:rgba(22,101,52,.16);color:#dcfce7;font-weight:800}.fob-warning{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:#fde68a}.fob-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fob-diag{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fob-diag span{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 10px;font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.28)}
    .fob-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.fob-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;color:#e2e2f0}.fob-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;border-bottom:1px solid rgba(52,211,153,.18)}.fob-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top}.fob-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.fob-status-PENDENTE{color:#fecaca}.fob-status-OK{color:#bbf7d0}.fob-status-DOIS-EMBARQUES{color:#fde68a}.fob-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;padding:9px;color-scheme:dark}.fob-form{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}.fob-subcard summary::marker{color:#86efac}
    .fob-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
    .fob-tab{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.4);color:#cbd5e1;border-radius:12px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer}
    .fob-tab:hover{border-color:rgba(148,163,184,.45)}
    .fob-tab.active{color:var(--fob-tab-color,#bbf7d0);background:rgba(15,23,42,.72);box-shadow:inset 0 0 0 1px currentColor}
    .fob-tab-count{min-width:22px;text-align:center;background:rgba(2,6,23,.5);border-radius:999px;padding:1px 8px;font-size:12px;color:#e2e2f0}
    @media(max-width:850px){.fob-grid,.fob-form{grid-template-columns:1fr 1fr}}@media(max-width:600px){.fob-grid,.fob-form{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function renderShell(content) {
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>FOB — Comparação automática</h3><p class="muted">Replica a regra do Apps Script usando Movimentação Diária, Produção Diária e NHE.</p></div>
        <div class="fob-actions"><button id="fobReload" class="btn btn-secondary" type="button">↻ Atualizar</button><button id="fobSave" class="btn btn-secondary" type="button" disabled>Salvar pendentes no painel</button><button id="fobCsv" class="btn btn-secondary" type="button" disabled>Exportar CSV</button></div>
      </div>
      <div class="fob-note fob-reference">Data de referência: <strong>${referenceBr()}</strong></div>
      <div class="fob-note">Regra (só pendências de NHE): só existe FOB quando <strong>nenhuma O.S. do mesmo Cliente no mesmo ponto de embarque possui carga real</strong>. Havendo qualquer carga no ponto, o grupo inteiro não entra. Ok = a própria O.S. tem NHE. Dois Embarques = outra O.S. do mesmo Cliente + ponto tem NHE, sem carga real no ponto. Pendente = nenhuma O.S. do ponto tem carga nem NHE.</div>
      <div id="fobFeedback" class="feedback mt-16">Carregando bases...</div>
      <div id="fobWarnings"></div>
      <div id="fobResult" class="mt-16"></div>
    </section>
    <details class="card mt-16 fob-subcard"><summary style="cursor:pointer;font-weight:900;color:#bbf7d0">Lançamento manual / histórico de validação</summary><div class="card mt-16"><div class="fob-form"><input id="fobData" class="fob-input" type="date" value="${referenceIso()}"><input id="fobOs" class="fob-input" placeholder="Número da O.S."><input id="fobSup" class="fob-input" placeholder="Supervisão"><input id="fobCliente" class="fob-input" placeholder="Cliente"><input id="fobObs" class="fob-input" placeholder="Observação"><button id="fobManual" class="btn btn-primary" type="button">Registrar FOB 0</button></div></div><div id="fobHistory" class="mt-16"></div></details>`;
}

function renderWarnings() {
  const host = document.getElementById('fobWarnings');
  if (!host) return;
  const warnings = [...new Set(state.warnings.filter(Boolean))];
  host.innerHTML = warnings.length ? `<div class="fob-note fob-warning">${warnings.map(esc).join('<br>')}</div>` : '';
}

function renderResult() {
  const host = document.getElementById('fobResult');
  const save = document.getElementById('fobSave');
  const csv = document.getElementById('fobCsv');
  if (!host) return;

  if (save) save.disabled = !state.rows.some((row) => row.status === 'PENDENTE');
  if (csv) csv.disabled = !state.rows.length;

  if (!state.rows.length) {
    host.innerHTML = `<div class="fob-empty">Nenhuma linha FOB foi localizada para ${referenceBr()}.</div>`;
    return;
  }

  const stats = state.stats || {};
  const movBatch = stats.movBatchAt ? new Date(stats.movBatchAt).toLocaleString('pt-BR') : '-';
  const prodBatch = stats.prodBatchAt ? new Date(stats.prodBatchAt).toLocaleString('pt-BR') : '-';

  const activeTab = FOB_TABS.some(([status]) => status === state.activeTab) ? state.activeTab : 'OK';
  const tabRows = state.rows.filter((row) => row.status === activeTab);
  const activeLabel = (FOB_TABS.find(([status]) => status === activeTab) || [, 'Ok'])[1];

  const tabsHtml = FOB_TABS.map(([status, label, color]) => {
    const count = state.rows.filter((row) => row.status === status).length;
    const isActive = status === activeTab;
    return `<button type="button" class="fob-tab ${isActive ? 'active' : ''}" data-fob-tab="${esc(status)}" style="--fob-tab-color:${color}"><span>${esc(label)}</span><span class="fob-tab-count">${BR_INT.format(count)}</span></button>`;
  }).join('');

  const tableHtml = tabRows.length
    ? `<div class="fob-table-wrap mt-16"><table class="fob-table"><thead><tr><th>Data</th><th>O.S.</th><th>Supervisão</th><th>Funcionário</th><th>Observação</th></tr></thead><tbody>${tabRows.map((row) => `<tr><td>${esc(row.data_br)}</td><td><strong>${esc(row.os)}</strong><div class="muted">${esc(row.cliente || '-')}</div></td><td>${esc(row.supervisao || '-')}</td><td>${esc(row.funcionario || '-')}</td><td>${esc(row.observacao || '')}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="fob-empty mt-16">Nenhuma O.S. em "${esc(activeLabel)}" para ${referenceBr()}.</div>`;

  host.innerHTML = `
    <div class="fob-diag"><span>Movimentação: ${BR_INT.format(stats.movimento || 0)}</span><span>Lote MOV: ${esc(movBatch)}</span><span>Produção: ${BR_INT.format(stats.producao || 0)}</span><span>Lote Produção: ${esc(prodBatch)}</span><span>NHE: ${BR_INT.format(stats.nhe || 0)}</span><span>O.S. distintas na Produção: ${BR_INT.format(stats.prodOs || 0)}</span></div>
    <div class="fob-tabs">${tabsHtml}</div>
    ${tableHtml}`;
}

// Busca os lançamentos que o bot fez em nome do GESTOR (colaborador do
// informativo fora do raio de 2km) — ver grm-sync-lancar-nhe.js:salvarResultado,
// que grava raw.via_gestor=true e raw.colaborador_original nessas linhas.
// Mostra o colaborador ORIGINAL (não o gestor) — é ele que o setor precisa
// acompanhar.
async function fetchForaDoRaio() {
  try {
    const { data, error } = await supabase
      .from('logistica_nhe_lancamentos_auto')
      .select('numero_os,cliente,supervisao,distancia_m,observacao,raw,data_referencia')
      .eq('data_referencia', referenceIso())
      .eq('status', 'SUCESSO')
      .filter('raw->>via_gestor', 'eq', 'true');

    if (error) throw error;

    return (data || []).map((row) => ({
      data: row.data_referencia,
      data_br: brDate(row.data_referencia),
      os: normOs(row.numero_os),
      cliente: row.cliente,
      local: '',
      supervisao: row.supervisao,
      funcionario: (row.raw && row.raw.colaborador_original) || '-',
      status: 'FORA_DO_RAIO',
      observacao: `${row.observacao || ''} (lançado por ${(row.raw && row.raw.gestor) || 'gestor da regional'})`.trim(),
    }));
  } catch (error) {
    console.warn('[FOB v9] Falha ao buscar lançamentos Fora do Raio.', error);
    return [];
  }
}

async function generateReport() {
  if (state.loading) return;
  state.loading = true;
  state.warnings = [];
  const feedback = document.getElementById('fobFeedback');
  // Se já tem alguma linha na tela (pintada do cache ou de uma consulta
  // anterior nesta mesma sessão), não apaga nada — só avisa que está
  // atualizando por trás. Só mostra "Carregando..." vazio na 1ª carga real.
  const hadRows = state.rows.length > 0;
  if (feedback) {
    feedback.textContent = hadRows
      ? `Atualizando fechamento de ${referenceBr()}...`
      : `Carregando fechamento de ${referenceBr()}...`;
  }

  try {
    const [movement, production, nhe, foraDoRaio] = await Promise.all([
      fetchMovementDaily(),
      fetchServiceDay('grm_producao_diaria_importacoes', 'Produção Diária', MAX_PROD_ROWS),
      fetchServiceDay('grm_nhe_importacoes', 'NHE', MAX_NHE_ROWS),
      fetchForaDoRaio(),
    ]);

    state.warnings.push(movement.warning, production.warning, nhe.warning);
    const report = compareFob(movement.rows, production.rows, nhe.rows);
    // "Fora do Raio" é independente da comparação Ok/Dois Embarques/Pendente —
    // a MESMA O.S. pode aparecer ali (ex.: já em Ok, porque o NHE foi
    // lançado) e também em Fora do Raio (flag de acompanhamento do
    // colaborador que logou longe). Não é uma 4ª categoria excludente.
    state.rows = [...report.rows, ...foraDoRaio];
    // Abre numa aba que tenha linhas (na ordem Ok → Dois Embarques → Pendente),
    // mantendo a aba atual se ela já tiver linhas (evita pular de aba sozinho
    // numa atualização silenciosa em segundo plano).
    if (!state.rows.some((row) => row.status === state.activeTab)) {
      state.activeTab = FOB_TABS.map(([status]) => status).find((status) => state.rows.some((row) => row.status === status)) || 'OK';
    }
    state.stats = {
      ...report.stats,
      movBatchAt: movement.batchAt,
      prodBatchAt: production.batchAt,
      nheBatchAt: nhe.batchAt,
      movRawCount: movement.rawCount,
      prodRawCount: production.rawCount,
      nheRawCount: nhe.rawCount,
    };

    renderWarnings();
    renderResult();
    writeReportCache();

    if (feedback) {
      feedback.textContent = `Comparação concluída: ${state.rows.length} linha(s), ${state.stats.pendentes} pendente(s), ${state.stats.ok} OK.`;
    }
  } catch (error) {
    console.error('[FOB v9]', error);
    // Numa atualização silenciosa, um erro de rede não pode apagar o que já
    // estava correto na tela — só avisa e mantém os dados anteriores.
    if (!hadRows) {
      state.rows = [];
      state.stats = null;
      renderResult();
    }
    if (feedback) {
      feedback.textContent = hadRows
        ? `Falha ao atualizar (mostrando última consulta): ${error.message || error}.`
        : `Falha ao gerar FOB: ${error.message || error}.`;
    }
  } finally {
    state.loading = false;
  }
}

async function loadHistory() {
  const host = document.getElementById('fobHistory');
  const { data, error } = await supabase
    .from('logistica_fob')
    .select('*')
    .order('data_referencia', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(300);

  if (error) {
    console.warn('[FOB histórico]', error);
    if (host) host.innerHTML = `<div class="fob-empty">${esc(error.message)}</div>`;
    return;
  }

  state.fob = data || [];
  renderHistory();
}

function renderHistory() {
  const host = document.getElementById('fobHistory');
  if (!host) return;

  if (!state.fob.length) {
    host.innerHTML = '<div class="fob-empty">Nenhum FOB salvo no histórico.</div>';
    return;
  }

  const activeTab = HISTORY_TABS.some(([status]) => status === state.historyTab) ? state.historyTab : 'PENDENTE';
  const normalizedStatus = (row) => String(row.status || 'PENDENTE');
  const tabRows = state.fob.filter((row) => normalizedStatus(row) === activeTab);
  const activeLabel = (HISTORY_TABS.find(([status]) => status === activeTab) || [, 'Pendente'])[1];

  const tabsHtml = HISTORY_TABS.map(([status, label, color]) => {
    const count = state.fob.filter((row) => normalizedStatus(row) === status).length;
    const isActive = status === activeTab;
    return `<button type="button" class="fob-tab ${isActive ? 'active' : ''}" data-fob-history-tab="${esc(status)}" style="--fob-tab-color:${color}"><span>${esc(label)}</span><span class="fob-tab-count">${BR_INT.format(count)}</span></button>`;
  }).join('');

  const tableHtml = tabRows.length
    ? `<div class="fob-table-wrap mt-16"><table class="fob-table"><thead><tr><th>Data</th><th>O.S.</th><th>Cliente</th><th>Supervisão</th><th>Ação</th></tr></thead><tbody>${tabRows.map((row) => `<tr><td>${esc(brDate(row.data_referencia))}</td><td>${esc(row.numero_os || '-')}</td><td>${esc(row.cliente || '-')}</td><td>${esc(row.supervisao || '-')}</td><td>${activeTab === 'PENDENTE' ? `<button class="btn btn-primary" type="button" data-valid="${esc(row.id)}" title="Marcar como Ok">✓</button> <button class="btn btn-secondary" type="button" data-invalid="${esc(row.id)}" title="Recusar">✕</button>` : '-'}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="fob-empty mt-16">Nenhuma O.S. em "${esc(activeLabel)}" no histórico.</div>`;

  host.innerHTML = `<div class="fob-tabs">${tabsHtml}</div>${tableHtml}`;
}

async function savePending() {
  const existing = new Set(state.fob.map((row) => `${row.numero_os || ''}|${String(row.data_referencia || '').slice(0, 10)}`));
  const pending = state.rows.filter((row) => row.status === 'PENDENTE' && !existing.has(`${row.os}|${row.data}`));

  if (!pending.length) {
    document.getElementById('fobFeedback').textContent = 'Nenhuma pendência nova para salvar.';
    return;
  }

  const payload = pending.map((row) => ({
    data_referencia: row.data,
    numero_os: row.os,
    supervisao: row.supervisao || null,
    cliente: row.cliente || null,
    tons_movimento: 0,
    tons_producao: 0,
    tons_nh: 0,
    observacao: row.observacao || null,
    status: 'PENDENTE',
    criado_por: state.user?.id || null,
  }));

  for (let index = 0; index < payload.length; index += 300) {
    const { error } = await supabase.from('logistica_fob').insert(payload.slice(index, index + 300));
    if (error) throw error;
  }

  document.getElementById('fobFeedback').textContent = `${payload.length} pendência(s) salva(s).`;
  await loadHistory();
}

async function saveManual() {
  const data = document.getElementById('fobData')?.value;
  if (!data) return;

  const payload = {
    data_referencia: data,
    numero_os: document.getElementById('fobOs')?.value?.trim() || null,
    supervisao: document.getElementById('fobSup')?.value?.trim() || null,
    cliente: document.getElementById('fobCliente')?.value?.trim() || null,
    tons_movimento: 0,
    tons_producao: 0,
    tons_nh: 0,
    observacao: document.getElementById('fobObs')?.value?.trim() || null,
    status: 'PENDENTE',
    criado_por: state.user?.id || null,
  };

  const { error } = await supabase.from('logistica_fob').insert(payload);
  if (error) throw error;
  await loadHistory();
}

async function validate(id, status) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('logistica_fob')
    .update({
      status,
      validado_por: state.user?.id || null,
      validado_em: now,
      updated_at: now,
    })
    .eq('id', id);

  if (error) throw error;
  await loadHistory();
}

function exportCsv() {
  if (!state.rows.length) return;
  const lines = [
    ['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'STATUS', 'OBS'],
    ...state.rows.map((row) => [row.data_br, row.os, row.supervisao, row.funcionario, row.status, row.observacao]),
  ];
  const csv = '\ufeff' + lines
    .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `FOB_${referenceIso()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bind(content) {
  content.addEventListener('click', async (event) => {
    try {
      if (event.target.closest('#fobReload')) {
        await generateReport();
        await loadHistory();
        return;
      }
      if (event.target.closest('#fobSave')) { await savePending(); return; }
      if (event.target.closest('#fobCsv')) { exportCsv(); return; }
      if (event.target.closest('#fobManual')) { await saveManual(); return; }

      const tab = event.target.closest('[data-fob-tab]');
      if (tab) { state.activeTab = tab.dataset.fobTab; renderResult(); return; }

      const historyTab = event.target.closest('[data-fob-history-tab]');
      if (historyTab) { state.historyTab = historyTab.dataset.fobHistoryTab; renderHistory(); return; }

      const valid = event.target.closest('[data-valid]');
      if (valid) { await validate(valid.dataset.valid, 'VALIDO'); return; }

      const invalid = event.target.closest('[data-invalid]');
      if (invalid) await validate(invalid.dataset.invalid, 'INVALIDO');
    } catch (error) {
      console.error('[FOB ação]', error);
      const feedback = document.getElementById('fobFeedback');
      if (feedback) feedback.textContent = error.message || String(error);
    }
  });
}

export async function renderContent(content) {
  injectStyles();
  state.user = await getCurrentUser();
  renderShell(content);
  bind(content);

  // Pinta na hora com o último resultado desta sessão (se houver, mesma data
  // de referência) — a página faz reload completo a cada navegação, então sem
  // isso a tela sempre voltava vazia mesmo já tendo o resultado há segundos.
  const cached = readReportCache();
  if (cached) {
    state.rows = cached.rows;
    state.stats = cached.stats;
    state.warnings = cached.warnings || [];
    state.activeTab = cached.activeTab || 'OK';
    renderWarnings();
    renderResult();
    const feedback = document.getElementById('fobFeedback');
    if (feedback) feedback.textContent = `Mostrando última consulta (${new Date(cached.ts).toLocaleTimeString('pt-BR')}) — atualizando...`;
  }

  await Promise.all([generateReport(), loadHistory()]);
}

initProtectedPage('FOB — Logística', renderContent);
