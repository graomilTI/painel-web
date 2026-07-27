import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const HISTORY_TABLE = 'logistica_pre_conferencia_os';
const OCR_FUNCTION = 'ocr-documento-local';
const OCR_POLL_INTERVAL_MS = 2000;
const OCR_POLL_TIMEOUT_MS = 15 * 60 * 1000;
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
const normPlate = (v) => normCode(v);
const osNumber = (row) => String(row?.numero_os ?? row?.os ?? '').trim();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const laudoUrls = (row) => String(row?.observacao_logistica || '').startsWith('LAUDO:')
  ? String(row.observacao_logistica).slice(6).split(',').map((v) => v.trim()).filter(Boolean) : [];

function formatPlate(value) {
  const plate = normPlate(value);
  if (!plate) return '-';
  return plate.length === 7 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

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
    confianca: numberValue(row?.confianca),
    origem: String(row?.origem ?? '').trim(),
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
  throw new Error('O OCR local não devolveu uma lista válida de cargas.');
}

function selectPlateMatch(candidates, report) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const reportLoadCode = normCode(report.carga);
  if (reportLoadCode) {
    const sameLoad = candidates.filter(({ system }) => normCode(system.carga) === reportLoadCode);
    if (sameLoad.length === 1) return sameLoad[0];
  }

  const reportNf = normCode(report.nf);
  if (reportNf) {
    const sameNf = candidates.filter(({ system }) => normCode(system.nf) === reportNf);
    if (sameNf.length === 1) return sameNf[0];
  }

  if (report.pesoKg != null) {
    return [...candidates].sort((a, b) => {
      const distanceA = a.system.pesoKg == null ? Number.POSITIVE_INFINITY : Math.abs(a.system.pesoKg - report.pesoKg);
      const distanceB = b.system.pesoKg == null ? Number.POSITIVE_INFINITY : Math.abs(b.system.pesoKg - report.pesoKg);
      return distanceA - distanceB;
    })[0];
  }

  return candidates[0];
}

function compare(systemRows, reportRows) {
  const result = [];
  const used = new Set();

  reportRows.forEach((report) => {
    const available = systemRows.map((system, index) => ({ system, index })).filter(({ index }) => !used.has(index));
    const reportPlate = normPlate(report.placa);
    const reportLoadCode = normCode(report.carga);

    let found = available.find(({ system }) => reportPlate && reportLoadCode
      && normPlate(system.placa) === reportPlate
      && normCode(system.carga) === reportLoadCode);
    let status = LABEL.OK;
    let note = 'Placa, carga e peso correspondem.';

    if (!found && reportPlate) {
      found = selectPlateMatch(available.filter(({ system }) => normPlate(system.placa) === reportPlate), report);
    }

    if (!found && reportLoadCode) {
      const sameLoad = available.filter(({ system }) => normCode(system.carga) === reportLoadCode);
      if (sameLoad.length === 1) {
        found = sameLoad[0];
        status = LABEL.PLATE;
        note = `Carga localizada, mas a placa diverge: sistema ${formatPlate(found.system.placa)} × relatório ${formatPlate(report.placa)}.`;
      }
    }

    if (!found) {
      result.push({ status: LABEL.NOT_FOUND, system: null, report, note: 'Não consta nesta O.S.' });
      return;
    }

    used.add(found.index);
    const diff = found.system.pesoKg == null || report.pesoKg == null ? null : Math.abs(found.system.pesoKg - report.pesoKg);
    if (status === LABEL.OK && (found.system.pesoKg == null || report.pesoKg == null)) {
      status = LABEL.WEIGHT;
      note = 'Peso não localizado em uma das fontes.';
    } else if (status === LABEL.OK && diff > 1) {
      status = LABEL.WEIGHT;
      note = `Peso diverge em ${formatKg(diff)}.`;
    } else if (status === LABEL.PLATE && diff > 1) {
      note += ` O peso também diverge em ${formatKg(diff)}.`;
    }
    result.push({ status, system: found.system, report, note });
  });

  systemRows.forEach((system, index) => {
    if (!used.has(index)) result.push({ status: LABEL.MISSING, system, report: null, note: 'Não identificada no relatório.' });
  });

  const order = { [LABEL.NOT_FOUND]: 1, [LABEL.MISSING]: 2, [LABEL.PLATE]: 3, [LABEL.WEIGHT]: 4, [LABEL.OK]: 5 };
  return result.sort((a, b) => order[a.status] - order[b.status]);
}

