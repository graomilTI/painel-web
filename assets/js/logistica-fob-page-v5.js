import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 1000;
const MAX_MAPA = 12000;
const MAX_PRODUCAO = 20000;
const MAX_NHE = 12000;
const BR_INT = new Intl.NumberFormat('pt-BR');

const state = {
  user: null,
  fob: [],
  rows: [],
  stats: null,
  warnings: [],
  loading: false,
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function normOs(value) {
  let text = String(value ?? '').trim();
  if (/^\d+(\.0+)?$/.test(text)) text = text.replace(/\.0+$/, '');
  if (text.includes('/')) text = text.split('/')[0].trim();
  return text;
}

function numberLoose(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text || text === '--') return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function brDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function referenceDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date;
}

function referenceIso() { return isoDate(referenceDate()); }
function referenceBr() { return brDate(referenceDate()); }

function referenceBounds() {
  const start = referenceDate();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const overnightEnd = new Date(end);
  overnightEnd.setHours(overnightEnd.getHours() + 6);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    overnightEndIso: overnightEnd.toISOString(),
  };
}

function normalizedRow(raw) {
  const output = {};
  Object.entries(raw || {}).forEach(([key, value]) => { output[normalize(key)] = value; });
  return output;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normalize(alias);
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return '';
}

function rowDate(row) {
  return isoDate(pick(row, ['Data', 'Data OS', 'Data da OS', 'Data NHE', 'Data de Produção', 'Última Atualização', 'Ultima Atualizacao']));
}

function isFob(row) {
  const service = normalize(pick(row, ['Serviço', 'Servico', 'Tipo de Serviço', 'Tipo Servico']));
  return !service || service.includes('FOB');
}

function isTimeout(error) {
  return /statement timeout|canceling statement/i.test(String(error?.message || error || ''));
}

