import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 1000;
const MAX_MAP_ROWS = 60000;
const MAX_SERVICE_ROWS = 25000;
const BR_INT = new Intl.NumberFormat('pt-BR');

const state = {
  user: null,
  rows: [],
  stats: null,
  fob: [],
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

function movementDate(row) {
  // No Apps Script, COL_MOV.Data aponta explicitamente para "Última Atualização".
  return ymd(pick(row, ['Última Atualização', 'Ultima Atualizacao', 'Última Atualizacao', 'Ultima Atualização']));
}

function serviceDate(row) {
  return ymd(pick(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
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

function splitBatches(records, maxGapMs = 120000) {
  const sorted = [...(records || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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

function dedupeMovement(records) {
  const map = new Map();
  (records || []).forEach((record) => {
    const row = normalizedRow(record.dados_json || {});
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S', 'O S']));
    if (os && normText(os) !== 'OS') map.set(os, { row, createdAt: record.created_at });
  });
  return [...map.values()];
}

async function fetchMovementDaily() {
  const end = new Date();
  const start = referenceDate();
  start.setHours(22, 0, 0, 0);

  const records = await fetchPaged((from, to) => supabase
    .from('grm_mapa_embarque_importacoes')
    .select('dados_json,created_at')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true })
    .range(from, to), MAX_MAP_ROWS);

  const batches = splitBatches(records);
  let selected = null;

  batches.forEach((batch) => {
    const deduped = dedupeMovement(batch);
    const movementRows = deduped.filter(({ row }) => movementDate(row) === referenceIso());
    const score = movementRows.length;
    const batchAt = batch[0]?.created_at || null;
    if (!selected || score > selected.score || (score === selected.score && String(batchAt) > String(selected.batchAt))) {
      selected = { score, batchAt, rawCount: deduped.length, rows: movementRows };
    }
  });

  if (!selected || !selected.rows.length) {
    return {
      rows: [],
      rawCount: 0,
      batchAt: null,
      warning: `Movimentação Diária: nenhum lote com Última Atualização em ${referenceBr()} foi localizado entre o fechamento de ontem e hoje.`,
    };
  }

  return { ...selected, warning: '' };
}

async function fetchLatestServiceBatch(table, label) {
  const lookback = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  try {
    const { data: latest, error: latestError } = await supabase
      .from(table)
      .select('created_at')
      .gte('created_at', lookback)
      .order('created_at', { ascending: false })
      .limit(1);
    if (latestError) throw latestError;

    const latestAt = latest?.[0]?.created_at;
    if (!latestAt) return { rows: [], warning: `${label}: nenhum lote recente localizado.` };

    const threshold = new Date(new Date(latestAt).getTime() - 5 * 60 * 1000).toISOString();
    const records = await fetchPaged((from, to) => supabase
      .from(table)
      .select('dados_json,created_at')
      .gte('created_at', threshold)
      .lte('created_at', latestAt)
      .order('created_at', { ascending: true })
      .range(from, to), MAX_SERVICE_ROWS);

    const rows = records
      .map((record) => normalizedRow(record.dados_json || {}))
      .filter((row) => {
        const date = serviceDate(row);
        return !date || date === referenceIso();
      });

    return { rows, warning: '' };
  } catch (error) {
    return { rows: [], warning: `${label}: não foi possível consultar o último lote (${error.message || error}).` };
  }
}

function compareFob(movementRows, productionRows, nheRows) {
  const setNheOsData = new Set();
  const setNheOsOnly = new Set();
  const setNheCcld = new Set();

  nheRows.forEach((row) => {
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    const date = serviceDate(row);
    if (os) setNheOsOnly.add(os);
    if (os && date) setNheOsData.add(`${os}|${brDate(date)}`);

    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade de Embarque', 'Cidade']);
    const local = pick(row, ['Embarque', 'Local', 'Local de Embarque']);
    if (cliente && cidade && local && date) {
      setNheCcld.add(`${normText(cliente)}|${normText(cidade)}|${normText(local)}|${brDate(date)}`);
    }
  });

  const setProdNheOsData = new Set();
  const setProdNheOsOnly = new Set();
  productionRows.forEach((row) => {
    const os = normOs(pick(row, ['O.S.', 'OS']));
    const date = serviceDate(row);
    const cargas = normText(pick(row, ['Cargas']));
    if (!os || cargas !== 'NHE') return;
    setProdNheOsOnly.add(os);
    if (date) setProdNheOsData.add(`${os}|${brDate(date)}`);
  });

  const movementCcldCount = new Map();
  movementRows.forEach(({ row }) => {
    const date = movementDate(row);
    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade']);
    const local = pick(row, ['Local', 'Local de Embarque']);
    if (!date || !cliente || !cidade || !local) return;
    const key = `${normText(cliente)}|${normText(cidade)}|${normText(local)}|${brDate(date)}`;
    movementCcldCount.set(key, (movementCcldCount.get(key) || 0) + 1);
  });

  const rows = [];
  movementRows.forEach(({ row }) => {
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S']));
    const date = movementDate(row);
    if (!os || !date) return;

    const tonsHoje = toNumberLoose(pick(row, ['Tons Hoje', 'TonsHoje', 'Tons']));
    if (tonsHoje !== 0) return;

    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade']);
    const local = pick(row, ['Local', 'Local de Embarque']);
    const keyOsDate = `${os}|${brDate(date)}`;

    let status = 'PENDENTE';
    const okNhe = setNheOsData.has(keyOsDate) || setNheOsOnly.has(os);
    const okProd = setProdNheOsData.has(keyOsDate) || setProdNheOsOnly.has(os);

    if (okNhe || okProd) {
      status = 'OK';
    } else {
      const keyCcld = `${normText(cliente)}|${normText(cidade)}|${normText(local)}|${brDate(date)}`;
      const count = movementCcldCount.get(keyCcld) || 0;
      if (count >= 2 || setNheCcld.has(keyCcld)) status = 'DOIS EMBARQUES';
    }

    rows.push({
      data: date,
      data_br: brDate(date),
      os,
      supervisao: pick(row, ['Supervisão', 'Supervisao']),
      funcionario: pick(row, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario']),
      cliente,
      cidade,
      local,
      tons_movimento: tonsHoje,
      status,
      observacao: pick(row, ['Observações', 'Observacoes', 'Obs']),
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
      prodNheOsOnly: setProdNheOsOnly.size,
      pendentes: rows.filter((row) => row.status === 'PENDENTE').length,
      dois: rows.filter((row) => row.status === 'DOIS EMBARQUES').length,
      ok: rows.filter((row) => row.status === 'OK').length,
    },
  };
}

function injectStyles() {
  if (document.getElementById('fob-v8-styles')) return;
  const style = document.createElement('style');
  style.id = 'fob-v8-styles';
  style.textContent = `
    .fob-actions{display:flex;gap:8px;flex-wrap:wrap}.fob-actions .btn{width:auto!important}.fob-note{border:1px solid rgba(59,130,246,.28);background:rgba(59,130,246,.08);color:#bfdbfe;border-radius:16px;padding:12px;margin-top:12px;font-size:13px}.fob-reference{border-color:rgba(74,222,128,.38);background:rgba(22,101,52,.16);color:#dcfce7;font-weight:800}.fob-warning{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:#fde68a}.fob-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fob-diag{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fob-diag span{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 10px;font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.28)}
    .fob-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.fob-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;color:#e2e2f0}.fob-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;border-bottom:1px solid rgba(52,211,153,.18)}.fob-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top}.fob-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.fob-status-PENDENTE{color:#fecaca}.fob-status-OK{color:#bbf7d0}.fob-status-DOIS-EMBARQUES{color:#fde68a}.fob-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;padding:9px;color-scheme:dark}.fob-form{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}.fob-subcard summary::marker{color:#86efac}
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
      <div class="fob-note">Regra original: Movimentação Diária com Tons Hoje = 0. OK por NHE ou Produção com Cargas = NHE; DOIS EMBARQUES por Cliente + Cidade + Local + Data repetidos; restante PENDENTE.</div>
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
  host.innerHTML = `
    <div class="fob-grid"><article class="card"><h3>Pendentes</h3><p class="metric" style="color:#fecaca">${BR_INT.format(stats.pendentes || 0)}</p></article><article class="card"><h3>Dois embarques</h3><p class="metric" style="color:#fde68a">${BR_INT.format(stats.dois || 0)}</p></article><article class="card"><h3>OK</h3><p class="metric" style="color:#bbf7d0">${BR_INT.format(stats.ok || 0)}</p></article><article class="card"><h3>Total FOB</h3><p class="metric">${BR_INT.format(state.rows.length)}</p></article></div>
    <div class="fob-diag"><span>Movimentação Diária: ${BR_INT.format(stats.movimento || 0)}</span><span>Produção: ${BR_INT.format(stats.producao || 0)}</span><span>NHE: ${BR_INT.format(stats.nhe || 0)}</span><span>NHE OS-only: ${BR_INT.format(stats.nheOsOnly || 0)}</span><span>Produção NHE OS-only: ${BR_INT.format(stats.prodNheOsOnly || 0)}</span></div>
    <div class="fob-table-wrap mt-16"><table class="fob-table"><thead><tr><th>Data</th><th>O.S.</th><th>Supervisão</th><th>Funcionário</th><th>Status</th><th>Observação</th></tr></thead><tbody>${state.rows.map((row) => `<tr><td>${esc(row.data_br)}</td><td><strong>${esc(row.os)}</strong><div class="muted">${esc(row.cliente || '-')}</div></td><td>${esc(row.supervisao || '-')}</td><td>${esc(row.funcionario || '-')}</td><td><strong class="fob-status-${row.status.replaceAll(' ', '-')}">${esc(row.status)}</strong></td><td>${esc(row.observacao || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

async function generateReport() {
  if (state.loading) return;
  state.loading = true;
  state.warnings = [];
  const feedback = document.getElementById('fobFeedback');
  if (feedback) feedback.textContent = `Carregando fechamento de ${referenceBr()}...`;

  try {
    const [movement, production, nhe] = await Promise.all([
      fetchMovementDaily(),
      fetchLatestServiceBatch('grm_producao_diaria_importacoes', 'Produção Diária'),
      fetchLatestServiceBatch('grm_nhe_importacoes', 'NHE'),
    ]);

    state.warnings.push(movement.warning, production.warning, nhe.warning);
    const report = compareFob(movement.rows, production.rows, nhe.rows);
    state.rows = report.rows;
    state.stats = { ...report.stats, batchAt: movement.batchAt, rawCount: movement.rawCount };
    renderWarnings();
    renderResult();

    if (feedback) {
      const batchText = movement.batchAt ? new Date(movement.batchAt).toLocaleString('pt-BR') : '-';
      feedback.textContent = `Comparação concluída: ${state.rows.length} linha(s), ${state.stats.pendentes} pendente(s), lote MOV ${batchText}.`;
    }
  } catch (error) {
    console.error('[FOB v8]', error);
    state.rows = [];
    state.stats = null;
    renderResult();
    if (feedback) feedback.textContent = `Falha ao gerar FOB: ${error.message || error}.`;
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
  const pending = state.rows.filter((row) => row.status === 'PENDENTE' && !existing.has(`${row.os}|${row.data}`));
  if (!pending.length) { document.getElementById('fobFeedback').textContent = 'Nenhuma pendência nova para salvar.'; return; }

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
  const { error } = await supabase.from('logistica_fob').update({ status, validado_por: state.user?.id || null, validado_em: now, updated_at: now }).eq('id', id);
  if (error) throw error;
  await loadHistory();
}

function exportCsv() {
  if (!state.rows.length) return;
  const lines = [['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'STATUS', 'OBS'], ...state.rows.map((row) => [row.data_br, row.os, row.supervisao, row.funcionario, row.status, row.observacao])];
  const csv = '\ufeff' + lines.map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
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
      if (event.target.closest('#fobReload')) { await generateReport(); await loadHistory(); return; }
      if (event.target.closest('#fobSave')) { await savePending(); return; }
      if (event.target.closest('#fobCsv')) { exportCsv(); return; }
      if (event.target.closest('#fobManual')) { await saveManual(); return; }
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
  await Promise.all([generateReport(), loadHistory()]);
}

initProtectedPage('FOB — Logística', renderContent);
