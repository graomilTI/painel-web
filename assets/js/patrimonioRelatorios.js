import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import { sincronizarPatrimoniosDoAgente } from './patrimoniosAgentSync.js';

const EXPORT_W = 1920;
const EXPORT_H = 1080;
const EXPORT_SCALE = 2;
const DEFAULT_ROWS_PER_PAGE = 18;
const TABLE_ROWS_PER_PAGE = 20;
const IGNORED_STATUS = new Set(['baixado', 'manutencao', 'manutenção']);
const FETCH_BATCH_SIZE = 1000;
const RELAT_CACHE_KEY = 'grao1000:patrimonio-relat:v1';
const RELAT_CACHE_TTL = 30 * 60 * 1000;

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sem-regional';
}

function formatDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dt);
}

function formatPercent(numerator, denominator) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function injectVisualStyles() {
  if (document.getElementById('patrimonio-relatorios-visual-styles')) return;
  const style = document.createElement('style');
  style.id = 'patrimonio-relatorios-visual-styles';
  style.textContent = `
    /* ===== Revisão 28/07/2026 — apontamento da cliente: "botões e filtros
       ocupando a tela inteira". Filtros agora ficam em uma única faixa em
       grade e os botões têm largura proporcional ao texto. ===== */
    .patrimonio-relatorios-page .base-card { padding: 14px 16px; }
    .patrimonio-relatorios-page .pat-filtros-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(180px, 1.4fr);
      gap: 10px;
      align-items: end;
    }
    .patrimonio-relatorios-page .pat-filtros-grid .base-field { grid-column: auto; }
    .patrimonio-relatorios-page .pat-filtros-grid .base-label { margin-bottom: 5px; font-size: 12px; }
    .patrimonio-relatorios-page .pat-filtros-grid .base-select,
    .patrimonio-relatorios-page .pat-filtros-grid .base-input {
      min-height: 40px;
      padding: 8px 11px;
      border-radius: 11px;
      font-size: 13.5px;
    }
    .patrimonio-relatorios-page .base-actions {
      margin-top: 10px;
      gap: 8px;
    }
    .patrimonio-relatorios-page .base-actions .base-button {
      width: auto;
      flex: 0 0 auto;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: 11px;
      font-size: 13.5px;
    }
    .patrimonio-relatorios-page #patrimonioFeedback { margin: 10px 0 0; font-size: .85rem; }
    @media (max-width: 1080px) {
      .patrimonio-relatorios-page .pat-filtros-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .patrimonio-relatorios-page .pat-filtros-grid { grid-template-columns: 1fr; }
      .patrimonio-relatorios-page .base-actions .base-button { flex: 1 1 auto; }
    }
    .patrimonio-table-card { padding: 18px; }
    .patrimonio-table-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .patrimonio-table-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .patrimonio-table-title strong { font-size: 1.05rem; }
    .patrimonio-table-subtitle { opacity: .72; font-size: .92rem; }
    .patrimonio-legend {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.28);
      border: 1px solid rgba(148, 163, 184, 0.16);
      font-size: .84rem;
      color: #dbeafe;
    }
    .legend-dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
    .legend-dot.ok { background: #22c55e; }
    .legend-dot.atraso { background: #ef4444; }
    .legend-dot.neutro { background: #6b7280; }
    .table-shell {
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      overflow: hidden;
      background: rgba(2, 12, 10, 0.55);
    }
    .table-scroll-x { overflow: auto; max-height: calc(100vh - 300px); }
    .patrimonio-table {
      width: 100%;
      min-width: 1180px;
      border-collapse: separate;
      border-spacing: 0;
    }
    .patrimonio-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: rgba(5, 18, 16, 0.98);
      backdrop-filter: blur(6px);
      box-shadow: inset 0 -1px 0 rgba(148, 163, 184, 0.14);
      padding: 13px 12px;
      font-size: .8rem;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #dbeafe;
      white-space: nowrap;
    }
    .pat-sort-btn { width: 100%; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; cursor: pointer; padding: 0; }
    .pat-sort-icon { font-size: .85em; opacity: .55; }
    .pat-sort-icon.active { opacity: 1; color: #6fd0a5; }
    .patrimonio-table tbody tr:nth-child(odd) td { background: rgba(255,255,255,0.018); }
    .patrimonio-table tbody tr:hover td { background: rgba(52, 211, 153, 0.08); }
    .patrimonio-table td {
      padding: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      vertical-align: top;
    }
    .pat-cell-patrimonio { min-width: 110px; font-weight: 700; color: #f8fafc; }
    .pat-cell-stack {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .pat-primary {
      font-weight: 600;
      color: #f8fafc;
      overflow-wrap: anywhere;
    }
    .pat-secondary {
      font-size: .82rem;
      color: #6b7280;
      overflow-wrap: anywhere;
    }
    .pat-tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 10px;
      min-width: 42px;
      border-radius: 999px;
      font-size: .84rem;
      font-weight: 700;
      border: 1px solid transparent;
    }
    .pat-tag.ok { color: #dcfce7; background: rgba(34, 197, 94, 0.16); border-color: rgba(34, 197, 94, 0.34); }
    .pat-tag.danger { color: #fee2e2; background: rgba(239, 68, 68, 0.16); border-color: rgba(239, 68, 68, 0.34); }
    .pat-tag.neutral { color: #e2e8f0; background: rgba(148, 163, 184, 0.16); border-color: rgba(148, 163, 184, 0.34); }
    .pat-regional-badge {
      display: inline-flex;
      max-width: 100%;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(20, 184, 166, 0.12);
      border: 1px solid rgba(45, 212, 191, 0.25);
      color: #ccfbf1;
      font-weight: 600;
      font-size: .82rem;
    }
    .pagination-chip {
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.34);
      border: 1px solid rgba(148, 163, 184, 0.16);
      color: #e2e8f0;
      font-size: .9rem;
    }
    .pat-pagination { display:flex; gap:8px; align-items:center; flex-wrap:nowrap; white-space:nowrap; }
    .pat-pagination .base-button { width:auto; min-width:92px; margin:0; }
    .pat-group-row { cursor:pointer; }
    .pat-group-row td { background:rgba(52,211,153,.045); }
    .pat-group-name { display:flex; align-items:center; gap:9px; }
    .pat-group-arrow { width:12px; color:#6fd0a5; font-size:.8rem; }
    .pat-group-detail td { padding:0 12px 14px 34px; background:rgba(2,12,10,.72); }
    .pat-group-detail table { width:100%; border-collapse:collapse; }
    .pat-group-detail th,.pat-group-detail td { padding:9px 10px; background:transparent; }
    .pat-group-detail th { color:rgba(226,232,240,.62); font-size:.72rem; text-transform:uppercase; text-align:left; }
    .pat-count-badge { display:inline-flex; padding:4px 9px; border-radius:999px; background:rgba(52,211,153,.12); color:#bbf7d0; font-weight:800; }
    .pat-view[hidden] { display:none !important; }
    .patrimonio-relatorios-page .pat-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
    }
    .patrimonio-relatorios-page .pat-tab {
      appearance: none;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-bottom-color: transparent;
      background: rgba(15, 23, 42, 0.34);
      color: rgba(226, 232, 240, 0.72);
      font: inherit;
      font-weight: 600;
      font-size: 13.5px;
      text-decoration: none;
      cursor: pointer;
      padding: 10px 20px;
      border-radius: 12px 12px 0 0;
      box-shadow: inset 0 -3px 0 transparent;
      transition: color .15s ease, background .15s ease;
    }
    .patrimonio-relatorios-page .pat-tab:hover { color: #e2e8f0; }
    .patrimonio-relatorios-page .pat-tab.active {
      background: rgba(2, 12, 10, 0.55);
      color: #ecfdf5;
      border-color: rgba(45, 212, 191, 0.3);
      border-bottom-color: transparent;
      box-shadow: inset 0 -3px 0 #2dd4a0;
    }
    .pat-desligados-empty { padding:34px; text-align:center; color:rgba(226,232,240,.68); }
    .pat-alert { border-color:rgba(251,146,60,.28); background:rgba(124,45,18,.12); }
    @media (max-width: 900px) {
      .patrimonio-table-card { padding: 14px; }
      .patrimonio-table-toolbar { align-items: flex-start; }
      .table-scroll-x { max-height: none; }
    }
  `;
  document.head.appendChild(style);
}