async function fetchPaged(builder, maxRows) {
  const rows = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await builder(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

function dedupeAgentRecords(records) {
  const unique = new Map();
  (records || []).forEach((record) => {
    const data = record?.dados_json || {};
    const row = normalizedRow(data);
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    const date = rowDate(row);
    const service = normalize(pick(row, ['Serviço', 'Servico']));
    const key = `${os}|${date}|${service}|${record?.created_at || ''}|${JSON.stringify(data)}`;
    unique.set(key, record);
  });
  return [...unique.values()];
}

// Mapa e NHE são tabelas menores. A busca fica limitada à data de referência e
// à janela em que o agente normalmente gravou o relatório.
async function fetchAgentReferenceDay(table, maxRows, label) {
  const dateValues = [referenceBr(), referenceIso()];
  const { startIso, endIso, overnightEndIso } = referenceBounds();
  const collected = [];
  const errors = [];

  const tryWindow = async (windowStart, windowEnd) => {
    for (const dateValue of dateValues) {
      try {
        const rows = await fetchPaged((from, to) => supabase
          .from(table)
          .select('dados_json,created_at')
          .eq('dados_json->>Data', dateValue)
          .gte('created_at', windowStart)
          .lt('created_at', windowEnd)
          .range(from, to), maxRows);
        collected.push(...rows);
      } catch (error) {
        errors.push(error);
      }
    }
  };

  await tryWindow(startIso, endIso);
  if (!collected.length) await tryWindow(endIso, overnightEndIso);

  // Fallback sem expressão JSON: usa apenas created_at e filtra a data no navegador.
  if (!collected.length) {
    try {
      const candidates = await fetchPaged((from, to) => supabase
        .from(table)
        .select('dados_json,created_at')
        .gte('created_at', startIso)
        .lt('created_at', overnightEndIso)
        .range(from, to), maxRows);
      collected.push(...candidates.filter((record) => {
        const date = rowDate(normalizedRow(record.dados_json || {}));
        return date ? date === referenceIso() : true;
      }));
    } catch (error) {
      errors.push(error);
    }
  }

  const warnings = [];
  if (!collected.length && errors.length) {
    const error = errors.find((item) => !isTimeout(item)) || errors[0];
    warnings.push(`${label}: não foi possível consultar ${referenceBr()} (${error.message || error}).`);
  } else if (!collected.length) {
    warnings.push(`${label}: nenhum registro localizado para ${referenceBr()}.`);
  }

  return { rows: dedupeAgentRecords(collected), warnings };
}

// Produção Diária é uma tabela grande. Não usa filtro JSON por Data, pois isso
// fazia o PostgreSQL varrer centenas de milhares de linhas e estourar o timeout.
// O agente grava um snapshot completo em cada ciclo; por isso buscamos apenas o
// lote mais recente (últimos 5 minutos do maior created_at) e filtramos o dia
// anterior localmente. É o mesmo padrão já usado no sync de producao_snapshot.
async function fetchLatestProductionReferenceDay() {
  const label = 'Produção Diária';
  const warnings = [];

  try {
    const { data: latestRows, error: latestError } = await supabase
      .from('grm_producao_diaria_importacoes')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (latestError) throw latestError;

    const latestAt = latestRows?.[0]?.created_at;
    if (!latestAt) {
      warnings.push(`${label}: nenhum lote sincronizado foi localizado.`);
      return { rows: [], warnings };
    }

    const threshold = new Date(new Date(latestAt).getTime() - 5 * 60 * 1000).toISOString();
    const batch = await fetchPaged((from, to) => supabase
      .from('grm_producao_diaria_importacoes')
      .select('dados_json,created_at')
      .gte('created_at', threshold)
      .order('created_at', { ascending: true })
      .range(from, to), MAX_PRODUCAO);

    const rows = dedupeAgentRecords(batch).filter((record) => {
      const row = normalizedRow(record.dados_json || {});
      return rowDate(row) === referenceIso() && isFob(row);
    });

    if (!rows.length) {
      warnings.push(`${label}: o último lote não contém registros FOB de ${referenceBr()}.`);
    }

    return { rows, warnings };
  } catch (error) {
    console.warn('[FOB] Produção Diária via último lote', error);
    warnings.push(`${label}: a leitura do último lote falhou (${error.message || error}). A comparação seguirá usando NHE.`);
    return { rows: [], warnings };
  }
}

async function fetchOperationalOs() {
  try {
    const rows = await fetchPaged((from, to) => supabase
      .from('operacional_os')
      .select('numero_os,data_os,cliente,embarque,supervisao,remanescente,lote,embarcado,situacao,status_gestor')
      .range(from, to), 10000);
    return { rows, warning: '' };
  } catch (error) {
    return { rows: [], warning: `Cadastro de O.S.: ${error.message || error}.` };
  }
}

function latestMapByOs(records) {
  const map = new Map();
  (records || []).forEach((record) => {
    const row = normalizedRow(record.dados_json || {});
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    if (!os || normalize(os) === 'OS') return;
    map.set(os, { row, createdAt: record.created_at });
  });
  return map;
}

function buildReport(mapaRecords, producaoRecords, nheRecords, operacionalRows) {
  const mapaByOs = latestMapByOs(mapaRecords);
  const operacionalByOs = new Map();
  (operacionalRows || []).forEach((row) => {
    const os = normOs(row.numero_os);
    if (os) operacionalByOs.set(os, row);
  });

  const prodRows = (producaoRecords || [])
    .map((record) => normalizedRow(record.dados_json || {}))
    .filter((row) => isFob(row) && rowDate(row) === referenceIso());
  const nheRows = (nheRecords || [])
    .map((record) => normalizedRow(record.dados_json || {}))
    .filter((row) => isFob(row) && (!rowDate(row) || rowDate(row) === referenceIso()));

  const nheOs = new Set();
  const nheOsDate = new Set();
  const nheCombo = new Set();
  nheRows.forEach((row) => {
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    const date = rowDate(row) || referenceIso();
    if (os) {
      nheOs.add(os);
      nheOsDate.add(`${os}|${date}`);
    }
    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade de Embarque', 'Cidade']);
    const local = pick(row, ['Embarque', 'Local', 'Local de Embarque']);
    if (cliente && cidade && local) nheCombo.add(`${normalize(cliente)}|${normalize(cidade)}|${normalize(local)}|${date}`);
  });

  const prodNheOs = new Set();
  const prodNheOsDate = new Set();
  prodRows.forEach((row) => {
    if (normalize(pick(row, ['Cargas'])) !== 'NHE') return;
    const os = normOs(pick(row, ['O.S.', 'OS']));
    const date = rowDate(row) || referenceIso();
    if (os) {
      prodNheOs.add(os);
      prodNheOsDate.add(`${os}|${date}`);
    }
  });

  const comboCount = new Map();
  mapaByOs.forEach(({ row }) => {
    const date = rowDate(row) || referenceIso();
    if (date !== referenceIso()) return;
    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade']);
    const local = pick(row, ['Local', 'Local de Embarque']);
    if (!cliente || !cidade || !local) return;
    const key = `${normalize(cliente)}|${normalize(cidade)}|${normalize(local)}|${date}`;
    comboCount.set(key, (comboCount.get(key) || 0) + 1);
  });

  const rows = [];
  mapaByOs.forEach(({ row }, os) => {
    const internalDate = rowDate(row);
    if (internalDate && internalDate !== referenceIso()) return;

    const tonsRaw = pick(row, ['Tons Hoje', 'TonsHoje', 'Tons']);
    if (String(tonsRaw ?? '').trim() === '' || numberLoose(tonsRaw) !== 0) return;

    const cadastro = operacionalByOs.get(os) || {};
    const remRaw = pick(row, ['Remanescente']);
    const remanescente = String(remRaw ?? '').trim() !== '' ? numberLoose(remRaw) : numberLoose(cadastro.remanescente);
    if (remanescente <= 0 && Number(cadastro.lote || 0) > 0) return;

    const date = referenceIso();
    const cliente = pick(row, ['Cliente']) || cadastro.cliente || '';
    const cidade = pick(row, ['Cidade']);
    const local = pick(row, ['Local', 'Local de Embarque']) || cadastro.embarque || '';
    const supervisao = pick(row, ['Supervisão', 'Supervisao']) || cadastro.supervisao || '';
    const funcionario = pick(row, ['Atualizado por', 'Classificador', 'Funcionário', 'Funcionario']);
    const keyOsDate = `${os}|${date}`;

    let status = 'PENDENTE';
    if (nheOsDate.has(keyOsDate) || nheOs.has(os) || prodNheOsDate.has(keyOsDate) || prodNheOs.has(os)) {
      status = 'OK';
    } else {
      const combo = `${normalize(cliente)}|${normalize(cidade)}|${normalize(local)}|${date}`;
      if ((comboCount.get(combo) || 0) >= 2 || nheCombo.has(combo)) status = 'DOIS EMBARQUES';
    }

    rows.push({
      data: date,
      data_br: referenceBr(),
      os,
      cliente,
      cidade,
      local,
      supervisao,
      funcionario,
      tons_movimento: 0,
      remanescente,
      status,
      observacao: pick(row, ['Observações', 'Observacoes', 'Obs']),
    });
  });

  const rank = { PENDENTE: 0, 'DOIS EMBARQUES': 1, OK: 2 };
  rows.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    || String(a.supervisao).localeCompare(String(b.supervisao), 'pt-BR')
    || String(a.os).localeCompare(String(b.os), 'pt-BR'));

  return {
    rows,
    stats: {
      referencia: referenceIso(),
      mapa: mapaByOs.size,
      operacional: operacionalByOs.size,
      producao: prodRows.length,
      producaoNhe: prodNheOs.size,
      nhe: nheRows.length,
      pendentes: rows.filter((row) => row.status === 'PENDENTE').length,
      dois: rows.filter((row) => row.status === 'DOIS EMBARQUES').length,
      ok: rows.filter((row) => row.status === 'OK').length,
    },
  };
}

function injectStyles() {
  if (document.getElementById('fob-v5-styles')) return;
  const style = document.createElement('style');
  style.id = 'fob-v5-styles';
  style.textContent = `
    .fob-actions{display:flex;gap:8px;flex-wrap:wrap}.fob-actions .btn{width:auto!important}.fob-note{border:1px solid rgba(59,130,246,.28);background:rgba(59,130,246,.08);color:#bfdbfe;border-radius:16px;padding:12px;margin-top:12px;font-size:13px}.fob-reference{border-color:rgba(74,222,128,.38);background:rgba(22,101,52,.16);color:#dcfce7;font-weight:800}.fob-warning{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:#fde68a}.fob-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fob-diag{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fob-diag span{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 10px;font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.28)}
    .fob-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.fob-table{width:100%;min-width:1040px;border-collapse:separate;border-spacing:0;color:#e2e2f0}.fob-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;border-bottom:1px solid rgba(52,211,153,.18)}.fob-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top}.fob-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.fob-status-PENDENTE{color:#fecaca}.fob-status-OK{color:#bbf7d0}.fob-status-DOIS-EMBARQUES{color:#fde68a}.fob-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;padding:9px;color-scheme:dark}.fob-form{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}.fob-subcard summary::marker{color:#86efac}
    @media(max-width:850px){.fob-grid,.fob-form{grid-template-columns:1fr 1fr}}@media(max-width:600px){.fob-grid,.fob-form{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function renderShell(content) {
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>FOB — Comparação automática</h3><p class="muted">Analisa o Mapa de Embarque do dia anterior e cruza com o último lote da Produção Diária, NHE e cadastro de O.S.</p></div>
        <div class="fob-actions"><button id="fobReload" class="btn btn-secondary" type="button">↻ Atualizar</button><button id="fobSave" class="btn btn-secondary" type="button" disabled>Salvar pendentes no painel</button><button id="fobCsv" class="btn btn-secondary" type="button" disabled>Exportar CSV</button></div>
      </div>
      <div class="fob-note fob-reference">Data de referência: <strong>${referenceBr()}</strong> — sempre um dia anterior à data atual.</div>
      <div class="fob-note">Entra no FOB toda O.S. do Mapa de <strong>${referenceBr()}</strong> com <strong>Tons Hoje = 0</strong>. NHE ou Produção com Cargas = NHE da mesma data confirma <strong>OK</strong>; duplicidade de Cliente + Cidade + Local + Data indica <strong>DOIS EMBARQUES</strong>; o restante fica <strong>PENDENTE</strong>.</div>
      <div id="fobFeedback" class="feedback mt-16">Carregando comparação de ${referenceBr()}...</div>
      <div id="fobWarnings"></div>
      <div id="fobResult" class="mt-16"></div>
    </section>
    <section class="card mt-16"><h3>Imagem por Regional</h3><p class="muted">Agrupa o resultado de ${referenceBr()} por Supervisão e gera imagem ou ZIP.</p><div class="fob-form" style="grid-template-columns:minmax(240px,1fr) auto auto"><select id="fobRegional" class="fob-input"><option value="">Selecione</option></select><button id="fobImage" class="btn btn-primary" type="button">Gerar imagem</button><button id="fobZip" class="btn btn-secondary" type="button">Gerar ZIP (todas)</button></div><div id="fobRegionalFeedback" class="fob-note" style="display:none"></div></section>
    <details class="card mt-16 fob-subcard"><summary style="cursor:pointer;font-weight:900;color:#bbf7d0">Lançamento manual / histórico de validação</summary><div class="card mt-16"><div class="fob-form"><input id="fobData" class="fob-input" type="date" value="${referenceIso()}"><input id="fobOs" class="fob-input" placeholder="Número da O.S."><input id="fobSup" class="fob-input" placeholder="Supervisão"><input id="fobCliente" class="fob-input" placeholder="Cliente"><input id="fobObs" class="fob-input" placeholder="Observação"><button id="fobManual" class="btn btn-primary" type="button">Registrar FOB 0</button></div></div><div id="fobHistory" class="mt-16"></div></details>
  `;
}

function renderWarnings() {
  const host = document.getElementById('fobWarnings');
  if (!host) return;
  const warnings = [...new Set(state.warnings.filter(Boolean))];
  host.innerHTML = warnings.length ? `<div class="fob-note fob-warning">${warnings.map(esc).join('<br>')}</div>` : '';
}

function regionalName(supervisao) {
  const text = String(supervisao || '').trim();
  if (!text) return 'SEM REGIONAL';
  const index = text.indexOf('-');
  return (index > 0 ? text.slice(0, index) : text).trim().toUpperCase();
}

function updateRegionalSelect() {
  const select = document.getElementById('fobRegional');
  if (!select) return;
  const values = [...new Set(state.rows.map((row) => regionalName(row.supervisao)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Selecione</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
}

function renderResult() {
  const host = document.getElementById('fobResult');
  const save = document.getElementById('fobSave');
  const csv = document.getElementById('fobCsv');
  if (!host) return;
  if (save) save.disabled = !state.rows.some((row) => row.status === 'PENDENTE');
  if (csv) csv.disabled = !state.rows.length;

  if (!state.rows.length) {
    host.innerHTML = `<div class="fob-empty">Nenhuma O.S. com movimento zero foi localizada no Mapa de Embarque de <strong>${referenceBr()}</strong>.</div>`;
    updateRegionalSelect();
    return;
  }

  const stats = state.stats || {};
  host.innerHTML = `
    <div class="fob-grid"><article class="card"><h3>Pendentes</h3><p class="metric" style="color:#fecaca">${BR_INT.format(stats.pendentes || 0)}</p></article><article class="card"><h3>Dois embarques</h3><p class="metric" style="color:#fde68a">${BR_INT.format(stats.dois || 0)}</p></article><article class="card"><h3>OK</h3><p class="metric" style="color:#bbf7d0">${BR_INT.format(stats.ok || 0)}</p></article><article class="card"><h3>Total FOB</h3><p class="metric">${BR_INT.format(state.rows.length)}</p></article></div>
    <div class="fob-diag"><span>Referência: ${referenceBr()}</span><span>Mapa: ${BR_INT.format(stats.mapa || 0)} O.S.</span><span>Cadastro O.S.: ${BR_INT.format(stats.operacional || 0)}</span><span>Produção FOB: ${BR_INT.format(stats.producao || 0)}</span><span>Produção NHE: ${BR_INT.format(stats.producaoNhe || 0)}</span><span>NHE: ${BR_INT.format(stats.nhe || 0)}</span></div>
    <div class="fob-table-wrap mt-16"><table class="fob-table"><thead><tr><th>Data</th><th>O.S. / Cliente</th><th>Supervisão</th><th>Funcionário</th><th>Saldo</th><th>Status</th><th>Observação</th></tr></thead><tbody>${state.rows.slice(0, 400).map((row) => `<tr><td>${esc(row.data_br)}</td><td><strong>${esc(row.os)}</strong><div class="muted">${esc(row.cliente || '-')}</div><div class="muted">${esc(row.local || '-')}</div></td><td>${esc(row.supervisao || '-')}</td><td>${esc(row.funcionario || '-')}</td><td>${esc(row.remanescente ?? '-')}</td><td><strong class="fob-status-${row.status.replaceAll(' ', '-')}">${esc(row.status)}</strong></td><td>${esc(row.observacao || '')}</td></tr>`).join('')}</tbody></table></div>`;
  updateRegionalSelect();
}

async function generateReport() {
  if (state.loading) return;
  state.loading = true;
  state.warnings = [];
  const feedback = document.getElementById('fobFeedback');
  if (feedback) feedback.textContent = `Carregando Mapa, último lote da Produção, NHE e cadastro de O.S. para ${referenceBr()}...`;

  try {
    const [mapa, producao, nhe, operacional] = await Promise.all([
      fetchAgentReferenceDay('grm_mapa_embarque_importacoes', MAX_MAPA, 'Mapa de Embarque'),
      fetchLatestProductionReferenceDay(),
      fetchAgentReferenceDay('grm_nhe_importacoes', MAX_NHE, 'NHE'),
      fetchOperationalOs(),
    ]);
    state.warnings.push(...mapa.warnings, ...producao.warnings, ...nhe.warnings, operacional.warning);
    const report = buildReport(mapa.rows, producao.rows, nhe.rows, operacional.rows);
    state.rows = report.rows;
    state.stats = report.stats;
    renderWarnings();
    renderResult();
    if (feedback) feedback.textContent = `Comparação de ${referenceBr()} concluída: ${state.rows.length} O.S., ${state.stats.pendentes} pendente(s).`;
  } catch (error) {
    console.error('[FOB comparação dia anterior]', error);
    state.rows = [];
    state.stats = null;
    renderResult();
    if (feedback) feedback.textContent = `Falha ao gerar comparação FOB de ${referenceBr()}: ${error.message || error}.`;
  } finally {
    state.loading = false;
  }
}

async function loadHistory() {
  const host = document.getElementById('fobHistory');
  const { data, error } = await supabase.from('logistica_fob').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) { if (host) host.innerHTML = `<div class="fob-empty">${esc(error.message)}</div>`; return; }
  state.fob = data || [];
  if (!host) return;
  if (!state.fob.length) { host.innerHTML = '<div class="fob-empty">Nenhum FOB salvo no histórico.</div>'; return; }
  host.innerHTML = `<div class="fob-table-wrap"><table class="fob-table"><thead><tr><th>Data</th><th>O.S.</th><th>Cliente</th><th>Status</th><th>Ação</th></tr></thead><tbody>${state.fob.map((row) => `<tr><td>${esc(brDate(row.data_referencia))}</td><td>${esc(row.numero_os || '-')}</td><td>${esc(row.cliente || '-')}</td><td>${esc(row.status || 'PENDENTE')}</td><td>${String(row.status || 'PENDENTE') === 'PENDENTE' ? `<button class="btn btn-primary" type="button" data-valid="${esc(row.id)}">✓</button> <button class="btn btn-secondary" type="button" data-invalid="${esc(row.id)}">✕</button>` : '-'}</td></tr>`).join('')}</tbody></table></div>`;
}

async function savePending() {
  const existing = new Set(state.fob.map((row) => `${row.numero_os || ''}|${String(row.data_referencia || '').slice(0, 10)}`));
  const rows = state.rows.filter((row) => row.status === 'PENDENTE' && !existing.has(`${row.os}|${row.data}`));
  if (!rows.length) { document.getElementById('fobFeedback').textContent = 'Nenhuma pendência nova para salvar.'; return; }
  const payload = rows.map((row) => ({ data_referencia: row.data, numero_os: row.os, supervisao: row.supervisao || null, cliente: row.cliente || null, tons_movimento: 0, tons_producao: 0, tons_nh: 0, observacao: [row.observacao, `Comparação automática do dia anterior (${referenceBr()}). Local: ${row.cidade || '-'} / ${row.local || '-'}`].filter(Boolean).join(' | '), status: 'PENDENTE', criado_por: state.user?.id || null }));
  for (let index = 0; index < payload.length; index += 300) {
    const { error } = await supabase.from('logistica_fob').insert(payload.slice(index, index + 300));
    if (error) throw error;
  }
  document.getElementById('fobFeedback').textContent = `${payload.length} pendência(s) de ${referenceBr()} salva(s).`;
  await loadHistory();
}

async function saveManual() {
  const data = document.getElementById('fobData')?.value;
  if (!data) return;
  const payload = { data_referencia: data, numero_os: document.getElementById('fobOs')?.value?.trim() || null, supervisao: document.getElementById('fobSup')?.value?.trim() || null, cliente: document.getElementById('fobCliente')?.value?.trim() || null, tons_movimento: 0, tons_producao: 0, tons_nh: 0, observacao: document.getElementById('fobObs')?.value?.trim() || null, status: 'PENDENTE', criado_por: state.user?.id || null };
  const { error } = await supabase.from('logistica_fob').insert(payload);
  if (error) throw error;
  await loadHistory();
}

async function validate(id, status) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('logistica_fob').update({ status, validado_por: state.user?.id || null, validado_em: now, updated_at: now }).eq('id', id);
  if (error) throw error;
  await loadHistory();
}

function exportCsv() {
  if (!state.rows.length) return;
  const lines = [['DATA', 'OS', 'CLIENTE', 'SUPERVISÃO', 'FUNCIONÁRIO', 'SALDO', 'STATUS', 'OBS'], ...state.rows.map((row) => [row.data_br, row.os, row.cliente, row.supervisao, row.funcionario, row.remanescente, row.status, row.observacao])];
  const csv = '\ufeff' + lines.map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `FOB_${referenceIso()}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

async function ensureLib(url, globalName) {
  if (window[globalName]) return;
  await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = url; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
}

function regionalNode(regional, rows) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:24px;font-family:Arial;width:1000px;color:#111';
  host.innerHTML = `<h2>FOB — ${esc(regional)}</h2><p>Referência: ${referenceBr()} · ${rows.length} O.S.</p><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${['DATA','OS','CLIENTE','SUPERVISÃO','FUNCIONÁRIO','STATUS'].map((h) => `<th style="border:1px solid #ccc;padding:6px;text-align:left">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td style="border:1px solid #ddd;padding:6px">${esc(row.data_br)}</td><td style="border:1px solid #ddd;padding:6px">${esc(row.os)}</td><td style="border:1px solid #ddd;padding:6px">${esc(row.cliente)}</td><td style="border:1px solid #ddd;padding:6px">${esc(row.supervisao)}</td><td style="border:1px solid #ddd;padding:6px">${esc(row.funcionario)}</td><td style="border:1px solid #ddd;padding:6px">${esc(row.status)}</td></tr>`).join('')}</tbody></table>`;
  document.body.appendChild(host);
  return host;
}

function downloadUrl(url, name) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); }
function regionalFeedback(text) { const host = document.getElementById('fobRegionalFeedback'); if (host) { host.style.display = 'block'; host.textContent = text; } }

async function imageRegional(all = false) {
  const selected = document.getElementById('fobRegional')?.value || '';
  if (!all && !selected) { regionalFeedback('Selecione uma regional.'); return; }
  await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
  if (all) await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
  const groups = new Map();
  state.rows.forEach((row) => { const regional = regionalName(row.supervisao); if (!groups.has(regional)) groups.set(regional, []); groups.get(regional).push(row); });
  if (!all) {
    const node = regionalNode(selected, groups.get(selected) || []); const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#fff' }); downloadUrl(canvas.toDataURL('image/png'), `FOB_${referenceIso()}_${selected.replace(/[^a-zA-Z0-9]+/g, '_')}.png`); node.remove(); regionalFeedback('Imagem gerada.'); return;
  }
  const zip = new window.JSZip(); const nodes = [];
  for (const [regional, rows] of groups) { const node = regionalNode(regional, rows); nodes.push(node); const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#fff' }); zip.file(`FOB_${referenceIso()}_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true }); }
  const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob); downloadUrl(url, `FOB_regionais_${referenceIso()}.zip`); URL.revokeObjectURL(url); nodes.forEach((node) => node.remove()); regionalFeedback(`ZIP gerado com ${groups.size} regional(is).`);
}

function bind(content) {
  content.addEventListener('click', async (event) => {
    try {
      if (event.target.closest('#fobReload')) { await generateReport(); await loadHistory(); return; }
      if (event.target.closest('#fobSave')) { await savePending(); return; }
      if (event.target.closest('#fobCsv')) { exportCsv(); return; }
      if (event.target.closest('#fobManual')) { await saveManual(); return; }
      if (event.target.closest('#fobImage')) { await imageRegional(false); return; }
      if (event.target.closest('#fobZip')) { await imageRegional(true); return; }
      const valid = event.target.closest('[data-valid]'); if (valid) { await validate(valid.dataset.valid, 'VALIDO'); return; }
      const invalid = event.target.closest('[data-invalid]'); if (invalid) await validate(invalid.dataset.invalid, 'INVALIDO');
    } catch (error) {
      console.error('[FOB ação]', error);
      const feedback = document.getElementById('fobFeedback'); if (feedback) feedback.textContent = error.message || String(error);
    }
  });
}

export async function renderContent(content) {
  injectStyles();
  state.user = await getCurrentUser();
  renderShell(content);
  bind(content);
  await Promise.all([generateReport(), loadHistory()]);
}

initProtectedPage('FOB — Logística', renderContent);
