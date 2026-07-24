import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const HISTORY_TABLE = 'logistica_pre_conferencia_os';
const LABEL = {
  OK: 'OK',
  NOT_FOUND: 'Não localizada',
  MISSING: 'Falta lançar',
  PLATE: 'Placa errada',
  WEIGHT: 'Peso errado',
};
const cache = new Map();
let currentUser = null;
let historyAvailable = true;
let busy = false;

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
const normCode = (v) => norm(v).replace(/[^A-Z0-9]/g, '');
const osNumber = (row) => String(row?.numero_os ?? row?.os ?? '').trim();
const laudoUrls = (row) => String(row?.observacao_logistica || '').startsWith('LAUDO:')
  ? String(row.observacao_logistica).slice(6).split(',').map((v) => v.trim()).filter(Boolean) : [];

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value ?? '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if ((text.match(/\./g) || []).length > 1) text = text.replace(/\./g, '');
  const valueNumber = Number(text);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}

function jsonField(json, names) {
  const entries = Object.entries(json || {});
  for (const name of names) {
    const key = normCode(name);
    const exact = entries.find(([k, v]) => normCode(k) === key && String(v ?? '').trim());
    if (exact) return { value: exact[1], key: exact[0] };
  }
  for (const name of names) {
    const key = normCode(name);
    const partial = entries.find(([k, v]) => normCode(k).includes(key) && String(v ?? '').trim());
    if (partial) return { value: partial[1], key: partial[0] };
  }
  return { value: null, key: '' };
}

function systemLoad(row, index) {
  const json = row.dados_json || {};
  const load = row.carga ?? jsonField(json, ['Carga', 'Nº carga', 'Ticket', 'Romaneio', 'Laudo']).value ?? row.laudo ?? '';
  const plate = row.placa ?? jsonField(json, ['Placa', 'Placa veículo']).value ?? '';
  const nf = row.nota_fiscal ?? jsonField(json, ['Nota fiscal', 'NF', 'NFe']).value ?? '';
  const weightField = jsonField(json, ['Peso líquido kg', 'Peso líquido', 'Peso kg', 'Peso', 'Quantidade kg', 'Toneladas', 'Tons']);
  let weight = numberValue(row.peso_kg ?? row.peso ?? weightField.value);
  if (weight != null && normCode(weightField.key).includes('TON')) weight *= 1000;
  return { id: row.id ?? `sys-${index}`, carga: String(load).trim(), placa: String(plate).trim(), pesoKg: weight, nf: String(nf).trim() };
}

function reportLoad(row, index, url) {
  return {
    id: `ocr-${index}`,
    carga: String(row?.carga ?? row?.numero_carga ?? row?.laudo ?? row?.ticket ?? '').trim(),
    placa: String(row?.placa ?? '').trim(),
    pesoKg: numberValue(row?.peso_kg ?? row?.peso),
    nf: String(row?.nota_fiscal ?? row?.nf ?? '').trim(),
    pagina: numberValue(row?.pagina),
    url,
  };
}

function parseOcr(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const options = [clean];
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) options.push(clean.slice(start, end + 1));
  for (const candidate of options) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.cargas)) return parsed.cargas;
    } catch { /* próximo formato */ }
  }
  throw new Error('O OCR não devolveu uma lista válida de cargas.');
}