function renderThead(sortState) {
  const thead = document.getElementById('patrimonioThead');
  if (!thead) return;
  thead.innerHTML = `<tr>
    <th colspan="3">Colaborador</th>
    <th>Materiais</th>
    <th>Supervisão</th>
    <th>Regional</th>
    <th>Maior atraso</th>
  </tr>`;
}

function getDiasInfo(row) {
  if (row?.dias_sem_leitura === null || row?.dias_sem_leitura === undefined || row?.dias_sem_leitura === '') {
    return { hasValue: false, value: null };
  }
  const n = Number(row.dias_sem_leitura);
  return Number.isFinite(n) ? { hasValue: true, value: n } : { hasValue: false, value: null };
}

function getRegional(row) {
  return normalizeText(row.coordenacao) || 'Sem regional';
}

const SORT_COLUMNS = {
  patrimonio: (row) => row.patrimonio_codigo || '',
  regional: (row) => getRegional(row),
  supervisao: (row) => row.supervisao || '',
  funcionario: (row) => row.funcionario || '',
  identificacao: (row) => row.identificacao || '',
  ultima_leitura: (row) => row.ultima_leitura || '',
  dias: (row) => { const info = getDiasInfo(row); return info.hasValue ? info.value : -1; },
};

function sortIcon(sortState, column) {
  if (sortState.column !== column) return '<span class="pat-sort-icon">↕</span>';
  return `<span class="pat-sort-icon active">${sortState.direction === 'asc' ? '↑' : '↓'}</span>`;
}

function sortableTh(sortState, column, label) {
  return `<th><button class="pat-sort-btn" type="button" data-sort-column="${escapeHtml(column)}">${escapeHtml(label)} ${sortIcon(sortState, column)}</button></th>`;
}

