import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR_INT = new Intl.NumberFormat('pt-BR');
const PAGE_SIZE = 1000;
const MAX_DISTRIBUICAO = 10000;
const MAX_MAPA = 10000;
const MAX_PRODUCAO = 20000;
const MAX_NHE = 20000;

const DISTRIBUICAO_OS_COLS = [
  'Coordenação',
  'Supervisão',
  'Funcionário',
  'Veículo',
  'O.S.',
  'Cliente',
  'Produto',
  'Local de Embarque',
  'Local de Destino',
  'Lote',
  'Prod. do Dia',
  'Prod. do Dia OS',
  'Prod. da OS',
  'Prod. Remanescente',
];

const state = {
  user: null,
  fob: [],
  reportRows: [],
  reportStats: null,
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
  let s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  if (s.includes('/')) s = s.split('/')[0].trim();
  return s.replace(/\s+/g, ' ').trim();
}

function toNumberLoose(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value ?? '').trim();
  if (!s || s === '--') return 0;
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const utc = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'number') return excelSerialToDate(value);
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(Number(s));
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function ymd(value) {
  const d = parseDateOnly(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso() {
  return ymd(new Date());
}

function brDateFromAny(value) {
  const d = parseDateOnly(value);
  if (!d) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function pickValue(row, aliases) {
  const keys = aliases.map(normHeader);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return '';
}

function agentRowToHeaderObject(dadosJson) {
  const obj = {};
  Object.keys(dadosJson || {}).forEach((key) => {
    obj[normHeader(key)] = dadosJson[key];
  });
  return obj;
}

function mapDistribuicaoRow(raw) {
  const source = raw || {};
  const mapped = { ...source };
  DISTRIBUICAO_OS_COLS.forEach((label, index) => {
    const genericKey = index === 0 ? '__EMPTY' : `__EMPTY_${index}`;
    if (mapped[label] == null || mapped[label] === '') mapped[label] = source[genericKey];
  });
  return agentRowToHeaderObject(mapped);
}

function rowDate(row) {
  return ymd(pickValue(row, [
    'Data',
    'Data OS',
    'Data da OS',
    'Data NHE',
    'Data de Produção',
    'Última Atualização',
    'Ultima Atualizacao',
  ]));
}

function isTodayRow(row, allowBlank = false) {
  const date = rowDate(row);
  return date ? date === todayIso() : allowBlank;
}

function isFobService(row) {
  const service = normText(pickValue(row, [
    'Serviço',
    'Servico',
    'Tipo de Serviço',
    'Tipo Servico',
  ]));
  return !service || service.includes('FOB');
}

async function fetchLatestBatch(table, maxRows) {
  const { data: latestRows, error: latestError } = await supabase
    .from(table)
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (latestError) throw latestError;

  const latestAt = latestRows?.[0]?.created_at;
  if (!latestAt) return { rows: [], latestAt: null, truncated: false };

  const threshold = new Date(new Date(latestAt).getTime() - 5 * 60 * 1000).toISOString();
  const rows = [];
  let truncated = false;

  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await supabase
      .from(table)
      .select('dados_json,created_at')
      .gte('created_at', threshold)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    if (rows.length >= maxRows) truncated = true;
  }

  return { rows, latestAt, truncated };
}

function latestByOs(rows, mapper = agentRowToHeaderObject) {
  const byOs = new Map();
  rows.forEach((record) => {
    const row = mapper(record.dados_json || {});
    const os = normOs(pickValue(row, ['O.S.', 'OS', 'O.S', 'O S']));
    if (!os || normText(os) === 'OS') return;
    byOs.set(os, { row, createdAt: record.created_at });
  });
  return byOs;
}

function buildSourceData(distribuicaoBatch, mapaBatch, producaoBatch, nheBatch) {
  const distByOs = latestByOs(distribuicaoBatch.rows, mapDistribuicaoRow);
  const mapaByOsAll = latestByOs(mapaBatch.rows);
  const mapaByOs = new Map();

  mapaByOsAll.forEach((item, os) => {
    if (isTodayRow(item.row, true)) mapaByOs.set(os, item);
  });

  const prodRows = producaoBatch.rows
    .map((record) => agentRowToHeaderObject(record.dados_json || {}))
    .filter((row) => isTodayRow(row, false) && isFobService(row));

  const nheRows = nheBatch.rows
    .map((record) => agentRowToHeaderObject(record.dados_json || {}))
    .filter((row) => isTodayRow(row, true) && isFobService(row));

  return { distByOs, mapaByOs, prodRows, nheRows };
}

function compararFob({ distByOs, mapaByOs, prodRows, nheRows }) {
  const setNheOsData = new Set();
  const setNheOsSemData = new Set();
  const setNheCcld = new Set();

  nheRows.forEach((row) => {
    const os = normOs(pickValue(row, ['O.S.', 'OS', 'O.S', 'O S']));
    const data = rowDate(row);
    if (os && data) setNheOsData.add(`${os}|${data}`);
    if (os && !data) setNheOsSemData.add(os);

    const cliente = pickValue(row, ['Cliente']);
    const cidade = pickValue(row, ['Cidade de Embarque', 'Cidade']);
    const local = pickValue(row, ['Embarque', 'Local', 'Local de Embarque']);
    if (cliente && cidade && local && data) {
      setNheCcld.add(`${normText(cliente)}|${normText(cidade)}|${normText(local)}|${data}`);
    }
  });

  const setProdNheOsData = new Set();
  const setProdNheOsSemData = new Set();
  prodRows.forEach((row) => {
    const cargas = normText(pickValue(row, ['Cargas']));
    if (cargas !== 'NHE') return;
    const os = normOs(pickValue(row, ['O.S.', 'OS']));
    const data = rowDate(row);
    if (os && data) setProdNheOsData.add(`${os}|${data}`);
    if (os && !data) setProdNheOsSemData.add(os);
  });

  const mapaComboCount = new Map();
  mapaByOs.forEach(({ row }) => {
    const data = rowDate(row) || todayIso();
    const cliente = pickValue(row, ['Cliente']);
    const cidade = pickValue(row, ['Cidade']);
    const local = pickValue(row, ['Local', 'Local de Embarque']);
    if (!cliente || !cidade || !local) return;
    const key = `${normText(cliente)}|${normText(cidade)}|${normText(local)}|${data}`;
    mapaComboCount.set(key, (mapaComboCount.get(key) || 0) + 1);
  });

  const allOs = new Set([...distByOs.keys(), ...mapaByOs.keys()]);
  const rows = [];
  let candidatosMapa = 0;
  let candidatosDistribuicao = 0;

  allOs.forEach((os) => {
    const mapa = mapaByOs.get(os)?.row || null;
    const dist = distByOs.get(os)?.row || null;
    if (!mapa && !dist) return;

    const tonsMapaRaw = mapa ? pickValue(mapa, ['Tons Hoje', 'TonsHoje', 'Tons']) : '';
    const hasTonsMapa = mapa && String(tonsMapaRaw ?? '').trim() !== '';
    const tonsDistRaw = dist ? pickValue(dist, ['Prod. do Dia OS', 'Prod do Dia OS', 'Produção do Dia OS', 'Prod. do Dia']) : '';
    const hasTonsDist = dist && String(tonsDistRaw ?? '').trim() !== '';
    const tonsHoje = hasTonsMapa ? toNumberLoose(tonsMapaRaw) : toNumberLoose(tonsDistRaw);

    if (!hasTonsMapa && !hasTonsDist) return;
    if (tonsHoje !== 0) return;

    const remanescenteRaw = dist
      ? pickValue(dist, ['Prod. Remanescente', 'Prod Remanescente', 'Remanescente'])
      : pickValue(mapa, ['Remanescente']);
    const hasRemanescente = String(remanescenteRaw ?? '').trim() !== '';
    if (hasRemanescente && toNumberLoose(remanescenteRaw) <= 0) return;

    const source = mapa || dist;
    const data = rowDate(mapa || {}) || todayIso();
    const cliente = pickValue(source, ['Cliente']);
    const cidade = pickValue(mapa || {}, ['Cidade']) || pickValue(dist || {}, ['Cidade']);
    const local = pickValue(mapa || {}, ['Local', 'Local de Embarque'])
      || pickValue(dist || {}, ['Local de Embarque', 'Local']);
    const supervisao = pickValue(source, ['Supervisão', 'Supervisao'])
      || pickValue(dist || {}, ['Supervisão', 'Supervisao']);
    const funcionario = pickValue(source, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario'])
      || pickValue(dist || {}, ['Funcionário', 'Funcionario']);

    const keyOsData = `${os}|${data}`;
    const okNhe = setNheOsData.has(keyOsData) || setNheOsSemData.has(os);
    const okProd = setProdNheOsData.has(keyOsData) || setProdNheOsSemData.has(os);

    let status = 'PENDENTE';
    if (okNhe || okProd) {
      status = 'OK';
    } else {
      const keyCcld = `${normText(cliente)}|${normText(cidade)}|${normText(local)}|${data}`;
      if ((mapaComboCount.get(keyCcld) || 0) >= 2 || setNheCcld.has(keyCcld)) {
        status = 'DOIS EMBARQUES';
      }
    }

    if (mapa) candidatosMapa += 1;
    else candidatosDistribuicao += 1;

    rows.push({
      data,
      data_br: brDateFromAny(data),
      os,
      supervisao,
      funcionario,
      cliente,
      cidade,
      local,
      tons_movimento: tonsHoje,
      remanescente: hasRemanescente ? toNumberLoose(remanescenteRaw) : null,
      origem_candidato: mapa ? 'MAPA' : 'DISTRIBUIÇÃO',
      status,
      observacao: pickValue(mapa || {}, ['Observações', 'Observacoes', 'Obs'])
        || pickValue(dist || {}, ['Observações', 'Observacoes', 'Obs']),
    });
  });

  const rank = { PENDENTE: 0, 'DOIS EMBARQUES': 1, OK: 2 };
  rows.sort((a, b) => (rank[a.status] ?? 99) - (rank[b.status] ?? 99)
    || String(a.supervisao || '').localeCompare(String(b.supervisao || ''), 'pt-BR')
    || String(a.os || '').localeCompare(String(b.os || ''), 'pt-BR'));

  return {
    rows,
    stats: {
      distribuicao: distByOs.size,
      mapa: mapaByOs.size,
      producao: prodRows.length,
      nhe: nheRows.length,
      candidatosMapa,
      candidatosDistribuicao,
      pendentes: rows.filter((row) => row.status === 'PENDENTE').length,
      dois: rows.filter((row) => row.status === 'DOIS EMBARQUES').length,
      ok: rows.filter((row) => row.status === 'OK').length,
    },
  };
}

function injectStyles() {
  if (document.getElementById('logistica-fob-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'logistica-fob-page-styles';
  style.textContent = `
    .log-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;color-scheme:dark;padding:9px}.log-input option{background:#0d0d18;color:#e2e2f0}.log-textarea{min-height:70px;resize:vertical}
    .log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.log-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;color:#e2e2f0}.log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.log-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.log-table tr:hover td{background:rgba(22,101,52,.1)}
    .log-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.log-meta{font-size:12px;color:#6b7280;margin-top:4px;line-height:1.35}.log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}
    .log-note{border:1px solid rgba(59,130,246,.2);background:rgba(59,130,246,.08);color:#bfdbfe;border-radius:16px;padding:12px;margin-top:12px;font-size:13px}.log-inline-actions{display:flex;gap:8px;flex-wrap:wrap}.log-inline-actions .btn{width:auto!important;margin-top:0!important}
    .log-mini-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.log-report-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px}.log-kpi-warn{color:#fde68a!important}.log-kpi-danger{color:#fecaca!important}.log-kpi-ok{color:#bbf7d0!important}.log-status-pendente{color:#fecaca!important}.log-status-ok{color:#bbf7d0!important}.log-status-dois{color:#fde68a!important}.log-subcard summary::marker{color:#86efac}
    .log-diagnostic{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.log-diagnostic span{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 10px;font-size:12px;color:#cbd5e1;background:rgba(15,23,42,.28)}
    @media(max-width:900px){.log-mini-grid,.log-report-grid{grid-template-columns:1fr 1fr}.log-table{min-width:960px}}@media(max-width:620px){.log-mini-grid,.log-report-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function renderShell(content) {
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>FOB — Comparação automática</h3>
          <p class="muted">Compara o último lote completo da Distribuição de O.S., Mapa de Embarque, Produção Diária e NHE.</p>
        </div>
        <div class="log-inline-actions">
          <button id="fobReload" class="btn btn-secondary" type="button">↻ Atualizar</button>
          <button id="fobSalvarPendentes" class="btn btn-secondary" type="button" disabled>Salvar pendentes no painel</button>
          <button id="fobExportCsv" class="btn btn-secondary" type="button" disabled>Exportar CSV</button>
        </div>
      </div>
      <div class="log-note">A Distribuição de O.S. é usada como universo principal. Quando uma O.S. aberta não aparece no Mapa de Embarque, a produção do dia da própria Distribuição é usada para identificar movimento zero. NHE ou Produção com Cargas = NHE confirma <strong>OK</strong>; duplicidade de Cliente + Cidade + Local + Data indica <strong>DOIS EMBARQUES</strong>; o restante fica <strong>PENDENTE</strong>.</div>
      <div class="feedback mt-16" id="fobFeedback">Carregando bases dos agentes...</div>
      <div id="fobReportResult" class="mt-16"></div>

      <div class="card mt-16">
        <h4 style="margin:0 0 14px;color:#bbf7d0">Imagem por Regional</h4>
        <p class="muted" style="margin:-8px 0 14px">Agrupa o relatório por Supervisão e gera uma imagem para compartilhamento.</p>
        <div class="log-report-grid">
          <div class="field"><label>Regional</label><select id="logRegionalFob" class="log-input"><option value="">Selecione</option></select></div>
          <div class="field" style="align-self:end"><button id="logGerarImagemRegional" class="btn btn-primary" type="button">Gerar imagem</button></div>
          <div class="field" style="align-self:end"><button id="logGerarZipRegionais" class="btn btn-secondary" type="button">Gerar ZIP (todas)</button></div>
        </div>
        <div class="log-note" id="logRegionalFeedback" style="display:none"></div>
      </div>

      <details class="card mt-16 log-subcard">
        <summary style="cursor:pointer;font-weight:950;color:#bbf7d0">Lançamento manual / histórico de validação</summary>
        <div class="card mt-16">
          <h4 style="margin:0 0 14px;color:#bbf7d0">Registrar FOB 0 manualmente</h4>
          <div class="log-report-grid">
            <div class="field"><label>Data *</label><input id="fobData" class="log-input" type="date" value="${todayIso()}" /></div>
            <div class="field"><label>O.S. (opcional)</label><input id="fobOs" class="log-input" type="text" placeholder="Número da OS" /></div>
            <div class="field"><label>Supervisão</label><input id="fobSup" class="log-input" type="text" placeholder="Regional" /></div>
            <div class="field"><label>Cliente</label><input id="fobCliente" class="log-input" type="text" placeholder="Nome do cliente" /></div>
            <div class="field"><label>Tons mov. diária</label><input id="fobMov" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field"><label>Tons prod. diária</label><input id="fobProd" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field"><label>Tons NH</label><input id="fobNh" class="log-input" type="number" step="0.01" placeholder="0,00" /></div>
            <div class="field" style="grid-column:span 2"><label>Observação</label><textarea id="fobObs" class="log-input log-textarea" placeholder="Motivo do FOB 0, referência do NH, detalhes da comparação..."></textarea></div>
          </div>
          <div class="mt-16"><button id="fobSalvar" class="btn btn-primary" type="button">Registrar FOB 0</button></div>
        </div>
        <div id="fobList" class="mt-16"></div>
      </details>
    </section>
  `;
}

function feedback(message, isError = false) {
  const el = document.getElementById('fobFeedback');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fecaca' : '';
}

function diagnosticsHtml(stats) {
  if (!stats) return '';
  return `<div class="log-diagnostic">
    <span>Distribuição: <strong>${BR_INT.format(stats.distribuicao || 0)}</strong></span>
    <span>Mapa hoje: <strong>${BR_INT.format(stats.mapa || 0)}</strong></span>
    <span>Produção FOB: <strong>${BR_INT.format(stats.producao || 0)}</strong></span>
    <span>NHE FOB: <strong>${BR_INT.format(stats.nhe || 0)}</strong></span>
    <span>Candidatos via mapa: <strong>${BR_INT.format(stats.candidatosMapa || 0)}</strong></span>
    <span>Candidatos só na distribuição: <strong>${BR_INT.format(stats.candidatosDistribuicao || 0)}</strong></span>
  </div>`;
}

function renderReport() {
  const box = document.getElementById('fobReportResult');
  if (!box) return;
  const rows = state.reportRows || [];
  const stats = state.reportStats;

  const exportButton = document.getElementById('fobExportCsv');
  const saveButton = document.getElementById('fobSalvarPendentes');
  if (exportButton) exportButton.disabled = !rows.length;
  if (saveButton) saveButton.disabled = !rows.some((row) => row.status === 'PENDENTE');

  if (!rows.length) {
    box.innerHTML = `<div class="log-empty">
      Nenhuma O.S. com movimento zero foi localizada no último lote completo.
      ${diagnosticsHtml(stats)}
    </div>`;
    updateRegionalSelect();
    return;
  }

  const preview = rows.slice(0, 500);
  box.innerHTML = `
    <section class="card">
      <div class="section-head">
        <div>
          <h3>Resultado da comparação FOB</h3>
          <p class="muted">Fonte automática · último lote sincronizado de cada agente</p>
        </div>
      </div>
      ${diagnosticsHtml(stats)}
      <div class="log-mini-grid mt-16">
        <article class="card"><h3>Pendentes</h3><p class="metric log-kpi-danger">${BR_INT.format(stats?.pendentes || 0)}</p></article>
        <article class="card"><h3>Dois embarques</h3><p class="metric log-kpi-warn">${BR_INT.format(stats?.dois || 0)}</p></article>
        <article class="card"><h3>OK</h3><p class="metric log-kpi-ok">${BR_INT.format(stats?.ok || 0)}</p></article>
        <article class="card"><h3>Total FOB</h3><p class="metric">${BR_INT.format(rows.length)}</p></article>
      </div>
      <div class="log-table-wrap mt-16">
        <table class="log-table">
          <thead><tr><th>Data</th><th>OS</th><th>Supervisão</th><th>Funcionário</th><th>Origem</th><th>Status</th><th>Observação</th></tr></thead>
          <tbody>${preview.map((row) => `<tr>
            <td>${esc(row.data_br)}</td>
            <td><div class="log-title">${esc(row.os)}</div><div class="log-meta">${esc(row.cliente || '-')}</div><div class="log-meta">${esc([row.cidade, row.local].filter(Boolean).join(' / ') || '-')}</div></td>
            <td>${esc(row.supervisao || '-')}</td>
            <td>${esc(row.funcionario || '-')}</td>
            <td><div class="log-title">${esc(row.origem_candidato)}</div><div class="log-meta">Rem.: ${row.remanescente == null ? '-' : esc(row.remanescente)}</div></td>
            <td><strong class="${row.status === 'OK' ? 'log-status-ok' : row.status === 'DOIS EMBARQUES' ? 'log-status-dois' : 'log-status-pendente'}">${esc(row.status)}</strong></td>
            <td><div class="log-meta">${esc(row.observacao || '')}</div></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      ${rows.length > preview.length ? `<div class="log-note">Prévia limitada a ${preview.length} linhas. O CSV contém o relatório completo.</div>` : ''}
    </section>
  `;
  updateRegionalSelect();
}

async function generateAutomaticReport() {
  if (state.loading) return;
  state.loading = true;
  const reloadButton = document.getElementById('fobReload');
  if (reloadButton) {
    reloadButton.disabled = true;
    reloadButton.textContent = 'Atualizando...';
  }
  feedback('Lendo o último lote completo dos quatro agentes...');

  try {
    const [distribuicaoBatch, mapaBatch, producaoBatch, nheBatch] = await Promise.all([
      fetchLatestBatch('grm_distribuicao_os_importacoes', MAX_DISTRIBUICAO),
      fetchLatestBatch('grm_mapa_embarque_importacoes', MAX_MAPA),
      fetchLatestBatch('grm_producao_diaria_importacoes', MAX_PRODUCAO),
      fetchLatestBatch('grm_nhe_importacoes', MAX_NHE),
    ]);

    const sourceData = buildSourceData(distribuicaoBatch, mapaBatch, producaoBatch, nheBatch);
    const { rows, stats } = compararFob(sourceData);
    stats.truncado = [distribuicaoBatch, mapaBatch, producaoBatch, nheBatch].some((batch) => batch.truncated);
    stats.ultimaSincronizacao = [distribuicaoBatch, mapaBatch, producaoBatch, nheBatch]
      .map((batch) => batch.latestAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    state.reportRows = rows;
    state.reportStats = stats;
    renderReport();

    const syncLabel = stats.ultimaSincronizacao
      ? new Date(stats.ultimaSincronizacao).toLocaleString('pt-BR')
      : 'sem sincronização registrada';
    const truncado = stats.truncado ? ' Atenção: uma das bases atingiu o limite de segurança.' : '';
    feedback(`Comparação concluída: ${rows.length} O.S., ${stats.pendentes} pendente(s). Última sincronização: ${syncLabel}.${truncado}`);
  } catch (error) {
    console.error('[FOB automático dedicado]', error);
    state.reportRows = [];
    state.reportStats = null;
    renderReport();
    feedback(`Falha ao gerar comparação FOB: ${error?.message || 'erro desconhecido'}.`, true);
  } finally {
    state.loading = false;
    if (reloadButton) {
      reloadButton.disabled = false;
      reloadButton.textContent = '↻ Atualizar';
    }
  }
}

async function loadFobHistory() {
  const { data, error } = await supabase
    .from('logistica_fob')
    .select('*')
    .order('data_referencia', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    const list = document.getElementById('fobList');
    if (list) list.innerHTML = `<div class="log-empty">${esc(error.message)}. Confira a tabela logistica_fob.</div>`;
    return;
  }
  state.fob = Array.isArray(data) ? data : [];
  renderFobHistory();
}

function renderFobHistory() {
  const list = document.getElementById('fobList');
  if (!list) return;

  const pendentes = state.fob.filter((row) => String(row.status || 'PENDENTE').toUpperCase() === 'PENDENTE');
  const historico = state.fob.filter((row) => String(row.status || 'PENDENTE').toUpperCase() !== 'PENDENTE');

  const rowHtml = (row, pending) => `<tr data-fob-id="${esc(row.id)}">
    <td>${esc(brDateFromAny(row.data_referencia))}</td>
    <td><div class="log-title">${esc(row.numero_os || '-')}</div><div class="log-meta">${esc(row.cliente || '-')}</div><div class="log-meta">${esc(row.supervisao || '-')}</div></td>
    <td><div>Mov.: ${esc(row.tons_movimento ?? 0)}</div><div class="log-meta">Prod.: ${esc(row.tons_producao ?? 0)} · NH: ${esc(row.tons_nh ?? 0)}</div></td>
    <td>${esc(row.observacao || '-')}</td>
    <td><strong class="${pending ? 'log-status-pendente' : String(row.status).toUpperCase() === 'VALIDO' ? 'log-status-ok' : 'log-status-dois'}">${esc(row.status || 'PENDENTE')}</strong><div class="log-meta">${esc(row.observacao_gestor || '')}</div></td>
    <td>${pending ? `<textarea class="log-input log-textarea" data-fob-obs-gestor style="min-height:46px;font-size:12px;margin-bottom:6px" placeholder="Observação (opcional)"></textarea><div class="log-inline-actions"><button class="btn btn-primary" data-fob-valido="${esc(row.id)}" type="button">✓ Válido</button><button class="btn btn-secondary" data-fob-invalido="${esc(row.id)}" type="button">✕ Inválido</button></div>` : '—'}</td>
  </tr>`;

  if (!state.fob.length) {
    list.innerHTML = '<div class="log-empty">Nenhum FOB 0 registrado ainda.</div>';
    return;
  }

  list.innerHTML = `
    ${pendentes.length ? `<h4 style="color:#fde68a;margin:0 0 10px">Pendentes de validação (${pendentes.length})</h4><div class="log-table-wrap"><table class="log-table"><thead><tr><th>Data</th><th>Cliente / OS</th><th>Toneladas</th><th>Observação logística</th><th>Status</th><th>Ação gestor</th></tr></thead><tbody>${pendentes.map((row) => rowHtml(row, true)).join('')}</tbody></table></div>` : '<div class="log-empty">Nenhum FOB 0 pendente de validação.</div>'}
    ${historico.length ? `<h4 style="margin:24px 0 10px">Histórico validado (${historico.length})</h4><div class="log-table-wrap"><table class="log-table"><thead><tr><th>Data</th><th>Cliente / OS</th><th>Toneladas</th><th>Observação logística</th><th>Status</th><th></th></tr></thead><tbody>${historico.map((row) => rowHtml(row, false)).join('')}</tbody></table></div>` : ''}
  `;
}

async function saveManualFob() {
  const data = document.getElementById('fobData')?.value;
  if (!data) {
    feedback('Informe a data do FOB 0.', true);
    return;
  }
  const button = document.getElementById('fobSalvar');
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando...';
  }

  const { error } = await supabase.from('logistica_fob').insert({
    data_referencia: data,
    numero_os: document.getElementById('fobOs')?.value?.trim() || null,
    supervisao: document.getElementById('fobSup')?.value?.trim() || null,
    cliente: document.getElementById('fobCliente')?.value?.trim() || null,
    tons_movimento: Number(document.getElementById('fobMov')?.value) || 0,
    tons_producao: Number(document.getElementById('fobProd')?.value) || 0,
    tons_nh: Number(document.getElementById('fobNh')?.value) || 0,
    observacao: document.getElementById('fobObs')?.value?.trim() || null,
    status: 'PENDENTE',
    criado_por: state.user?.id || null,
  });

  if (button) {
    button.disabled = false;
    button.textContent = 'Registrar FOB 0';
  }
  if (error) {
    feedback(error.message, true);
    return;
  }

  ['fobOs', 'fobSup', 'fobCliente', 'fobMov', 'fobProd', 'fobNh', 'fobObs'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  feedback('FOB 0 registrado. Aguardando validação do gestor.');
  await loadFobHistory();
}

async function validateFob(id, status, button) {
  const rowElement = button.closest('[data-fob-id]');
  const observation = rowElement?.querySelector('[data-fob-obs-gestor]')?.value?.trim() || null;
  button.disabled = true;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('logistica_fob')
    .update({
      status,
      observacao_gestor: observation,
      validado_por: state.user?.id || null,
      validado_em: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) {
    button.disabled = false;
    feedback(error.message, true);
    return;
  }
  feedback(`FOB 0 marcado como ${status === 'VALIDO' ? 'Válido' : 'Inválido'}.`);
  await loadFobHistory();
}

async function savePendingRows() {
  const existing = new Set(state.fob.map((row) => `${row.numero_os || ''}|${String(row.data_referencia || '').slice(0, 10)}`));
  const pending = state.reportRows
    .filter((row) => row.status === 'PENDENTE')
    .filter((row) => !existing.has(`${row.os || ''}|${row.data}`));

  if (!pending.length) {
    feedback('Nenhuma pendência nova para salvar. As existentes não foram duplicadas.');
    return;
  }

  const button = document.getElementById('fobSalvarPendentes');
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando...';
  }

  try {
    const payload = pending.map((row) => ({
      data_referencia: row.data,
      numero_os: row.os || null,
      supervisao: row.supervisao || null,
      cliente: row.cliente || null,
      tons_movimento: row.tons_movimento || 0,
      tons_producao: 0,
      tons_nh: 0,
      observacao: [
        row.observacao,
        `Gerado pela comparação automática. Fonte: ${row.origem_candidato}. Local: ${row.cidade || '-'} / ${row.local || '-'}`,
      ].filter(Boolean).join(' | '),
      status: 'PENDENTE',
      criado_por: state.user?.id || null,
    }));

    let saved = 0;
    for (let index = 0; index < payload.length; index += 300) {
      const chunk = payload.slice(index, index + 300);
      const { error } = await supabase.from('logistica_fob').insert(chunk);
      if (error) throw error;
      saved += chunk.length;
    }
    feedback(`${saved} pendência(s) FOB salvas no painel.`);
    await loadFobHistory();
  } catch (error) {
    console.error('[FOB salvar pendentes]', error);
    feedback(`Falha ao salvar pendências: ${error?.message || 'erro desconhecido'}.`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Salvar pendentes no painel';
    }
  }
}

function reportRowsToCsv(rows) {
  const header = ['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'CLIENTE', 'CIDADE', 'LOCAL', 'ORIGEM', 'STATUS', 'OBS'];
  const values = rows.map((row) => [
    row.data_br,
    row.os,
    row.supervisao,
    row.funcionario,
    row.cliente,
    row.cidade,
    row.local,
    row.origem_candidato,
    row.status,
    row.observacao,
  ]);
  return [header, ...values]
    .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
}

function exportCsv() {
  if (!state.reportRows.length) return;
  const blob = new Blob(['\ufeff' + reportRowsToCsv(state.reportRows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `FOB_${todayIso()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function regionalFromSupervision(supervision) {
  const value = String(supervision || '').trim();
  if (!value) return 'SEM REGIONAL';
  const index = value.indexOf('-');
  return (index > 0 ? value.slice(0, index) : value).trim().toUpperCase();
}

function updateRegionalSelect() {
  const select = document.getElementById('logRegionalFob');
  if (!select) return;
  const current = select.value;
  const regionals = [...new Set(state.reportRows.map((row) => regionalFromSupervision(row.supervisao)))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Selecione</option>'
    + regionals.map((regional) => `<option value="${esc(regional)}">${esc(regional)}</option>`).join('');
  if (regionals.includes(current)) select.value = current;
}

async function ensureExportLibrary(url, globalName) {
  if (window[globalName]) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Não foi possível carregar ${globalName}.`));
    document.head.appendChild(script);
  });
}

function buildRegionalNode(regional, rows) {
  const node = document.createElement('div');
  node.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:24px;font-family:Arial,sans-serif;width:1100px;color:#111';
  const statusColor = (status) => status === 'OK' ? '#16a34a' : status === 'DOIS EMBARQUES' ? '#ca8a04' : '#dc2626';
  node.innerHTML = `
    <h2 style="margin:0 0 4px">FOB — ${esc(regional)}</h2>
    <p style="margin:0 0 16px;color:#555">${new Date().toLocaleString('pt-BR')} · ${rows.length} O.S.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr>${['DATA', 'OS', 'SUPERVISÃO', 'FUNCIONÁRIO', 'ORIGEM', 'STATUS', 'OBS'].map((header) => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9;text-align:left">${header}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.data_br)}</td>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.os)}</td>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.supervisao || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.funcionario || '-')}</td>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.origem_candidato)}</td>
        <td style="border:1px solid #ddd;padding:6px;font-weight:700;color:${statusColor(row.status)}">${esc(row.status)}</td>
        <td style="border:1px solid #ddd;padding:6px">${esc(row.observacao || '')}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  document.body.appendChild(node);
  return node;
}

function downloadUrl(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function regionalFeedback(message) {
  const element = document.getElementById('logRegionalFeedback');
  if (!element) return;
  element.style.display = 'block';
  element.textContent = message;
}

async function generateRegionalImage(regional) {
  if (!regional) {
    regionalFeedback('Selecione uma regional.');
    return;
  }
  const rows = state.reportRows.filter((row) => regionalFromSupervision(row.supervisao) === regional);
  if (!rows.length) {
    regionalFeedback('Nenhuma linha para essa regional.');
    return;
  }

  const button = document.getElementById('logGerarImagemRegional');
  if (button) button.disabled = true;
  let node;
  try {
    regionalFeedback('Gerando imagem...');
    await ensureExportLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
    node = buildRegionalNode(regional, rows);
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
    downloadUrl(canvas.toDataURL('image/png'), `FOB_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`);
    regionalFeedback(`Imagem gerada: ${rows.length} O.S.`);
  } catch (error) {
    console.error('[FOB imagem regional]', error);
    regionalFeedback(error?.message || 'Erro ao gerar imagem.');
  } finally {
    node?.remove();
    if (button) button.disabled = false;
  }
}

async function generateAllRegionalZip() {
  if (!state.reportRows.length) {
    regionalFeedback('A comparação não possui linhas para exportar.');
    return;
  }
  const button = document.getElementById('logGerarZipRegionais');
  if (button) button.disabled = true;
  const nodes = [];

  try {
    regionalFeedback('Gerando ZIP...');
    await ensureExportLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
    await ensureExportLibrary('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

    const groups = new Map();
    state.reportRows.forEach((row) => {
      const regional = regionalFromSupervision(row.supervisao);
      if (!groups.has(regional)) groups.set(regional, []);
      groups.get(regional).push(row);
    });

    const zip = new window.JSZip();
    for (const [regional, rows] of groups) {
      const node = buildRegionalNode(regional, rows);
      nodes.push(node);
      const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
      zip.file(`FOB_${regional.replace(/[^a-zA-Z0-9]+/g, '_')}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `FOB_regionais_${todayIso()}.zip`);
    URL.revokeObjectURL(url);
    regionalFeedback(`ZIP gerado com ${groups.size} regional(is).`);
  } catch (error) {
    console.error('[FOB ZIP regionais]', error);
    regionalFeedback(error?.message || 'Erro ao gerar ZIP.');
  } finally {
    nodes.forEach((node) => node.remove());
    if (button) button.disabled = false;
  }
}

function bindEvents(content) {
  content.addEventListener('click', async (event) => {
    if (event.target.closest('#fobReload')) {
      await Promise.all([loadFobHistory(), generateAutomaticReport()]);
      return;
    }
    if (event.target.closest('#fobSalvarPendentes')) {
      await savePendingRows();
      return;
    }
    if (event.target.closest('#fobExportCsv')) {
      exportCsv();
      return;
    }
    if (event.target.closest('#fobSalvar')) {
      await saveManualFob();
      return;
    }
    const validButton = event.target.closest('[data-fob-valido]');
    if (validButton) {
      await validateFob(validButton.dataset.fobValido, 'VALIDO', validButton);
      return;
    }
    const invalidButton = event.target.closest('[data-fob-invalido]');
    if (invalidButton) {
      await validateFob(invalidButton.dataset.fobInvalido, 'INVALIDO', invalidButton);
      return;
    }
    if (event.target.closest('#logGerarImagemRegional')) {
      await generateRegionalImage(document.getElementById('logRegionalFob')?.value || '');
      return;
    }
    if (event.target.closest('#logGerarZipRegionais')) {
      await generateAllRegionalZip();
    }
  });
}

export async function renderContent(content) {
  injectStyles();
  state.user = await getCurrentUser();
  renderShell(content);
  bindEvents(content);
  await Promise.all([loadFobHistory(), generateAutomaticReport()]);
}

initProtectedPage('FOB — Logística', renderContent);
