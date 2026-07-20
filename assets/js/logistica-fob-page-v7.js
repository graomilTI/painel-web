import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 1000;
const MAX_MAPA = 6000;
const MAX_NHE = 12000;
const BR_INT = new Intl.NumberFormat('pt-BR');
const BR_NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const state = { user: null, fob: [], rows: [], stats: null, warnings: [], loading: false };

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();
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
  const text = String(value ?? '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
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
  const start = referenceDate(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const overnightEnd = new Date(end); overnightEnd.setHours(overnightEnd.getHours() + 6);
  return { startIso: start.toISOString(), endIso: end.toISOString(), overnightEndIso: overnightEnd.toISOString() };
}

function normalizedRow(raw) {
  const out = {};
  Object.entries(raw || {}).forEach(([key, value]) => { out[normalize(key)] = value; });
  return out;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normalize(alias);
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return '';
}

function rowDate(row) {
  return isoDate(pick(row, ['Data', 'Data OS', 'Data da OS', 'Data NHE']));
}

function movementUpdateDate(row) {
  return isoDate(pick(row, ['Última Atualização', 'Ultima Atualizacao', 'Última Atualizacao', 'Ultima Atualização']));
}

function explicitFobZero(row) {
  const obs = normalize(pick(row, ['Observações', 'Observacoes', 'Obs']));
  return obs.includes('FOB 0') || obs.includes('FOB ZERO') || obs.includes('FB 0') || obs.includes('FB ZERO');
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

function latestByOs(records) {
  const map = new Map();
  (records || []).forEach((record) => {
    const row = normalizedRow(record.dados_json || {});
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S', 'O S']));
    if (os && normalize(os) !== 'OS') map.set(os, { row, createdAt: record.created_at });
  });
  return map;
}

async function fetchLatestMapSnapshot() {
  const warnings = [];
  try {
    const { data: latestRows, error: latestError } = await supabase
      .from('grm_mapa_embarque_importacoes').select('created_at')
      .order('created_at', { ascending: false }).limit(1);
    if (latestError) throw latestError;
    const latestAt = latestRows?.[0]?.created_at;
    if (!latestAt) return { rows: [], warnings: ['Mapa de Embarque: nenhum lote sincronizado foi localizado.'], batchAt: null };

    const threshold = new Date(new Date(latestAt).getTime() - 5 * 60 * 1000).toISOString();
    const batch = await fetchPaged((from, to) => supabase
      .from('grm_mapa_embarque_importacoes')
      .select('dados_json,created_at')
      .gte('created_at', threshold)
      .order('created_at', { ascending: true })
      .range(from, to), MAX_MAPA);

    const map = latestByOs(batch);
    const rows = [...map.values()].filter(({ row }) => movementUpdateDate(row) === referenceIso());
    if (!rows.length) warnings.push(`Mapa de Embarque: o último lote não contém O.S. com Última Atualização em ${referenceBr()}.`);
    return { rows, warnings, batchAt: latestAt, rawCount: map.size };
  } catch (error) {
    warnings.push(`Mapa de Embarque: falha ao carregar o último lote (${error.message || error}).`);
    return { rows: [], warnings, batchAt: null, rawCount: 0 };
  }
}

async function fetchNheReferenceDay() {
  const values = [referenceBr(), referenceIso()];
  const { startIso, endIso, overnightEndIso } = referenceBounds();
  const collected = [];
  const errors = [];

  const runWindow = async (windowStart, windowEnd) => {
    for (const value of values) {
      try {
        const rows = await fetchPaged((from, to) => supabase
          .from('grm_nhe_importacoes').select('dados_json,created_at')
          .eq('dados_json->>Data', value)
          .gte('created_at', windowStart).lt('created_at', windowEnd)
          .range(from, to), MAX_NHE);
        collected.push(...rows);
      } catch (error) { errors.push(error); }
    }
  };

  await runWindow(startIso, endIso);
  if (!collected.length) await runWindow(endIso, overnightEndIso);
  const warnings = [];
  if (!collected.length && errors.length) warnings.push(`NHE: falha na consulta (${errors[0].message || errors[0]}).`);
  return { rows: collected, warnings };
}

async function fetchOperationalOs() {
  try {
    const rows = await fetchPaged((from, to) => supabase.from('operacional_os')
      .select('numero_os,cliente,embarque,supervisao,remanescente,lote').range(from, to), 10000);
    return { rows, warning: '' };
  } catch (error) {
    return { rows: [], warning: `Cadastro de O.S.: ${error.message || error}.` };
  }
}

function buildReport(movement, nheRecords, operationalRows) {
  const mapaByOs = new Map();
  movement.rows.forEach(({ row, createdAt }) => {
    const os = normOs(pick(row, ['OS', 'O.S.', 'O.S', 'O S']));
    if (os) mapaByOs.set(os, { row, createdAt });
  });

  const operationalByOs = new Map();
  operationalRows.forEach((row) => { const os = normOs(row.numero_os); if (os) operationalByOs.set(os, row); });

  const nheRows = nheRecords.map((record) => normalizedRow(record.dados_json || {}))
    .filter((row) => !rowDate(row) || rowDate(row) === referenceIso());
  const nheOs = new Set();
  const nheCombo = new Set();
  nheRows.forEach((row) => {
    const os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    if (os) nheOs.add(os);
    const cliente = pick(row, ['Cliente']);
    const cidade = pick(row, ['Cidade de Embarque', 'Cidade']);
    const local = pick(row, ['Embarque', 'Local', 'Local de Embarque']);
    if (cliente && cidade && local) nheCombo.add(`${normalize(cliente)}|${normalize(cidade)}|${normalize(local)}`);
  });

  const candidates = [];
  mapaByOs.forEach(({ row }, os) => {
    const tons = pick(row, ['Tons Hoje', 'TonsHoje', 'Tons']);
    if (String(tons ?? '').trim() === '' || numberLoose(tons) !== 0) return;
    const cadastro = operationalByOs.get(os) || {};
    candidates.push({
      row, os,
      cliente: pick(row, ['Cliente']) || cadastro.cliente || '',
      cidade: pick(row, ['Cidade']),
      local: pick(row, ['Local', 'Local de Embarque']) || cadastro.embarque || '',
      supervisao: pick(row, ['Supervisão', 'Supervisao']) || cadastro.supervisao || '',
      funcionario: pick(row, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario']),
      remanescente: numberLoose(pick(row, ['Remanescente']) || cadastro.remanescente),
      observacao: pick(row, ['Observações', 'Observacoes', 'Obs']),
    });
  });

  const comboCount = new Map();
  candidates.forEach((item) => {
    const key = `${normalize(item.cliente)}|${normalize(item.cidade)}|${normalize(item.local)}`;
    comboCount.set(key, (comboCount.get(key) || 0) + 1);
  });

  const rows = candidates.map((item) => {
    const combo = `${normalize(item.cliente)}|${normalize(item.cidade)}|${normalize(item.local)}`;
    let status = 'PENDENTE';
    if (explicitFobZero(item.row) || nheOs.has(item.os)) status = 'OK';
    else if ((comboCount.get(combo) || 0) >= 2 || nheCombo.has(combo)) status = 'DOIS EMBARQUES';
    return { data: referenceIso(), data_br: referenceBr(), ...item, status };
  });

  const rank = { PENDENTE: 0, 'DOIS EMBARQUES': 1, OK: 2 };
  rows.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    || String(a.supervisao).localeCompare(String(b.supervisao), 'pt-BR')
    || String(a.os).localeCompare(String(b.os), 'pt-BR'));

  return {
    rows,
    stats: {
      mapaBruto: movement.rawCount || 0,
      atualizadasOntem: mapaByOs.size,
      loteMapa: movement.batchAt,
      nhe: nheRows.length,
      pendentes: rows.filter((r) => r.status === 'PENDENTE').length,
      dois: rows.filter((r) => r.status === 'DOIS EMBARQUES').length,
      ok: rows.filter((r) => r.status === 'OK').length,
    },
  };
}

function injectStyles() {
  if (document.getElementById('fob-v7-styles')) return;
  const style = document.createElement('style');
  style.id = 'fob-v7-styles';
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
        <div><h3>FOB — Fechamento do dia anterior</h3><p class="muted">Usa o último Mapa sincronizado e considera somente O.S. cuja Última Atualização ocorreu em ${referenceBr()}.</p></div>
        <div class="fob-actions"><button id="fobReload" class="btn btn-secondary" type="button">↻ Atualizar</button><button id="fobSave" class="btn btn-secondary" type="button" disabled>Salvar pendentes no painel</button><button id="fobCsv" class="btn btn-secondary" type="button" disabled>Exportar CSV</button></div>
      </div>
      <div class="fob-note fob-reference">Data de referência: <strong>${referenceBr()}</strong></div>
      <div class="fob-note">Regra: Última Atualização = ${referenceBr()} + Tons Hoje = 0. Observação com FOB 0/FOB ZERO/FB ZERO ou registro no NHE classifica como OK.</div>
      <div id="fobFeedback" class="feedback mt-16">Carregando fechamento...</div>
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
  if (!state.rows.length) { host.innerHTML = `<div class="fob-empty">Nenhuma O.S. com Última Atualização em ${referenceBr()} e Tons Hoje = 0 foi localizada.</div>`; return; }

  const stats = state.stats || {};
  const batchText = stats.loteMapa ? new Date(stats.loteMapa).toLocaleString('pt-BR') : '-';
  host.innerHTML = `
    <div class="fob-grid"><article class="card"><h3>Pendentes</h3><p class="metric" style="color:#fecaca">${BR_INT.format(stats.pendentes || 0)}</p></article><article class="card"><h3>Dois embarques</h3><p class="metric" style="color:#fde68a">${BR_INT.format(stats.dois || 0)}</p></article><article class="card"><h3>OK</h3><p class="metric" style="color:#bbf7d0">${BR_INT.format(stats.ok || 0)}</p></article><article class="card"><h3>Total FOB</h3><p class="metric">${BR_INT.format(state.rows.length)}</p></article></div>
    <div class="fob-diag"><span>Referência: ${referenceBr()}</span><span>Último lote: ${esc(batchText)}</span><span>Mapa: ${BR_INT.format(stats.mapaBruto || 0)} O.S.</span><span>Atualizadas ontem: ${BR_INT.format(stats.atualizadasOntem || 0)}</span><span>NHE: ${BR_INT.format(stats.nhe || 0)}</span></div>
    <div class="fob-table-wrap mt-16"><table class="fob-table"><thead><tr><th>Data</th><th>O.S. / Cliente</th><th>Supervisão</th><th>Funcionário</th><th>Saldo</th><th>Status</th><th>Observação</th></tr></thead><tbody>${state.rows.map((row) => `<tr><td>${esc(row.data_br)}</td><td><strong>${esc(row.os)}</strong><div class="muted">${esc(row.cliente || '-')}</div><div class="muted">${esc(row.local || '-')}</div></td><td>${esc(row.supervisao || '-')}</td><td>${esc(row.funcionario || '-')}</td><td>${esc(BR_NUM.format(row.remanescente || 0))}</td><td><strong class="fob-status-${row.status.replaceAll(' ', '-')}">${esc(row.status)}</strong></td><td>${esc(row.observacao || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

async function generateReport() {
  if (state.loading) return;
  state.loading = true;
  state.warnings = [];
  const feedback = document.getElementById('fobFeedback');
  if (feedback) feedback.textContent = `Carregando último Mapa e NHE de ${referenceBr()}...`;
  try {
    const [movement, nhe, operational] = await Promise.all([fetchLatestMapSnapshot(), fetchNheReferenceDay(), fetchOperationalOs()]);
    state.warnings.push(...movement.warnings, ...nhe.warnings, operational.warning);
    const report = buildReport(movement, nhe.rows, operational.rows);
    state.rows = report.rows; state.stats = report.stats;
    renderWarnings(); renderResult();
    if (feedback) feedback.textContent = `Fechamento de ${referenceBr()}: ${state.rows.length} O.S., ${state.stats.pendentes} pendente(s), ${state.stats.ok} OK.`;
  } catch (error) {
    console.error('[FOB v7]', error);
    state.rows = []; state.stats = null; renderResult();
    if (feedback) feedback.textContent = `Falha ao gerar fechamento FOB: ${error.message || error}.`;
  } finally { state.loading = false; }
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
  const payload = rows.map((row) => ({ data_referencia: row.data, numero_os: row.os, supervisao: row.supervisao || null, cliente: row.cliente || null, tons_movimento: 0, tons_producao: 0, tons_nh: 0, observacao: [row.observacao, `Fechamento automático de ${referenceBr()}. Local: ${row.cidade || '-'} / ${row.local || '-'}`].filter(Boolean).join(' | '), status: 'PENDENTE', criado_por: state.user?.id || null }));
  for (let i = 0; i < payload.length; i += 300) { const { error } = await supabase.from('logistica_fob').insert(payload.slice(i, i + 300)); if (error) throw error; }
  document.getElementById('fobFeedback').textContent = `${payload.length} pendência(s) salva(s).`; await loadHistory();
}

async function saveManual() {
  const data = document.getElementById('fobData')?.value; if (!data) return;
  const payload = { data_referencia: data, numero_os: document.getElementById('fobOs')?.value?.trim() || null, supervisao: document.getElementById('fobSup')?.value?.trim() || null, cliente: document.getElementById('fobCliente')?.value?.trim() || null, tons_movimento: 0, tons_producao: 0, tons_nh: 0, observacao: document.getElementById('fobObs')?.value?.trim() || null, status: 'PENDENTE', criado_por: state.user?.id || null };
  const { error } = await supabase.from('logistica_fob').insert(payload); if (error) throw error; await loadHistory();
}

async function validate(id, status) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('logistica_fob').update({ status, validado_por: state.user?.id || null, validado_em: now, updated_at: now }).eq('id', id);
  if (error) throw error; await loadHistory();
}

function exportCsv() {
  if (!state.rows.length) return;
  const lines = [['DATA','OS','CLIENTE','SUPERVISÃO','FUNCIONÁRIO','SALDO','STATUS','OBS'], ...state.rows.map((r) => [r.data_br,r.os,r.cliente,r.supervisao,r.funcionario,r.remanescente,r.status,r.observacao])];
  const csv = '\ufeff' + lines.map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `FOB_${referenceIso()}.csv`; a.click(); URL.revokeObjectURL(url);
}

function bind(content) {
  content.addEventListener('click', async (event) => {
    try {
      if (event.target.closest('#fobReload')) { await generateReport(); await loadHistory(); return; }
      if (event.target.closest('#fobSave')) { await savePending(); return; }
      if (event.target.closest('#fobCsv')) { exportCsv(); return; }
      if (event.target.closest('#fobManual')) { await saveManual(); return; }
      const valid = event.target.closest('[data-valid]'); if (valid) { await validate(valid.dataset.valid, 'VALIDO'); return; }
      const invalid = event.target.closest('[data-invalid]'); if (invalid) await validate(invalid.dataset.invalid, 'INVALIDO');
    } catch (error) { const feedback = document.getElementById('fobFeedback'); if (feedback) feedback.textContent = error.message || String(error); }
  });
}

export async function renderContent(content) {
  injectStyles(); state.user = await getCurrentUser(); renderShell(content); bind(content);
  await Promise.all([generateReport(), loadHistory()]);
}

initProtectedPage('FOB — Logística', renderContent);