function compare(systemRows, reportRows) {
  const result = [];
  const used = new Set();
  reportRows.forEach((report) => {
    const available = systemRows.map((system, index) => ({ system, index })).filter(({ index }) => !used.has(index));
    const plate = normCode(report.placa); const load = normCode(report.carga);
    let found = available.find(({ system }) => plate && load && normCode(system.placa) === plate && normCode(system.carga) === load);
    let status = LABEL.OK; let note = 'Placa, carga e peso correspondem.';
    if (!found && load) {
      const sameLoad = available.filter(({ system }) => normCode(system.carga) === load);
      if (sameLoad.length === 1) {
        found = sameLoad[0]; status = LABEL.PLATE;
        note = `Carga localizada, mas a placa diverge: sistema ${found.system.placa || '-'} × relatório ${report.placa || '-'}.`;
      }
    }
    if (!found && plate) {
      const samePlate = available.filter(({ system }) => normCode(system.placa) === plate);
      if (samePlate.length === 1 && (!load || !normCode(samePlate[0].system.carga))) found = samePlate[0];
    }
    if (!found) {
      result.push({ status: LABEL.NOT_FOUND, system: null, report, note: 'Carga lida no relatório, mas não localizada nesta O.S.' });
      return;
    }
    used.add(found.index);
    const diff = found.system.pesoKg == null || report.pesoKg == null ? null : Math.abs(found.system.pesoKg - report.pesoKg);
    if (status === LABEL.OK && (found.system.pesoKg == null || report.pesoKg == null)) {
      status = LABEL.WEIGHT; note = 'Peso não localizado em uma das fontes.';
    } else if (status === LABEL.OK && diff > 1) {
      status = LABEL.WEIGHT; note = `Peso diverge em ${formatKg(diff)}.`;
    } else if (status === LABEL.PLATE && diff > 1) note += ` O peso também diverge em ${formatKg(diff)}.`;
    result.push({ status, system: found.system, report, note });
  });
  systemRows.forEach((system, index) => {
    if (!used.has(index)) result.push({ status: LABEL.MISSING, system, report: null, note: 'Carga cadastrada na O.S., mas não identificada no relatório.' });
  });
  const order = { [LABEL.NOT_FOUND]: 1, [LABEL.MISSING]: 2, [LABEL.PLATE]: 3, [LABEL.WEIGHT]: 4, [LABEL.OK]: 5 };
  return result.sort((a, b) => order[a.status] - order[b.status]);
}