function sortRows(rows, sortState) {
  const getValue = SORT_COLUMNS[sortState.column];
  if (!getValue) return rows;
  const factor = sortState.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
  });
}

function toCsv(rows) {
  const header = [
    'REGIONAL',
    'PATRIMÔNIO',
    'COORDENAÇÃO',
    'SUPERVISÃO',
    'FUNCIONÁRIO',
    'IDENTIFICAÇÃO',
    'SITUAÇÃO',
    'ÚLTIMA LEITURA',
    'DIAS SEM LEITURA'
  ];

  const lines = rows.map((row) => ([
    getRegional(row),
    row.patrimonio_codigo,
    row.coordenacao,
    row.supervisao,
    row.funcionario,
    row.identificacao,
    row.situacao,
    row.ultima_leitura_fmt,
    row.dias_sem_leitura
  ].map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')));

  return [header.join(';'), ...lines].join('\n');
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function ensureExportHost() {
  let host = document.getElementById('patrimonio-export-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'patrimonio-export-host';
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.zIndex = '-1';
    document.body.appendChild(host);
  }
  return host;
}

function buildPageHtml({ titulo, subtitulo, stats, rows, pageIndex, pageCount }) {
  const statHtml = [
    `<div class="gstat"><span class="glabel">Registros:</span><strong>${stats.registros}</strong></div>`,
    `<div class="gstat"><span class="glabel">Em dia:</span><strong>${stats.emDia}</strong></div>`,
    `<div class="gstat"><span class="glabel">Em atraso:</span><strong>${stats.atrasados}</strong></div>`,
    `<div class="gstat"><span class="glabel">% em dia:</span><strong>${stats.percentual}</strong></div>`
  ].join('');

  const bodyRows = rows.map((item) => {
    const diasInfo = getDiasInfo(item);
    const dias = diasInfo.hasValue ? diasInfo.value : '-';
    const rowClass = !diasInfo.hasValue ? 'is-empty' : diasInfo.value > 10 ? 'is-atrasado' : 'is-ok';
    return `
      <tr class="${rowClass}">
        <td class="col-pat">${escapeHtml(item.patrimonio_codigo ?? '')}</td>
        <td class="col-sup">${escapeHtml(item.supervisao ?? '')}</td>
        <td class="col-nome">${escapeHtml(item.funcionario ?? '')}</td>
        <td class="col-id">${escapeHtml(item.identificacao ?? '')}</td>
        <td class="col-leitura">${escapeHtml(item.ultima_leitura_fmt ?? '')}</td>
        <td class="col-dias">${escapeHtml(dias)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="g1000-export-page">
      <div class="g1000-header">
        <div>
          <h1>${escapeHtml(titulo)}</h1>
          <p>${escapeHtml(subtitulo)}</p>
        </div>
        <div class="gpage-badge">Página ${pageIndex + 1}/${pageCount}</div>
      </div>
      <div class="gstats">${statHtml}</div>
      <div class="gtable-wrap">
        <table class="gtable">
          <thead>
            <tr>
              <th class="col-pat">PATRIMÔNIO</th>
              <th class="col-sup">SUPERVISÃO</th>
              <th class="col-nome">NOME</th>
              <th class="col-id">IDENTIFICAÇÃO</th>
              <th class="col-leitura">ÚLTIMA LEITURA</th>
              <th class="col-dias">DIAS</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`;
}

function ensureStyles() {
  if (document.getElementById('patrimonio-export-styles')) return;
  const style = document.createElement('style');
  style.id = 'patrimonio-export-styles';
  style.textContent = `
    .g1000-export-page {
      width: ${EXPORT_W}px;
      min-height: ${EXPORT_H}px;
      box-sizing: border-box;
      padding: 38px 42px;
      background: #f8fafc;
      color: #0d0d18;
      font-family: Arial, Helvetica, sans-serif;
    }
    .g1000-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    .g1000-header h1 { margin: 0; font-size: 34px; line-height: 1.1; }
    .g1000-header p { margin: 8px 0 0; font-size: 16px; color: #475569; }
    .gpage-badge { background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 999px; padding: 10px 16px; font-size: 14px; font-weight: 700; white-space: nowrap; }
    .gstats { display: flex; gap: 16px; margin-bottom: 26px; flex-wrap: wrap; }
    .gstat { background: #fff; border: 1px solid #cbd5e1; border-radius: 18px; padding: 14px 18px; min-width: 150px; }
    .glabel { color: #475569; margin-right: 6px; }
    .gtable-wrap { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08); }
    .gtable { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .gtable thead th { background: #0d0d18; color: #fff; font-size: 13px; letter-spacing: .04em; text-align: left; padding: 14px 10px; border-right: 1px solid rgba(255,255,255,.15); }
    .gtable tbody td { font-size: 14px; padding: 10px 10px; border: 1px solid #dbe4ef; vertical-align: top; word-break: break-word; }
    .gtable tbody tr.is-atrasado td.col-dias { color: #b91c1c; font-weight: 700; }
    .gtable tbody tr.is-ok td.col-dias { color: #166534; font-weight: 700; }
    .gtable tbody tr.is-empty td.col-dias { color: #475569; font-weight: 700; }
    .col-pat { width: 8%; white-space: nowrap; }
    .col-sup { width: 13%; }
    .col-nome { width: 22%; }
    .col-id { width: 35%; }
    .col-leitura { width: 14%; white-space: nowrap; font-size: 12px; }
    .col-dias { width: 8%; text-align: center; white-space: nowrap; }
    @media print { @page { size: landscape; margin: 10mm; } }
  `;
  document.head.appendChild(style);
}

async function domToPng(node, filenameBase) {
  if (!window.html2canvas) throw new Error('html2canvas não encontrado.');
  const canvas = await window.html2canvas(node, {
    scale: EXPORT_SCALE,
    backgroundColor: '#f8fafc',
    useCORS: true,
    logging: false,
    width: EXPORT_W,
    height: EXPORT_H,
    windowWidth: EXPORT_W,
    windowHeight: EXPORT_H
  });
  return { filename: `${filenameBase}.png`, dataUrl: canvas.toDataURL('image/png') };
}

async function gerarPacoteImagensPaginado({ rows, titulo, subtitulo, stats, filePrefix, rowsPerPage = DEFAULT_ROWS_PER_PAGE }) {
  ensureStyles();
  const host = ensureExportHost();
  host.innerHTML = '';
  const pages = chunkArray(rows, rowsPerPage);
  const results = [];

  for (let i = 0; i < pages.length; i += 1) {
    const wrap = document.createElement('div');
    wrap.innerHTML = buildPageHtml({ titulo, subtitulo, stats, rows: pages[i], pageIndex: i, pageCount: pages.length });
    const page = wrap.firstElementChild;
    host.appendChild(page);
    // eslint-disable-next-line no-await-in-loop
    results.push(await domToPng(page, `${filePrefix}-pagina-${String(i + 1).padStart(2, '0')}`));
    page.remove();
  }

  return results;
}

async function baixarZipDeImagens(images, zipName) {
  if (!window.JSZip) throw new Error('JSZip não encontrado.');
  const zip = new window.JSZip();
  images.forEach((img) => {
    const base64 = img.dataUrl.split(',')[1];
    zip.file(img.filename, base64, { base64: true });
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipName, blob);
}

function computeStats(rows) {
  const registros = rows.length;
  let emDia = 0;
  let atrasados = 0;
  let semDias = 0;

  rows.forEach((row) => {
    const diasInfo = getDiasInfo(row);
    if (!diasInfo.hasValue) {
      semDias += 1;
    } else if (diasInfo.value > 10) {
      atrasados += 1;
    } else {
      emDia += 1;
    }
  });

  return { registros, emDia, atrasados, semDias, percentual: formatPercent(emDia, emDia + atrasados) };
}

function buildReportTitle(tipo, regional = '') {
  const suffix = regional ? ` - ${regional}` : '';
  if (tipo === 'atrasados') return `Patrimônios em atraso${suffix}`;
  if (tipo === 'emdia') return `Patrimônios em dia${suffix}`;
  return `Relatório geral de patrimônios${suffix}`;
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    const situacao = normalizeKey(row.situacao);
    const diasInfo = getDiasInfo(row);
    const searchBase = normalizeKey(`${row.funcionario || ''} ${row.identificacao || ''} ${row.patrimonio_codigo || ''} ${getRegional(row)}`);

    if (filters.excluirIgnorados && IGNORED_STATUS.has(situacao)) return false;
    if (filters.coordenacao && normalizeKey(getRegional(row)) !== normalizeKey(filters.coordenacao)) return false;
    if (filters.supervisao && normalizeKey(row.supervisao) !== normalizeKey(filters.supervisao)) return false;
    if (filters.busca && !searchBase.includes(normalizeKey(filters.busca))) return false;
    if (filters.tipo === 'atrasados' && (!diasInfo.hasValue || diasInfo.value <= 10)) return false;
    if (filters.tipo === 'emdia' && (!diasInfo.hasValue || diasInfo.value > 10)) return false;
    if (filters.tipo === 'semdias' && diasInfo.hasValue) return false;
    return true;
  });
}

async function loadSnapshotRows() {
  const all = [];
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('patrimonios_snapshot')
      .select('patrimonio_codigo, coordenacao, supervisao, funcionario, identificacao, situacao, ultima_leitura, dias_sem_leitura')
      .order('coordenacao', { ascending: true })
      .order('supervisao', { ascending: true })
      .order('funcionario', { ascending: true })
      .range(from, from + FETCH_BATCH_SIZE - 1);

    if (error) throw error;

    const batch = (data || []).map((row) => ({ ...row, ultima_leitura_fmt: formatDateTime(row.ultima_leitura) }));
    all.push(...batch);

    if (batch.length < FETCH_BATCH_SIZE) break;
    from += FETCH_BATCH_SIZE;
  }

  return all;
}

function groupRowsByColaborador(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const funcionario = normalizeText(row.funcionario) || 'Sem colaborador';
    const key = normalizeKey(funcionario);
    if (!groups.has(key)) groups.set(key, { funcionario, rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()];
}

function renderTableRows(rows, page = 1, expanded = new Set()) {
  const tbody = document.getElementById('patrimonioRows');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="pat-cell-stack"><span class="pat-primary">Nenhum registro encontrado</span><span class="pat-secondary">Tente ajustar os filtros para visualizar outros patrimônios.</span></div></td></tr>';
    return;
  }

  const groups = groupRowsByColaborador(rows);
  const start = (page - 1) * TABLE_ROWS_PER_PAGE;
  const pageGroups = groups.slice(start, start + TABLE_ROWS_PER_PAGE);

  tbody.innerHTML = pageGroups.map((group) => {
    const key = normalizeKey(group.funcionario);
    const open = expanded.has(key);
    const first = group.rows[0];
    const maxDias = Math.max(...group.rows.map((row) => getDiasInfo(row).value ?? -1));
    const tagClass = maxDias < 0 ? 'neutral' : maxDias > 10 ? 'danger' : 'ok';
    const details = group.rows.map((row) => `<tr>
      <td class="pat-cell-patrimonio">${escapeHtml(row.patrimonio_codigo || '-')}</td>
      <td>${escapeHtml(row.identificacao || '-')}</td>
      <td>${escapeHtml(normalizeText(row.situacao) || 'Sem situação')}</td>
      <td>${escapeHtml(row.ultima_leitura_fmt || '-')}</td>
      <td><span class="pat-tag ${getDiasInfo(row).hasValue ? (getDiasInfo(row).value > 10 ? 'danger' : 'ok') : 'neutral'}">${escapeHtml(getDiasInfo(row).hasValue ? getDiasInfo(row).value : '-')}</span></td>
    </tr>`).join('');
    return `<tr class="pat-group-row" data-colaborador="${escapeHtml(key)}">
      <td colspan="3"><span class="pat-group-name"><span class="pat-group-arrow">${open ? '▾' : '▸'}</span><span class="pat-primary">${escapeHtml(group.funcionario)}</span></span></td>
      <td><span class="pat-count-badge">${group.rows.length} ${group.rows.length === 1 ? 'item' : 'itens'}</span></td>
      <td><span class="pat-secondary">${escapeHtml(first.supervisao || '-')}</span></td>
      <td><span class="pat-regional-badge">${escapeHtml(getRegional(first))}</span></td>
      <td><span class="pat-tag ${tagClass}">${maxDias >= 0 ? maxDias : '-'}</span></td>
    </tr>${open ? `<tr class="pat-group-detail"><td colspan="7"><table><thead><tr><th>Patrimônio</th><th>Material</th><th>Situação</th><th>Última leitura</th><th>Dias</th></tr></thead><tbody>${details}</tbody></table></td></tr>` : ''}`;
  }).join('');
}

function fillSelectOptions(selectId, values, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const current = el.value;
  el.innerHTML = ['<option value="">' + escapeHtml(placeholder) + '</option>']
    .concat(values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`))
    .join('');
  el.value = values.includes(current) ? current : '';
}

function updateSummary(rows) {
  const stats = computeStats(rows);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };
  set('sumRegistros', stats.registros);
  set('sumEmDia', stats.emDia);
  set('sumAtrasados', stats.atrasados);
  set('sumSemDias', stats.semDias);
  set('sumPercentual', stats.percentual);
}

function updatePagination(totalRows, page) {
  const totalGroups = groupRowsByColaborador(totalRows).length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / TABLE_ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalGroups ? ((safePage - 1) * TABLE_ROWS_PER_PAGE) + 1 : 0;
  const end = Math.min(safePage * TABLE_ROWS_PER_PAGE, totalGroups);

  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');

  if (info) info.textContent = totalGroups ? `Página ${safePage}/${totalPages} • colaboradores ${start}-${end} de ${totalGroups}` : 'Página 1/1 • sem colaboradores';
  if (prev) prev.disabled = safePage <= 1;
  if (next) next.disabled = safePage >= totalPages;

  return safePage;
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('patrimonioFeedback');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fca5a5' : '#cbd5e1';
}

async function ensureExportLib(url, globalName) {
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

function groupRowsByRegional(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const regional = getRegional(row);
    if (!groups.has(regional)) groups.set(regional, []);
    groups.get(regional).push(row);
  });
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function renderContent(content) {
  injectVisualStyles();
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const statusUrl = toPanelUrl('patrimonio-status');

  content.innerHTML = `
    <section class="base-page patrimonio-relatorios-page">
      <div class="pat-tabs" role="tablist">
        <a href="${relatoriosUrl}" class="pat-tab active" id="tabRelatorios">Relatórios</a>
        <a href="${statusUrl}" class="pat-tab">Status</a>
        <button class="pat-tab" id="btnDesligados" type="button">Desligados</button>
      </div>

      <div class="pat-view" id="patRelatoriosView">
      <article class="base-card">
        <div class="pat-filtros-grid">
          <div class="base-field">
            <label class="base-label" for="fCoordenacao">Regional</label>
            <select class="base-select" id="fCoordenacao"><option value="">Todas</option></select>
          </div>
          <div class="base-field">
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <select class="base-select" id="fSupervisao"><option value="">Todas</option></select>
          </div>
          <div class="base-field">
            <label class="base-label" for="fTipo">Situação</label>
            <select class="base-select" id="fTipo">
              <option value="geral">Geral</option>
              <option value="atrasados">Somente atrasados</option>
              <option value="emdia">Somente em dia</option>
              <option value="semdias">Somente sem dias</option>
            </select>
          </div>
          <div class="base-field">
            <label class="base-label" for="fIgnorados">Baixado / Manutenção</label>
            <select class="base-select" id="fIgnorados">
              <option value="mostrar">Mostrar</option>
              <option value="excluir">Excluir</option>
            </select>
          </div>
          <div class="base-field">
            <label class="base-label" for="fBusca">Busca</label>
            <input class="base-input" id="fBusca" type="text" placeholder="Nome, identificação ou patrimônio" />
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnAplicar">Aplicar filtros</button>
          <button class="base-button secondary" id="btnLimpar">Limpar</button>
          <button class="base-button secondary" id="btnCsv">Exportar CSV</button>
          <button class="base-button secondary" id="btnZip">Exportar ZIP imagens</button>
          <button class="base-button secondary" id="btnZipRegional">Exportar ZIP por regional</button>
        </div>

        <pre id="patrimonioFeedback" style="white-space:pre-wrap;margin:14px 0 0;color:#cbd5e1;">Carregando base atual...</pre>
      </article>

      <article class="base-card patrimonio-table-card">
        <div class="patrimonio-table-toolbar">
          <div class="patrimonio-table-title">
            <strong>Lista de patrimônios</strong>
            <span class="patrimonio-table-subtitle">Visualização agrupada por colaborador; clique em um nome para ver os patrimônios.</span>
          </div>
          <div class="pat-pagination">
            <button class="base-button secondary" id="btnPrevPage" type="button">Anterior</button>
            <span id="paginationInfo" class="pagination-chip">Página 1/1</span>
            <button class="base-button secondary" id="btnNextPage" type="button">Próxima</button>
          </div>
        </div>

        <div class="patrimonio-legend" style="margin-bottom:12px;">
          <span class="legend-chip"><span class="legend-dot ok"></span> Em dia</span>
          <span class="legend-chip"><span class="legend-dot atraso"></span> Em atraso</span>
          <span class="legend-chip"><span class="legend-dot neutro"></span> Sem dias informados</span>
        </div>

        <div class="table-shell">
          <div class="table-scroll-x">
            <table class="patrimonio-table">
              <thead id="patrimonioThead">
              </thead>
              <tbody id="patrimonioRows">
                <tr><td colspan="7">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
      </div>

      <div class="pat-view" id="patDesligadosView" hidden>
        <article class="base-card patrimonio-table-card pat-alert">
          <div class="patrimonio-table-title">
            <strong>Desligados com materiais a recolher</strong>
            <span class="patrimonio-table-subtitle">Solicitações de inativação pendentes feitas em Gestor &gt; Programação &gt; Sem O.S.</span>
          </div>
          <div id="patDesligadosList" class="pat-desligados-empty">Carregando...</div>
        </article>
      </div>
    </section>
  `;

  const state = {
    allRows: [],
    filteredRows: [],
    page: 1,
    sort: { column: '', direction: 'asc' },
    expanded: new Set(),
    exportando: false
  };

  renderThead(state.sort);

  document.getElementById('patrimonioThead')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort-column]');
    if (!btn) return;
    const column = btn.dataset.sortColumn;
    state.sort = {
      column,
      direction: state.sort.column === column && state.sort.direction === 'asc' ? 'desc' : 'asc'
    };
    renderThead(state.sort);
    applyAndRender();
  });

  const readFilters = () => ({
    coordenacao: document.getElementById('fCoordenacao')?.value || '',
    supervisao: document.getElementById('fSupervisao')?.value || '',
    tipo: document.getElementById('fTipo')?.value || 'geral',
    busca: document.getElementById('fBusca')?.value || '',
    excluirIgnorados: (document.getElementById('fIgnorados')?.value || 'mostrar') === 'excluir'
  });

  const applyAndRender = () => {
    state.filteredRows = sortRows(applyFilters(state.allRows, readFilters()), state.sort);
    state.page = updatePagination(state.filteredRows, state.page);
    renderTableRows(state.filteredRows, state.page, state.expanded);
    updateSummary(state.filteredRows);

    const stats = computeStats(state.filteredRows);
    setFeedback(`${state.filteredRows.length} registro(s) exibido(s) na tela. | Com dias informados: ${stats.emDia + stats.atrasados} | Sem dias informados: ${stats.semDias}`);
  };

  async function loadDesligados() {
    const target = document.getElementById('patDesligadosList');
    if (!target) return;
    target.className = 'pat-desligados-empty';
    target.textContent = 'Carregando colaboradores e materiais...';
    const [requestsResult, freshPatrimoniosResult] = await Promise.allSettled([
      supabase
        .from('programacao_inativacao_solicitacoes')
        .select('id,colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,motivo,solicitado_em,solicitado_por_nome')
        .eq('status', 'PENDENTE')
        .order('solicitado_em', { ascending: false })
        .limit(1000),
      loadSnapshotRows(),
    ]);
    if (requestsResult.status === 'rejected' || requestsResult.value.error) {
      const error = requestsResult.status === 'rejected' ? requestsResult.reason : requestsResult.value.error;
      target.textContent = error?.message || 'Não foi possível carregar os desligados.';
      return;
    }
    if (freshPatrimoniosResult.status === 'rejected') {
      target.textContent = freshPatrimoniosResult.reason?.message || 'Não foi possível atualizar a base de patrimônios.';
      return;
    }
    const data = requestsResult.value.data || [];
    const freshPatrimonios = freshPatrimoniosResult.value;
    const latestByName = new Map();
    (data || []).forEach((request) => {
      const key = normalizeKey(request.nome_colaborador);
      if (key && !latestByName.has(key)) latestByName.set(key, request);
    });
    const entries = [...latestByName.entries()].map(([key, request]) => ({
      request,
      rows: freshPatrimonios.filter((row) => normalizeKey(row.funcionario) === key),
    })).filter((entry) => entry.rows.length);
    if (!entries.length) {
      target.textContent = 'Nenhum colaborador com solicitação de inativação pendente possui patrimônio em seu nome.';
      return;
    }
    target.className = 'table-shell';
    target.innerHTML = `<div class="table-scroll-x"><table class="patrimonio-table"><thead><tr><th>Colaborador</th><th>Materiais</th><th>Supervisão</th><th>Solicitado em</th><th>Motivo</th></tr></thead><tbody>${entries.map(({ request, rows }) => `<tr>
      <td><div class="pat-cell-stack"><span class="pat-primary">${escapeHtml(request.nome_colaborador)}</span><span class="pat-secondary">${escapeHtml(request.cargo || 'Colaborador')}</span></div></td>
      <td><div class="pat-cell-stack"><span class="pat-count-badge">${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</span><span class="pat-secondary">${rows.map((row) => `${row.patrimonio_codigo || '-'} — ${row.identificacao || '-'}`).map(escapeHtml).join('<br>')}</span></div></td>
      <td>${escapeHtml(request.supervisao || request.coordenacao || '-')}</td>
      <td>${escapeHtml(formatDateTime(request.solicitado_em))}</td>
      <td>${escapeHtml(request.motivo || '-')}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  document.getElementById('btnDesligados')?.addEventListener('click', async () => {
    document.getElementById('patRelatoriosView').hidden = true;
    document.getElementById('patDesligadosView').hidden = false;
    document.getElementById('tabRelatorios')?.classList.remove('active');
    document.getElementById('btnDesligados').classList.add('active');
    await loadDesligados();
  });
  document.getElementById('tabRelatorios')?.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('patDesligadosView').hidden = true;
    document.getElementById('patRelatoriosView').hidden = false;
    event.currentTarget.classList.add('active');
    document.getElementById('btnDesligados').classList.remove('active');
  });

  document.getElementById('patrimonioRows')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-colaborador]');
    if (!row) return;
    const key = row.dataset.colaborador;
    if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
    renderTableRows(state.filteredRows, state.page, state.expanded);
  });

  const refreshSupervisoes = () => {
    const coord = document.getElementById('fCoordenacao')?.value || '';
    const source = coord
      ? state.allRows.filter((row) => normalizeKey(getRegional(row)) === normalizeKey(coord))
      : state.allRows;
    const supervisoes = [...new Set(source.map((row) => normalizeText(row.supervisao)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelectOptions('fSupervisao', supervisoes, 'Todas');
  };

  document.getElementById('btnAplicar')?.addEventListener('click', () => {
    state.page = 1;
    applyAndRender();
  });
  document.getElementById('btnLimpar')?.addEventListener('click', () => {
    document.getElementById('fCoordenacao').value = '';
    refreshSupervisoes();
    document.getElementById('fSupervisao').value = '';
    document.getElementById('fTipo').value = 'geral';
    document.getElementById('fIgnorados').value = 'mostrar';
    document.getElementById('fBusca').value = '';
    state.page = 1;
    applyAndRender();
  });
  document.getElementById('fCoordenacao')?.addEventListener('change', () => {
    refreshSupervisoes();
    state.page = 1;
    applyAndRender();
  });
  document.getElementById('fSupervisao')?.addEventListener('change', () => { state.page = 1; applyAndRender(); });
  document.getElementById('fTipo')?.addEventListener('change', () => { state.page = 1; applyAndRender(); });
  document.getElementById('fIgnorados')?.addEventListener('change', () => { state.page = 1; applyAndRender(); });
  document.getElementById('fBusca')?.addEventListener('input', () => { state.page = 1; applyAndRender(); });

  document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    state.page = updatePagination(state.filteredRows, state.page);
    renderTableRows(state.filteredRows, state.page, state.expanded);
  });
  document.getElementById('btnNextPage')?.addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(groupRowsByColaborador(state.filteredRows).length / TABLE_ROWS_PER_PAGE));
    state.page = Math.min(maxPage, state.page + 1);
    state.page = updatePagination(state.filteredRows, state.page);
    renderTableRows(state.filteredRows, state.page, state.expanded);
  });

  document.getElementById('btnCsv')?.addEventListener('click', () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar.', true);
      return;
    }
    const blob = new Blob([toCsv(state.filteredRows)], { type: 'text/csv;charset=utf-8' });
    downloadBlob('relatorio-patrimonios.csv', blob);
    setFeedback('CSV gerado com sucesso.');
  });

  const withExportLock = (handler) => async () => {
    if (state.exportando) return;
    const btnZip = document.getElementById('btnZip');
    const btnZipRegional = document.getElementById('btnZipRegional');
    state.exportando = true;
    if (btnZip) btnZip.disabled = true;
    if (btnZipRegional) btnZipRegional.disabled = true;
    try {
      await handler();
    } finally {
      state.exportando = false;
      if (btnZip) btnZip.disabled = false;
      if (btnZipRegional) btnZipRegional.disabled = false;
    }
  };

  document.getElementById('btnZip')?.addEventListener('click', withExportLock(async () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar.', true);
      return;
    }
    try {
      setFeedback('Carregando bibliotecas de exportação e montando páginas...');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
      const stats = computeStats(state.filteredRows);
      const titulo = buildReportTitle(readFilters().tipo);
      const subtitulo = `Base filtrada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`;
      const images = await gerarPacoteImagensPaginado({ rows: state.filteredRows, titulo, subtitulo, stats, filePrefix: 'patrimonios' });
      await baixarZipDeImagens(images, 'relatorios-patrimonios.zip');
      setFeedback('ZIP de imagens gerado com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o ZIP.', true);
    }
  }));

  document.getElementById('btnZipRegional')?.addEventListener('click', withExportLock(async () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar por regional.', true);
      return;
    }

    try {
      setFeedback('Carregando bibliotecas e preparando pacotes por regional...');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

      const zip = new window.JSZip();
      const groups = groupRowsByRegional(state.filteredRows);
      const resumo = [];

      for (const [regional, rows] of groups) {
        const folder = zip.folder(slugify(regional));
        const regionalStats = computeStats(rows);
        const csvContent = toCsv(rows);
        folder.file('relatorio.csv', csvContent);

        const titulo = buildReportTitle(readFilters().tipo, regional);
        const subtitulo = `Regional ${regional} • gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`;
        // eslint-disable-next-line no-await-in-loop
        const images = await gerarPacoteImagensPaginado({ rows, titulo, subtitulo, stats: regionalStats, filePrefix: slugify(regional) });
        images.forEach((img) => {
          const base64 = img.dataUrl.split(',')[1];
          folder.file(img.filename, base64, { base64: true });
        });

        resumo.push(`${regional}: ${rows.length} registro(s) | Em dia: ${regionalStats.emDia} | Em atraso: ${regionalStats.atrasados} | Sem dias: ${regionalStats.semDias}`);
      }

      zip.file('resumo.txt', resumo.join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob('relatorios-patrimonios-por-regional.zip', blob);
      setFeedback('ZIP por regional gerado com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o ZIP por regional.', true);
    }
  }));

  (async () => {
    try {
      await sincronizarPatrimoniosDoAgente();
      let cachedRows;
      try {
        const raw = localStorage.getItem(RELAT_CACHE_KEY);
        if (raw) {
          const { ts, rows } = JSON.parse(raw);
          if (Date.now() - ts < RELAT_CACHE_TTL) cachedRows = rows;
        }
      } catch {}
      state.allRows = cachedRows ?? await (async () => {
        const fresh = await loadSnapshotRows();
        try { localStorage.setItem(RELAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: fresh })); } catch {}
        return fresh;
      })();
      const coordenacoes = [...new Set(state.allRows.map((row) => getRegional(row)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      fillSelectOptions('fCoordenacao', coordenacoes, 'Todas');
      refreshSupervisoes();
      applyAndRender();
    } catch (error) {
      console.error(error);
      renderTableRows([]);
      updateSummary([]);
      setFeedback(error?.message || 'Erro ao carregar base de patrimônios.', true);
    }
  })();
}

initProtectedPage('Relatórios de Patrimônios', renderContent);

window.PATRIMONIO_RELATORIOS = window.PATRIMONIO_RELATORIOS || {};
window.PATRIMONIO_RELATORIOS.gerarPacoteImagensPaginado = gerarPacoteImagensPaginado;
window.PATRIMONIO_RELATORIOS.baixarZipDeImagens = baixarZipDeImagens;
window.PATRIMONIO_RELATORIOS.EXPORT_CONFIG = { width: EXPORT_W, height: EXPORT_H, rowsPerPage: DEFAULT_ROWS_PER_PAGE };