function formatKg(value) {
  return value == null ? '-' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)} kg`;
}

function formatConfidence(value) {
  const number = numberValue(value);
  if (number == null) return '-';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(number * 100)}%`;
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
    .pc-bg{position:fixed;inset:0;z-index:10080;background:rgba(0,8,5,.84);display:flex;align-items:center;justify-content:center;padding:12px}
    .pc-box{width:min(1580px,98vw);height:min(880px,96vh);max-height:96vh;display:flex;flex-direction:column;background:#031b12;border:1px solid rgba(52,211,153,.3);border-radius:18px;overflow:hidden;color:#e5f7ee}
    .pc-head,.pc-foot{display:flex;flex:0 0 auto;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(52,211,153,.18)}.pc-head h2{margin:0}.pc-head p{margin:4px 0 0;color:#8dac9d;font-size:12px}
    .pc-body{min-height:0;flex:1;display:flex;flex-direction:column;padding:12px 16px;overflow:hidden}
    .pc-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:7px;margin-bottom:10px}.pc-kpi{min-height:55px;padding:8px 10px;border:1px solid rgba(52,211,153,.15);border-radius:12px;background:rgba(2,17,12,.6)}.pc-kpi small{display:block;color:#83a697;font-size:10px;text-transform:uppercase}.pc-kpi b{font-size:19px}
    .pc-docs{flex:0 0 auto;display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px}.pc-docs a{color:#9cf5c8;text-decoration:none;border:1px solid rgba(52,211,153,.2);border-radius:999px;padding:6px 9px}
    .pc-table-wrap{min-height:0;flex:1;overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:12px}.pc-table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:12px}.pc-table th{position:sticky;top:0;z-index:2;background:#06251a;color:#8ef0bd;padding:8px 6px;text-align:left;font-size:9px;line-height:1.2;text-transform:uppercase;white-space:normal}.pc-table td{padding:8px 6px;border-top:1px solid rgba(148,163,184,.1);vertical-align:top;line-height:1.35;overflow-wrap:anywhere;word-break:break-word}
    .pc-table th:nth-child(1),.pc-table td:nth-child(1){width:7%}.pc-table th:nth-child(2),.pc-table td:nth-child(2){width:11%}.pc-table th:nth-child(3),.pc-table td:nth-child(3),.pc-table th:nth-child(4),.pc-table td:nth-child(4){width:8%}.pc-table th:nth-child(5),.pc-table td:nth-child(5),.pc-table th:nth-child(6),.pc-table td:nth-child(6){width:10%}.pc-table th:nth-child(7),.pc-table td:nth-child(7){width:7%}.pc-table th:nth-child(8),.pc-table td:nth-child(8){width:5%;text-align:center}.pc-table th:nth-child(9),.pc-table td:nth-child(9){width:6%;text-align:center}.pc-table th:nth-child(10),.pc-table td:nth-child(10){width:18%}
    .pc-tag{display:inline-flex;max-width:100%;padding:4px 6px;border-radius:8px;font-size:9px;line-height:1.2;font-weight:900;white-space:normal;text-align:center}.pc-ok{background:rgba(34,197,94,.14);color:#bbf7d0}.pc-warn{background:rgba(245,158,11,.14);color:#fde68a}.pc-bad{background:rgba(239,68,68,.14);color:#fecaca}
    .pc-close{border:1px solid rgba(148,163,184,.2);background:#09261b;color:white;border-radius:10px;padding:8px 12px;cursor:pointer}.pc-loading,.pc-error{padding:28px;text-align:center}.pc-error{color:#fecaca;white-space:pre-wrap}.pc-progress{display:grid;gap:8px;max-width:760px;margin:18px auto 0;text-align:left}.pc-progress-row{display:grid;grid-template-columns:minmax(120px,1fr) 3fr auto;align-items:center;gap:10px;padding:10px;border:1px solid rgba(52,211,153,.16);border-radius:12px;background:rgba(2,17,12,.55)}.pc-progress-row b{font-size:12px}.pc-progress-row span{color:#a7c5b7;font-size:12px}.pc-progress-bar{height:7px;border-radius:999px;background:rgba(148,163,184,.16);overflow:hidden}.pc-progress-bar i{display:block;height:100%;width:0;background:#34d399;transition:width .25s ease}.pc-foot{justify-content:flex-end;border-bottom:0;border-top:1px solid rgba(52,211,153,.18)}
    @media(max-width:1100px){.pc-box{width:99vw;height:98vh;max-height:98vh}.pc-table{min-width:1050px;table-layout:auto}.pc-table-wrap{overflow-x:auto}}
    @media(max-width:800px){.pc-bg{padding:4px}.pc-kpis{grid-template-columns:repeat(2,1fr)}.pc-progress-row{grid-template-columns:1fr}}
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

function modalLoading(row, urls) {
  const el = modal(); el.hidden = false; document.body.style.overflow = 'hidden';
  el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`;
  el.querySelector('#pcSub').textContent = 'PaddleOCR local — processamento no servidor da Grão 1000.';
  el.querySelector('#pcBody').innerHTML = `<div class="pc-loading"><strong>Preparando os relatórios…</strong><div class="pc-progress">${urls.map((_, index) => `<div class="pc-progress-row" data-pc-doc="${index}"><b>Relatório ${index + 1}</b><div><span>Aguardando envio para a fila</span><div class="pc-progress-bar"><i></i></div></div><em>0%</em></div>`).join('')}</div></div>`;
}

function updateDocProgress(index, data = {}) {
  const row = modal().querySelector(`[data-pc-doc="${index}"]`);
  if (!row) return;
  const status = String(data.status || 'PENDENTE').toUpperCase();
  const progress = Math.max(0, Math.min(100, Number(data.progress || 0)));
  const page = data.pagina_atual && data.paginas_total ? ` · página ${data.pagina_atual}/${data.paginas_total}` : '';
  const labels = {
    PENDENTE: data.worker_online === false ? 'Na fila — aguardando o worker do VPS ficar online' : 'Na fila do OCR local',
    PROCESSANDO: `Lendo o documento${page}`,
    CONCLUIDO: 'Leitura concluída',
    ERRO: data.error || 'Falha no processamento',
    CANCELADO: 'Processamento cancelado',
  };
  row.querySelector('span').textContent = labels[status] || status;
  row.querySelector('i').style.width = `${status === 'CONCLUIDO' ? 100 : progress}%`;
  row.querySelector('em').textContent = `${status === 'CONCLUIDO' ? 100 : progress}%`;
}

function modalError(row, error) {
  const el = modal(); el.hidden = false;
  el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`;
  el.querySelector('#pcSub').textContent = 'A leitura não foi concluída.';
  el.querySelector('#pcBody').innerHTML = `<div class="pc-error">${esc(error?.message || error)}</div>`;
}

function showResult(row, analysis) {
  const el = modal(); const count = totals(analysis.result); const badgeClass = (status) => status === LABEL.OK ? 'pc-ok' : [LABEL.PLATE, LABEL.WEIGHT].includes(status) ? 'pc-warn' : 'pc-bad';
  el.hidden = false; document.body.style.overflow = 'hidden';
  el.querySelector('#pcTitle').textContent = `Pré-Conferência — O.S. ${osNumber(row)}`;
  el.querySelector('#pcSub').textContent = `${analysis.system.length} carga(s) no sistema · ${analysis.report.length} lida(s) pelo PaddleOCR`;
  el.querySelector('#pcBody').innerHTML = `
    <div class="pc-kpis"><div class="pc-kpi"><small>Total</small><b>${count.total}</b></div><div class="pc-kpi"><small>OK</small><b>${count[LABEL.OK] || 0}</b></div><div class="pc-kpi"><small>Placa/Peso</small><b>${(count[LABEL.PLATE] || 0) + (count[LABEL.WEIGHT] || 0)}</b></div><div class="pc-kpi"><small>Falta lançar</small><b>${count[LABEL.MISSING] || 0}</b></div><div class="pc-kpi"><small>Não localizada</small><b>${count[LABEL.NOT_FOUND] || 0}</b></div></div>
    <div class="pc-docs">${analysis.urls.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener">Relatório ${i + 1}</a>`).join('')}</div>
    <div class="pc-table-wrap"><table class="pc-table"><thead><tr><th>Status</th><th>Carga</th><th>Placa sistema</th><th>Placa relatório</th><th>Peso sistema</th><th>Peso relatório</th><th>NF</th><th>Página</th><th>Conf.</th><th>Anotação</th></tr></thead><tbody>
      ${analysis.result.map((item) => `<tr><td><span class="pc-tag ${badgeClass(item.status)}">${esc(item.status)}</span></td><td>${esc(item.system?.carga || item.report?.carga || '-')}</td><td>${esc(formatPlate(item.system?.placa))}</td><td>${esc(formatPlate(item.report?.placa))}</td><td>${esc(formatKg(item.system?.pesoKg))}</td><td>${esc(formatKg(item.report?.pesoKg))}</td><td>${esc(item.report?.nf || item.system?.nf || '-')}</td><td>${esc(item.report?.pagina || '-')}</td><td>${esc(formatConfidence(item.report?.confianca))}</td><td>${esc(item.note)}</td></tr>`).join('') || '<tr><td colspan="10">Nenhuma carga encontrada.</td></tr>'}
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

const OCR_PROMPT = `Extraia placa, carga/ticket/romaneio/laudo, peso em quilogramas, nota fiscal e página de cada veículo do relatório.`;
function fileType(url) { const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase(); return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext) ? ext : 'pdf'; }

async function functionError(error, fallback) {
  let details = null;
  const response = error?.context;
  if (response?.clone) {
    try { details = await response.clone().json(); } catch { /* resposta não JSON */ }
  }
  const message = details?.error || details?.message || error?.message || fallback;
  const suffix = [details?.code, details?.request_id].filter(Boolean).join(' · ');
  return new Error(suffix ? `${message}\n${suffix}` : message);
}

async function invokeOcr(body, fallback) {
  const { data, error } = await supabase.functions.invoke(OCR_FUNCTION, { body });
  if (error) throw await functionError(error, fallback);
  if (data?.error) throw new Error(data.error);
  return data || {};
}

async function readReport(url, docIndex, osRow) {
  const submitted = await invokeOcr({
    action: 'submit',
    url,
    tipo: fileType(url),
    instrucao: OCR_PROMPT,
    os_id: String(osRow.id),
    numero_os: osNumber(osRow),
  }, `Não foi possível colocar o relatório ${docIndex + 1} na fila.`);

  updateDocProgress(docIndex, submitted);
  let state = submitted;
  const jobId = Number(submitted.job_id);
  if (!Number.isInteger(jobId)) throw new Error(`O servidor não devolveu o job do relatório ${docIndex + 1}.`);
  const startedAt = Date.now();

  while (state.status !== 'CONCLUIDO') {
    if (['ERRO', 'CANCELADO'].includes(String(state.status))) {
      throw new Error(state.error || `Falha no relatório ${docIndex + 1}.`);
    }
    if (Date.now() - startedAt > OCR_POLL_TIMEOUT_MS) {
      throw new Error(`O relatório ${docIndex + 1} excedeu 15 minutos de processamento. O job ${jobId} continuará registrado para diagnóstico.`);
    }
    await sleep(Number(state.poll_after_ms || OCR_POLL_INTERVAL_MS));
    state = await invokeOcr({ action: 'status', job_id: jobId }, `Não foi possível consultar o job ${jobId}.`);
    updateDocProgress(docIndex, state);
  }

  const rows = parseOcr(state.texto || JSON.stringify(state.resultado || {}));
  return rows.map((row, index) => reportLoad(row, `${docIndex}-${index}`, url));
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
  (data || []).forEach((row) => {
    const system = row.cargas_sistema || [];
    const report = row.cargas_ocr || [];
    cache.set(String(row.os_id), { numeroOs: row.numero_os, urls: row.laudo_urls || [], system, report, result: compare(system, report) });
  });
}

async function run(id, button) {
  if (busy) return; busy = true; button.disabled = true; const text = button.textContent; button.textContent = 'Na fila…'; let row;
  try {
    row = await getOs(id); const urls = laudoUrls(row); if (!urls.length) throw new Error('Nenhum relatório anexado foi encontrado.'); modalLoading(row, urls);
    const [system, reports] = await Promise.all([getSystemLoads(row), Promise.all(urls.map((url, index) => readReport(url, index, row)))]);
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
  try {
    const value = JSON.parse(sessionStorage.getItem(`pre-conferencia-os:${id}`) || 'null');
    if (value) {
      value.result = compare(value.system || [], value.report || []);
      cache.set(String(id), value);
    }
  } catch { /* vazio */ }
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