function formatKg(value) {
  return value == null ? '-' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)} kg`;
}

function totals(result) {
  return result.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    acc.total += 1;
    if (row.status !== LABEL.OK) acc.errors += 1;
    return acc;
  }, { total: 0, errors: 0 });
}

function installStyle() {
  if (document.getElementById('preConfStyle')) return;
  const style = document.createElement('style'); style.id = 'preConfStyle';
  style.textContent = `
    #logConferenciasLaudos .pc-actions{display:flex!important;flex-direction:row!important;gap:6px;min-width:390px}#logConferenciasLaudos .pc-actions .btn{width:auto!important;min-width:105px;white-space:nowrap}#logConferenciasLaudos .pc-actions .btn:disabled{opacity:.45}
    .pc-bg{position:fixed;inset:0;z-index:10080;background:rgba(0,8,5,.84);display:flex;align-items:center;justify-content:center;padding:18px}.pc-box{width:min(1500px,98vw);max-height:94vh;display:flex;flex-direction:column;background:#031b12;border:1px solid rgba(52,211,153,.3);border-radius:20px;overflow:hidden;color:#e5f7ee}.pc-head,.pc-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid rgba(52,211,153,.18)}.pc-head h2{margin:0}.pc-head p{margin:4px 0 0;color:#8dac9d;font-size:12px}.pc-body{padding:16px 18px;overflow:auto}.pc-kpis{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin-bottom:12px}.pc-kpi{padding:10px;border:1px solid rgba(52,211,153,.15);border-radius:13px;background:rgba(2,17,12,.6)}.pc-kpi small{display:block;color:#83a697;text-transform:uppercase}.pc-kpi b{font-size:21px}.pc-docs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.pc-docs a{color:#9cf5c8;text-decoration:none;border:1px solid rgba(52,211,153,.2);border-radius:999px;padding:6px 9px}.pc-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:14px}.pc-table{width:100%;min-width:1120px;border-collapse:collapse}.pc-table th{position:sticky;top:0;background:#06251a;color:#8ef0bd;padding:9px;text-align:left;font-size:11px;text-transform:uppercase}.pc-table td{padding:9px;border-top:1px solid rgba(148,163,184,.1);vertical-align:top}.pc-tag{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:900}.pc-ok{background:rgba(34,197,94,.14);color:#bbf7d0}.pc-warn{background:rgba(245,158,11,.14);color:#fde68a}.pc-bad{background:rgba(239,68,68,.14);color:#fecaca}.pc-close{border:1px solid rgba(148,163,184,.2);background:#09261b;color:white;border-radius:10px;padding:8px 12px;cursor:pointer}.pc-loading,.pc-error{padding:36px;text-align:center}.pc-error{color:#fecaca}.pc-foot{justify-content:flex-end;border-bottom:0;border-top:1px solid rgba(52,211,153,.18)}@media(max-width:800px){.pc-kpis{grid-template-columns:1fr 1fr}.pc-bg{padding:6px}}
  `;
  document.head.appendChild(style);
}

function modal() {
  let el = document.getElementById('preConfModal');
  if (el) return el;
  el = document.createElement('div'); el.id = 'preConfModal'; el.className = 'pc-bg'; el.hidden = true;
  el.innerHTML = `<section class="pc-box"><header class="pc-head"><div><h2 id="pcTitle"></h2><p id="pcSub"></p></div><button class="pc-close" data-pc-close>×</button></header><div class="pc-body" id="pcBody"></div><footer class="pc-foot"><button class="btn btn-secondary" data-pc-close>Fechar</button></footer></section>`;
  document.body.appendChild(el);
  el.addEventListener('click', (event) => { if (event.target === el || event.target.closest('[data-pc-close]')) closeModal(); });
  return el;
}

function closeModal() { const el = modal(); el.hidden = true; document.body.style.overflow = ''; }
function modalLoading(row) { const el = modal(); el.hidden = false; document.body.style.overflow = 'hidden'; el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`; el.querySelector('#pcSub').textContent = 'Leitura OCR e comparação por placa/carga.'; el.querySelector('#pcBody').innerHTML = '<div class="pc-loading">Analisando os relatórios…</div>'; }
function modalError(row, error) { const el = modal(); el.hidden = false; el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`; el.querySelector('#pcSub').textContent = 'A leitura não foi concluída.'; el.querySelector('#pcBody').innerHTML = `<div class="pc-error">${esc(error?.message || error)}</div>`; }

function showResult(row, analysis) {
  const el = modal(); const count = totals(analysis.result); const badgeClass = (status) => status === LABEL.OK ? 'pc-ok' : [LABEL.PLATE, LABEL.WEIGHT].includes(status) ? 'pc-warn' : 'pc-bad';
  el.hidden = false; document.body.style.overflow = 'hidden';
  el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`;
  el.querySelector('#pcSub').textContent = `${analysis.system.length} carga(s) no sistema · ${analysis.report.length} lida(s) pelo OCR`;
  el.querySelector('#pcBody').innerHTML = `
    <div class="pc-kpis"><div class="pc-kpi"><small>Total</small><b>${count.total}</b></div><div class="pc-kpi"><small>OK</small><b>${count[LABEL.OK] || 0}</b></div><div class="pc-kpi"><small>Placa/Peso</small><b>${(count[LABEL.PLATE] || 0) + (count[LABEL.WEIGHT] || 0)}</b></div><div class="pc-kpi"><small>Falta lançar</small><b>${count[LABEL.MISSING] || 0}</b></div><div class="pc-kpi"><small>Não localizada</small><b>${count[LABEL.NOT_FOUND] || 0}</b></div></div>
    <div class="pc-docs">${analysis.urls.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener">Relatório ${i + 1}</a>`).join('')}</div>
    <div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Status</th><th>Carga</th><th>Placa sistema</th><th>Placa relatório</th><th>Peso sistema</th><th>Peso relatório</th><th>NF</th><th>Anotação</th></tr></thead><tbody>
      ${analysis.result.map((item) => `<tr><td><span class="pc-tag ${badgeClass(item.status)}">${esc(item.status)}</span></td><td>${esc(item.system?.carga || item.report?.carga || '-')}</td><td>${esc(item.system?.placa || '-')}</td><td>${esc(item.report?.placa || '-')}</td><td>${esc(formatKg(item.system?.pesoKg))}</td><td>${esc(formatKg(item.report?.pesoKg))}</td><td>${esc(item.report?.nf || item.system?.nf || '-')}</td><td>${esc(item.note)}</td></tr>`).join('') || '<tr><td colspan="8">Nenhuma carga encontrada.</td></tr>'}
    </tbody></table></div>`;
}

async function getOs(id) {
  const { data, error } = await supabase.from('operacional_os').select('*').eq('id', id).maybeSingle();
  if (error) throw error; if (!data) throw new Error('O.S. não encontrada.'); return data;
}

async function getSystemLoads(row) {
  const fields = 'id,os,placa,laudo,nota_fiscal,dados_json,data_classificacao,created_at';
  let response = await supabase.from('grm_cargas_importacoes').select(fields).eq('os', osNumber(row)).limit(5000);
  if (response.error || !response.data?.length) {
    const fallback = await supabase.from('grm_cargas_importacoes').select(fields).contains('dados_json', { 'O.S.': osNumber(row) }).limit(5000);
    if (!fallback.error && fallback.data?.length) response = fallback; else if (response.error) response = fallback;
  }
  if (response.error) throw new Error(`Erro ao carregar cargas: ${response.error.message}`);
  return (response.data || []).map(systemLoad);
}

const OCR_PROMPT = `Retorne SOMENTE JSON válido no formato {"cargas":[{"placa":"ABC1D23","carga":"123","peso_kg":35420,"nota_fiscal":"456","pagina":1}]}. Extraia uma linha por carga/veículo deste relatório. O campo carga é o número da carga, ticket, romaneio ou laudo. Normalize placas sem espaços e converta pesos para quilogramas. Quando não existir um campo, use string vazia ou null. Não invente.`;
function fileType(url) { const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase(); return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext) ? ext : 'pdf'; }
async function readReport(url, docIndex) {
  const { data, error } = await supabase.functions.invoke('ocr-documento', { body: { url, tipo: fileType(url), instrucao: OCR_PROMPT } });
  if (error) throw new Error(error.message || `Erro no relatório ${docIndex + 1}.`); if (data?.error) throw new Error(data.error);
  return parseOcr(data?.texto).map((row, index) => reportLoad(row, `${docIndex}-${index}`, url));
}

async function saveHistory(row, analysis) {
  if (!historyAvailable) return;
  const payload = { os_id: String(row.id), numero_os: osNumber(row), laudo_urls: analysis.urls, cargas_sistema: analysis.system, cargas_ocr: analysis.report, resultado: analysis.result, status: 'PRE_CONFERIDA', criado_por: currentUser?.id || null, atualizado_por: currentUser?.id || null, confirmado_em: null, confirmado_por: null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(HISTORY_TABLE).upsert(payload, { onConflict: 'os_id' });
  if (error) { historyAvailable = false; console.warn('[Pré-Conferência] histórico indisponível', error); }
}

async function loadHistory() {
  const { data, error } = await supabase.from(HISTORY_TABLE).select('os_id,numero_os,laudo_urls,cargas_sistema,cargas_ocr,resultado,status').eq('status', 'PRE_CONFERIDA').limit(1000);
  if (error) { historyAvailable = false; return; }
  (data || []).forEach((row) => cache.set(String(row.os_id), { numeroOs: row.numero_os, urls: row.laudo_urls || [], system: row.cargas_sistema || [], report: row.cargas_ocr || [], result: row.resultado || [] }));
}

async function run(id, button) {
  if (busy) return; busy = true; button.disabled = true; const text = button.textContent; button.textContent = 'Analisando…'; let row;
  try {
    row = await getOs(id); const urls = laudoUrls(row); if (!urls.length) throw new Error('Nenhum relatório anexado foi encontrado.'); modalLoading(row);
    const [system, reports] = await Promise.all([getSystemLoads(row), Promise.all(urls.map(readReport))]);
    const report = reports.flat(); const analysis = { urls, system, report, result: compare(system, report) };
    cache.set(String(id), analysis); sessionStorage.setItem(`pre-conferencia-os:${id}`, JSON.stringify(analysis)); await saveHistory(row, analysis); patchButtons(); showResult(row, analysis);
  } catch (error) { console.error(error); if (row) modalError(row, error); else alert(error?.message || error); }
  finally { busy = false; button.disabled = false; button.textContent = text; }
}

async function confirm(id, button) {
  let analysis = cache.get(String(id));
  if (!analysis) { try { analysis = JSON.parse(sessionStorage.getItem(`pre-conferencia-os:${id}`) || 'null'); } catch { analysis = null; } }
  if (!analysis) return alert('Execute a Pré-Conferência antes de confirmar.');
  const count = totals(analysis.result); const question = count.errors ? `Existem ${count.errors} divergência(s). Confirmar mesmo assim?` : 'Todas as cargas estão OK. Confirmar?';
  if (!window.confirm(question)) return;
  button.disabled = true; button.textContent = 'Confirmando…';
  try {
    const now = new Date().toISOString(); const { error } = await supabase.from('operacional_os').update({ observacao_logistica: null, updated_at: now }).eq('id', id); if (error) throw error;
    if (historyAvailable) await supabase.from(HISTORY_TABLE).update({ status: 'CONFIRMADA', confirmado_em: now, confirmado_por: currentUser?.id || null, atualizado_por: currentUser?.id || null, updated_at: now }).eq('os_id', String(id));
    cache.delete(String(id)); sessionStorage.removeItem(`pre-conferencia-os:${id}`); button.closest('tr')?.remove(); closeModal();
    const list = document.getElementById('logConferenciasLaudos'); if (list && !list.querySelector('tbody tr')) list.innerHTML = '<div class="log-empty">Nenhum laudo pendente de conferência.</div>';
  } catch (error) { alert(error?.message || 'Não foi possível confirmar.'); button.disabled = false; button.textContent = 'Confirmar'; }
}

function hasAnalysis(id) {
  if (cache.has(String(id))) return true;
  try { const value = JSON.parse(sessionStorage.getItem(`pre-conferencia-os:${id}`) || 'null'); if (value) cache.set(String(id), value); } catch { /* vazio */ }
  return cache.has(String(id));
}

function patchButtons() {
  document.querySelectorAll('#logConferenciasLaudos tr[data-os-id]').forEach((row) => {
    const id = row.dataset.osId; const actions = row.querySelector('td:last-child .log-actions'); if (!id || !actions) return;
    actions.classList.add('pc-actions');
    if (!actions.querySelector('[data-pc-run]')) actions.innerHTML = `<button class="btn btn-secondary" data-abrir-laudo="${esc(id)}">Abrir</button><button class="btn btn-secondary" data-pc-run="${esc(id)}">Pré-Conferência</button><button class="btn btn-primary" data-pc-confirm="${esc(id)}">Confirmar</button>`;
    const confirmButton = actions.querySelector('[data-pc-confirm]'); confirmButton.disabled = !hasAnalysis(id); confirmButton.title = confirmButton.disabled ? 'Execute a Pré-Conferência primeiro' : 'Confirmar pré-conferência';
  });
}

function observeTable() {
  const list = document.getElementById('logConferenciasLaudos'); if (!list) return false;
  new MutationObserver(() => queueMicrotask(patchButtons)).observe(list, { childList: true, subtree: true }); patchButtons(); return true;
}

async function setup() {
  installStyle(); modal(); currentUser = await getCurrentUser(); await loadHistory();
  document.addEventListener('click', async (event) => {
    const runButton = event.target.closest('[data-pc-run]'); const confirmButton = event.target.closest('[data-pc-confirm]'); if (!runButton && !confirmButton) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    if (runButton) await run(runButton.dataset.pcRun, runButton); else await confirm(confirmButton.dataset.pcConfirm, confirmButton);
  }, true);
  if (!observeTable()) new MutationObserver((_, observer) => { if (observeTable()) observer.disconnect(); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
}

setup().catch((error) => console.error('[Pré-Conferência]', error));
export { compare, parseOcr };
