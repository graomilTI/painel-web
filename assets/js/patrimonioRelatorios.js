﻿import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import { sincronizarPatrimoniosDoAgente } from './patrimoniosAgentSync.js';
import { injectEstilosFrotas, ICON, cardFiltro } from './patrimonioLayoutFrotas.js?v=20261019-layout-geral';
import { criarDesligados } from './patrimonioDesligados.js?v=20261019-layout-geral';

const TABLE_ROWS_PER_PAGE = 20;
const IGNORED_STATUS = new Set(['baixado', 'manutencao', 'manutenção']);
const FETCH_BATCH_SIZE = 1000;
const RELAT_CACHE_KEY = 'grao1000:patrimonio-relat:v1';
const RELAT_CACHE_TTL = 30 * 60 * 1000;

const ICONS = {
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  sheet: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>',
  photo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  doc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
};

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    /* Layout no padrão das listas do Frotas (patrimonioLayoutFrotas.js): cards, barra, tabela fixa, ícones. */
    .patrimonio-relatorios-page .frotas-hub-tabs { margin-bottom: 14px; }
    .patrimonio-relatorios-page a.ds-tab { text-decoration: none; }
    .pat-view[hidden] { display:none !important; }
    .patrimonio-relatorios-page .fm-bar + .fm-bar { margin-top: -2px; }
    .pat-view-modes { display:inline-flex; gap:4px; padding:4px; border-radius:14px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.18); }
    .pat-view-mode-btn { appearance:none; border:0; background:transparent; color:#94a3b8; font:inherit; font-weight:900; font-size:12.5px; cursor:pointer; padding:7px 13px; border-radius:10px; transition:color .15s ease, background .15s ease; }
    .pat-view-mode-btn:hover { color:#e2e8f0; }
    .pat-view-mode-btn.active { background:rgba(34,197,94,.18); color:#bbf7d0; }
    .pat-pagination { display:flex; gap:8px; align-items:center; flex-wrap:nowrap; white-space:nowrap; margin-left:auto; }
    .pat-pagination .fm-ic:disabled { opacity:.35; cursor:not-allowed; }
    .pagination-chip { padding:6px 12px; border-radius:999px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.18); color:#e2e8f0; font-size:12px; font-weight:900; }
    #patrimonioFeedback { margin-left:0; }
    .patrimonio-table { min-width:1100px; }
    .patrimonio-table th { white-space:nowrap; }
    .pat-sort-btn { width: 100%; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; cursor: pointer; padding: 0; }
    .pat-sort-icon { font-size: .85em; opacity: .55; }
    .pat-sort-icon.active { opacity: 1; color: #6fd0a5; }
    .pat-cell-patrimonio { min-width: 110px; font-weight: 700; color: #f8fafc; }
    .pat-cell-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pat-primary { font-weight: 600; color: #f8fafc; overflow-wrap: anywhere; }
    .pat-secondary { font-size: .82rem; color: #94a3b8; overflow-wrap: anywhere; }
    .pat-tag { display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; min-width:42px; border-radius:999px; font-size:11px; font-weight:950; border:1px solid transparent; }
    .pat-tag.ok { color:#bbf7d0; background:rgba(22,101,52,.24); border-color:rgba(34,197,94,.35); }
    .pat-tag.danger { color:#fecaca; background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.34); }
    .pat-regional-badge { display:inline-flex; max-width:100%; padding:4px 10px; border-radius:999px; background:rgba(20,184,166,.12); border:1px solid rgba(45,212,191,.25); color:#ccfbf1; font-weight:900; font-size:11px; }
    .pat-group-row { cursor:pointer; }
    .pat-group-row td { background:rgba(34,197,94,.06) !important; }
    .pat-group-name { display:flex; align-items:center; gap:9px; }
    .pat-group-arrow { width:12px; color:#6fd0a5; font-size:.8rem; }
    .pat-group-detail td { padding:0 12px 14px 34px; background:rgba(2,12,10,.72) !important; }
    .pat-group-detail table { width:100%; border-collapse:collapse; }
    .patrimonio-relatorios-page .pat-group-detail th, .patrimonio-relatorios-page .pat-group-detail td { padding:9px 10px; background:transparent; position:static; }
    .patrimonio-relatorios-page .pat-group-detail th { color:rgba(226,232,240,.62); font-size:.72rem; text-transform:uppercase; text-align:left; letter-spacing:.06em; }
    .pat-count-badge { display:inline-flex; padding:4px 9px; border-radius:999px; background:rgba(34,197,94,.12); color:#bbf7d0; font-weight:900; font-size:12px; }
    @media (max-width: 680px) { .pat-pagination { margin-left:0; width:100%; justify-content:flex-end; } }
  `;

  document.head.appendChild(style);
}

function renderThead(sortState, viewMode = 'colaborador') {
  const thead = document.getElementById('patrimonioThead');
  if (!thead) return;
  if (viewMode === 'regional') {
    thead.innerHTML = `<tr>
      <th colspan="3">Regional</th>
      <th>Materiais</th>
      <th>Colaboradores</th>
      <th></th>
      <th>Maior atraso</th>
    </tr>`;
    return;
  }
  if (viewMode === 'lista') {
    thead.innerHTML = `<tr>
      ${sortableTh(sortState, 'patrimonio', 'Patrimônio')}
      ${sortableTh(sortState, 'funcionario', 'Colaborador')}
      ${sortableTh(sortState, 'identificacao', 'Identificação')}
      ${sortableTh(sortState, 'supervisao', 'Supervisão')}
      ${sortableTh(sortState, 'regional', 'Regional')}
      ${sortableTh(sortState, 'ultima_leitura', 'Última leitura')}
      ${sortableTh(sortState, 'dias', 'Dias')}
    </tr>`;
    return;
  }
  thead.innerHTML = `<tr>
    <th colspan="3">Colaborador</th>
    <th>Materiais</th>
    <th>Supervisão</th>
    <th>Regional</th>
    <th>Maior atraso</th>
  </tr>`;
}

// Mesmo limiar do Dashboard/gestor-app/histórico (dashboard.js, gestor-app.js) —
// unificado em 09/09/2026, esta tela usava 10 dias e as demais 7.
const DIAS_LIMITE_ATRASO = 7;

function getDiasInfo(row) {
  if (row?.dias_sem_leitura === null || row?.dias_sem_leitura === undefined || row?.dias_sem_leitura === '') {
    return { hasValue: false, value: null };
  }
  const n = Number(row.dias_sem_leitura);
  return Number.isFinite(n) ? { hasValue: true, value: n } : { hasValue: false, value: null };
}

// Sem leitura informada (dias_sem_leitura nulo) conta como atraso, igual ao
// Dashboard/gestor-app/histórico: patrimônio nunca lido é o pior caso.
function isAtraso(row) {
  const info = getDiasInfo(row);
  return !info.hasValue || info.value > DIAS_LIMITE_ATRASO;
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

// PDF de texto (vetorial) montado com jsPDF + autoTable. Antes cada página era
// "fotografada" com html2canvas (canvas de 3840x10000 px por página, convertido
// em PNG e colado no PDF): levava minutos, estourava memória em bases grandes e
// gerava arquivos de dezenas de MB. Escrever o texto direto leva poucos segundos.
const PDF_MARGIN = { top: 74, right: 28, bottom: 30, left: 28 };
const PDF_COLOR_ESCURO = [13, 13, 24];
const PDF_COLOR_ATRASO = [185, 28, 28];
const PDF_COLOR_OK = [22, 101, 52];
const PDF_COLOR_NEUTRO = [71, 85, 105];

// A fonte padrão do PDF só cobre Latin-1 e alguns sinais tipográficos; qualquer
// outro caractere sairia como lixo, então vira "?".
function pdfText(value) {
  return String(value ?? '').replace(/[^ -ÿ–—‘-”•…€]/g, '?');
}

function desenharCabecalhoPdf(doc, { titulo, subtitulo, stats }) {
  doc.setTextColor(...PDF_COLOR_ESCURO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(pdfText(titulo), PDF_MARGIN.left, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLOR_NEUTRO);
  doc.text(pdfText(subtitulo), PDF_MARGIN.left, 45);
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLOR_ESCURO);
  doc.text(
    `Registros: ${stats.registros}     Em dia: ${stats.emDia}     Em atraso: ${stats.atrasados}     % em dia: ${stats.percentual}`,
    PDF_MARGIN.left,
    59
  );
}

const PDF_TABLE_STYLES = {
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, lineColor: [219, 228, 239], lineWidth: 0.4, textColor: PDF_COLOR_ESCURO, overflow: 'linebreak' },
  headStyles: { fillColor: PDF_COLOR_ESCURO, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [248, 250, 252] },
};

/** Gera o PDF (sem baixar) de uma lista: `{ titulo, subtitulo, stats, rows }`. */
function gerarPdfPatrimonios(secao) {
  if (!window.jspdf?.jsPDF) throw new Error('jsPDF não encontrado.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  if (typeof doc.autoTable !== 'function') throw new Error('jsPDF-AutoTable não encontrado.');
  const pageWidth = doc.internal.pageSize.getWidth();
  const situacoes = secao.rows.map((row) => (isAtraso(row) ? 'atrasado' : 'ok'));

  doc.autoTable({
    ...PDF_TABLE_STYLES,
    startY: PDF_MARGIN.top,
    margin: PDF_MARGIN,
    head: [['PATRIMÔNIO', 'SUPERVISÃO', 'NOME', 'IDENTIFICAÇÃO', 'ÚLTIMA LEITURA', 'DIAS']],
    body: secao.rows.map((row) => {
      const info = getDiasInfo(row);
      return [
        pdfText(row.patrimonio_codigo),
        pdfText(row.supervisao),
        pdfText(row.funcionario),
        pdfText(row.identificacao),
        pdfText(row.ultima_leitura_fmt),
        info.hasValue ? String(info.value) : '-',
      ];
    }),
    columnStyles: {
      0: { cellWidth: 'wrap' },
      4: { cellWidth: 'wrap' },
      5: { cellWidth: 'wrap', halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 5) return;
      const situacao = situacoes[data.row.index];
      data.cell.styles.textColor = situacao === 'atrasado' ? PDF_COLOR_ATRASO : PDF_COLOR_OK;
    },
    didDrawPage: () => desenharCabecalhoPdf(doc, secao),
  });

  // A numeração "Página x/y" só pode ser escrita depois, quando o total de páginas é conhecido.
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLOR_NEUTRO);
    doc.text(`Página ${pagina}/${total}`, pageWidth - PDF_MARGIN.right, 32, { align: 'right' });
  }

  return doc;
}

function computeStats(rows) {
  const registros = rows.length;
  let emDia = 0;
  let atrasados = 0;

  rows.forEach((row) => {
    if (isAtraso(row)) atrasados += 1; else emDia += 1;
  });

  return { registros, emDia, atrasados, percentual: formatPercent(emDia, registros) };
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
    const searchBase = normalizeKey(`${row.funcionario || ''} ${row.identificacao || ''} ${row.patrimonio_codigo || ''} ${getRegional(row)}`);

    if (filters.excluirIgnorados && IGNORED_STATUS.has(situacao)) return false;
    if (filters.coordenacao && normalizeKey(getRegional(row)) !== normalizeKey(filters.coordenacao)) return false;
    if (filters.supervisao && normalizeKey(row.supervisao) !== normalizeKey(filters.supervisao)) return false;
    if (filters.busca && !searchBase.includes(normalizeKey(filters.busca))) return false;
    if (filters.tipo === 'atrasados' && !isAtraso(row)) return false;
    if (filters.tipo === 'emdia' && isAtraso(row)) return false;
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
      .order('id', { ascending: true }) // desempate: sem chave única a paginação repete/pula linhas
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

function groupRowsByRegionalGrouped(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const regional = getRegional(row);
    const key = normalizeKey(regional);
    if (!groups.has(key)) groups.set(key, { funcionario: regional, rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].sort((a, b) => a.funcionario.localeCompare(b.funcionario, 'pt-BR'));
}

function getGroups(rows, viewMode) {
  if (viewMode === 'regional') return groupRowsByRegionalGrouped(rows);
  return groupRowsByColaborador(rows);
}

function renderGroupedRows(rows, page, expanded, viewMode) {
  const tbody = document.getElementById('patrimonioRows');
  const groups = getGroups(rows, viewMode);
  const start = (page - 1) * TABLE_ROWS_PER_PAGE;
  const pageGroups = groups.slice(start, start + TABLE_ROWS_PER_PAGE);
  const isRegional = viewMode === 'regional';

  tbody.innerHTML = pageGroups.map((group) => {
    const key = normalizeKey(group.funcionario);
    const open = expanded.has(key);
    const first = group.rows[0];
    const maxDias = Math.max(...group.rows.map((row) => getDiasInfo(row).value ?? -1));
    const tagClass = group.rows.some(isAtraso) ? 'danger' : 'ok';
    const detailHeaderExtra = isRegional ? '<th>Colaborador</th>' : '<th>Material</th>';
    const details = group.rows.map((row) => `<tr>
      <td class="pat-cell-patrimonio">${escapeHtml(row.patrimonio_codigo || '-')}</td>
      <td>${escapeHtml(isRegional ? (row.funcionario || '-') : (row.identificacao || '-'))}</td>
      <td>${escapeHtml(normalizeText(row.situacao) || 'Sem situação')}</td>
      <td>${escapeHtml(row.ultima_leitura_fmt || '-')}</td>
      <td><span class="pat-tag ${isAtraso(row) ? 'danger' : 'ok'}">${escapeHtml(getDiasInfo(row).hasValue ? getDiasInfo(row).value : '-')}</span></td>
    </tr>`).join('');
    const colInfoCell = isRegional
      ? `<span class="pat-count-badge">${new Set(group.rows.map((row) => normalizeKey(row.funcionario))).size} colab.</span>`
      : `<span class="pat-secondary">${escapeHtml(first.supervisao || '-')}</span>`;
    const regionalCell = isRegional
      ? ''
      : `<td><span class="pat-regional-badge">${escapeHtml(getRegional(first))}</span></td>`;
    return `<tr class="pat-group-row" data-colaborador="${escapeHtml(key)}">
      <td colspan="3"><span class="pat-group-name"><span class="pat-group-arrow">${open ? '▾' : '▸'}</span><span class="pat-primary">${escapeHtml(group.funcionario)}</span></span></td>
      <td><span class="pat-count-badge">${group.rows.length} ${group.rows.length === 1 ? 'item' : 'itens'}</span></td>
      <td>${colInfoCell}</td>
      ${regionalCell || '<td></td>'}
      <td><span class="pat-tag ${tagClass}">${maxDias >= 0 ? maxDias : '-'}</span></td>
    </tr>${open ? `<tr class="pat-group-detail"><td colspan="7"><table><thead><tr><th>Patrimônio</th>${detailHeaderExtra}<th>Situação</th><th>Última leitura</th><th>Dias</th></tr></thead><tbody>${details}</tbody></table></td></tr>` : ''}`;
  }).join('');
}

function renderFlatRows(rows, page) {
  const tbody = document.getElementById('patrimonioRows');
  const start = (page - 1) * TABLE_ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + TABLE_ROWS_PER_PAGE);

  tbody.innerHTML = pageRows.map((row) => {
    const diasInfo = getDiasInfo(row);
    const tagClass = isAtraso(row) ? 'danger' : 'ok';
    return `<tr>
      <td class="pat-cell-patrimonio">${escapeHtml(row.patrimonio_codigo || '-')}</td>
      <td>${escapeHtml(row.funcionario || '-')}</td>
      <td>${escapeHtml(row.identificacao || '-')}</td>
      <td>${escapeHtml(row.supervisao || '-')}</td>
      <td><span class="pat-regional-badge">${escapeHtml(getRegional(row))}</span></td>
      <td>${escapeHtml(row.ultima_leitura_fmt || '-')}</td>
      <td><span class="pat-tag ${tagClass}">${escapeHtml(diasInfo.hasValue ? diasInfo.value : '-')}</span></td>
    </tr>`;
  }).join('');
}

function renderTableRows(rows, page = 1, expanded = new Set(), viewMode = 'colaborador') {
  const tbody = document.getElementById('patrimonioRows');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="pat-cell-stack"><span class="pat-primary">Nenhum registro encontrado</span><span class="pat-secondary">Tente ajustar os filtros para visualizar outros patrimônios.</span></div></td></tr>';
    return;
  }

  if (viewMode === 'lista') {
    renderFlatRows(rows, page);
    return;
  }
  renderGroupedRows(rows, page, expanded, viewMode);
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
  set('sumPercentual', stats.percentual);
}

function updatePagination(totalRows, page, viewMode = 'colaborador') {
  const totalItems = viewMode === 'lista' ? totalRows.length : getGroups(totalRows, viewMode).length;
  const totalPages = Math.max(1, Math.ceil(totalItems / TABLE_ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');

  if (info) info.textContent = `${safePage}/${totalPages}`;
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

async function ensureExportLib(url, globalName, isLoaded = () => Boolean(window[globalName])) {
  if (isLoaded()) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Não foi possível carregar ${globalName}.`));
    document.head.appendChild(script);
  });
}

// "Mato Grosso do Sul" -> "relatorios-patrimonios-mato-grosso-do-sul.pdf"; nomes que
// virariam o mesmo slug ganham sufixo para um download não sobrescrever o outro.
function nomeArquivoRegional(regional, usados) {
  const slug = normalizeKey(regional).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sem-regional';
  let nome = `relatorios-patrimonios-${slug}`;
  for (let n = 2; usados.has(nome); n += 1) nome = `relatorios-patrimonios-${slug}-${n}`;
  usados.add(nome);
  return `${nome}.pdf`;
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
  injectEstilosFrotas();
  injectVisualStyles();
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const statusUrl = toPanelUrl('patrimonio-status');

  content.innerHTML = `
    <section class="base-page patrimonio-relatorios-page">
      <div class="frotas-hub-tabs">
        <div class="ds-tabs" role="tablist">
          <a href="${relatoriosUrl}" class="ds-tab active" id="tabRelatorios" role="tab" aria-selected="true">Relatórios</a>
          <a href="${statusUrl}" class="ds-tab" role="tab" aria-selected="false">Status</a>
          <button class="ds-tab" id="btnDesligados" type="button" role="tab" aria-selected="false">Desligados</button>
        </div>
      </div>

      <div class="pat-view" id="patRelatoriosView">
        <div class="fm-kpis">
          ${cardFiltro({ label: 'Itens', tone: 'blue', icone: 'total', kpi: 'id="sumRegistros"', dica: 'Patrimônios dentro dos filtros' })}
          ${cardFiltro({ filtro: 'emdia', atributo: 'data-filter-tipo', label: 'Em dia', tone: 'green', icone: 'ok', kpi: 'id="sumEmDia"', dica: 'Mostrar somente os em dia (clique de novo para limpar)' })}
          ${cardFiltro({ filtro: 'atrasados', atributo: 'data-filter-tipo', label: 'Em atraso', tone: 'red', icone: 'alerta', kpi: 'id="sumAtrasados"', dica: 'Mostrar somente os em atraso, incluindo os sem leitura (clique de novo para limpar)' })}
          ${cardFiltro({ label: '% em dia', tone: 'purple', icone: 'relogio', kpi: 'id="sumPercentual"', dica: 'Percentual de patrimônios com leitura em dia' })}
        </div>

        <div class="fm-card"><div class="fm-body">
          <div class="fm-bar">
            <div class="fm-search">${ICON.busca}<input class="fm-input" id="fBusca" type="text" placeholder="Nome, identificação ou patrimônio" /></div>
            <select class="fm-select" id="fCoordenacao" aria-label="Regional"><option value="">Todas as regionais</option></select>
            <select class="fm-select" id="fSupervisao" aria-label="Supervisão"><option value="">Todas as supervisões</option></select>
            <select class="fm-select" id="fIgnorados" aria-label="Baixado / Manutenção">
              <option value="mostrar">Baixado/Manutenção: mostrar</option>
              <option value="excluir">Baixado/Manutenção: excluir</option>
            </select>
            <div class="fm-actions">
              <button class="fm-ic termo" id="btnAplicar" type="button" title="Aplicar filtros" aria-label="Aplicar filtros">${ICONS.check}</button>
              <button class="fm-ic" id="btnLimpar" type="button" title="Limpar filtros" aria-label="Limpar filtros">${ICONS.x}</button>
              <button class="fm-ic" id="btnCsv" type="button" title="Exportar CSV" aria-label="Exportar CSV">${ICONS.sheet}</button>
              <button class="fm-ic" id="btnPdf" type="button" title="Exportar PDF" aria-label="Exportar PDF">${ICONS.photo}</button>
              <button class="fm-ic" id="btnPdfRegional" type="button" title="Exportar PDF por regional" aria-label="Exportar PDF por regional">${ICONS.doc}</button>
            </div>
          </div>

          <div class="fm-bar">
            <div class="pat-view-modes" role="group" aria-label="Modo de visualização">
              <button class="pat-view-mode-btn active" type="button" data-view-mode="colaborador">Por colaborador</button>
              <button class="pat-view-mode-btn" type="button" data-view-mode="regional">Por regional</button>
              <button class="pat-view-mode-btn" type="button" data-view-mode="lista">Lista</button>
            </div>
            <span class="fm-count" id="patrimonioFeedback">Carregando base atual...</span>
            <div class="pat-pagination">
              <button class="fm-ic" id="btnPrevPage" type="button" title="Página anterior" aria-label="Página anterior">${ICONS.chevronLeft}</button>
              <span id="paginationInfo" class="pagination-chip">1/1</span>
              <button class="fm-ic" id="btnNextPage" type="button" title="Próxima página" aria-label="Próxima página">${ICONS.chevronRight}</button>
            </div>
          </div>

          <div class="fm-table-wrap">
            <table class="fm-table patrimonio-table">
              <thead id="patrimonioThead"></thead>
              <tbody id="patrimonioRows">
                <tr><td colspan="7" class="fm-empty">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div></div>
      </div>

      <div class="pat-view" id="patDesligadosView" hidden></div>
    </section>
  `;

  const state = {
    allRows: [],
    filteredRows: [],
    page: 1,
    sort: { column: '', direction: 'asc' },
    expanded: new Set(),
    exportando: false,
    viewMode: 'colaborador',
    // 'geral' | 'emdia' | 'atrasados' — escolhido pelos chips acima da tabela e
    // usado também pelas exportações (CSV/PDF), que partem de state.filteredRows.
    tipo: 'geral'
  };

  renderThead(state.sort, state.viewMode);

  document.getElementById('patrimonioThead')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort-column]');
    if (!btn) return;
    const column = btn.dataset.sortColumn;
    state.sort = {
      column,
      direction: state.sort.column === column && state.sort.direction === 'asc' ? 'desc' : 'asc'
    };
    renderThead(state.sort, state.viewMode);
    applyAndRender();
  });

  document.querySelectorAll('.pat-view-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.viewMode;
      if (mode === state.viewMode) return;
      state.viewMode = mode;
      state.page = 1;
      state.expanded.clear();
      document.querySelectorAll('.pat-view-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderThead(state.sort, state.viewMode);
      applyAndRender();
    });
  });

  const readFilters = () => ({
    coordenacao: document.getElementById('fCoordenacao')?.value || '',
    supervisao: document.getElementById('fSupervisao')?.value || '',
    tipo: state.tipo,
    busca: document.getElementById('fBusca')?.value || '',
    excluirIgnorados: (document.getElementById('fIgnorados')?.value || 'mostrar') === 'excluir'
  });

  const applyAndRender = () => {
    state.filteredRows = sortRows(applyFilters(state.allRows, readFilters()), state.sort);
    state.page = updatePagination(state.filteredRows, state.page, state.viewMode);
    renderTableRows(state.filteredRows, state.page, state.expanded, state.viewMode);
    // Os cards contam o que os filtros deixam passar, ignorando o chip Em dia / Em atraso (senão o outro card zeraria).
    updateSummary(applyFilters(state.allRows, { ...readFilters(), tipo: 'geral' }));
  };

  const syncTipoChips = () => {
    document.querySelectorAll('[data-filter-tipo]').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.filterTipo === state.tipo));
    });
  };

  // Clicar no chip ativo desmarca (volta para "geral", sem filtro).
  document.querySelectorAll('[data-filter-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.tipo = state.tipo === chip.dataset.filterTipo ? 'geral' : chip.dataset.filterTipo;
      state.page = 1;
      syncTipoChips();
      applyAndRender();
    });
  });

  const desligados = criarDesligados({
    target: document.getElementById('patDesligadosView'),
    loadSnapshotRows,
  });

  document.getElementById('btnDesligados')?.addEventListener('click', async () => {
    document.getElementById('patRelatoriosView').hidden = true;
    document.getElementById('patDesligadosView').hidden = false;
    document.getElementById('tabRelatorios')?.classList.remove('active');
    document.getElementById('btnDesligados').classList.add('active');
    await desligados.carregar();
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
    renderTableRows(state.filteredRows, state.page, state.expanded, state.viewMode);
  });

  const refreshSupervisoes = () => {
    const coord = document.getElementById('fCoordenacao')?.value || '';
    const source = coord
      ? state.allRows.filter((row) => normalizeKey(getRegional(row)) === normalizeKey(coord))
      : state.allRows;
    const supervisoes = [...new Set(source.map((row) => normalizeText(row.supervisao)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelectOptions('fSupervisao', supervisoes, 'Todas as supervisões');
  };

  document.getElementById('btnAplicar')?.addEventListener('click', () => {
    state.page = 1;
    applyAndRender();
  });
  document.getElementById('btnLimpar')?.addEventListener('click', () => {
    document.getElementById('fCoordenacao').value = '';
    refreshSupervisoes();
    document.getElementById('fSupervisao').value = '';
    state.tipo = 'geral';
    syncTipoChips();
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
  document.getElementById('fIgnorados')?.addEventListener('change', () => { state.page = 1; applyAndRender(); });
  document.getElementById('fBusca')?.addEventListener('input', () => { state.page = 1; applyAndRender(); });

  document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    state.page = updatePagination(state.filteredRows, state.page, state.viewMode);
    renderTableRows(state.filteredRows, state.page, state.expanded, state.viewMode);
  });
  document.getElementById('btnNextPage')?.addEventListener('click', () => {
    const totalItems = state.viewMode === 'lista' ? state.filteredRows.length : getGroups(state.filteredRows, state.viewMode).length;
    const maxPage = Math.max(1, Math.ceil(totalItems / TABLE_ROWS_PER_PAGE));
    state.page = Math.min(maxPage, state.page + 1);
    state.page = updatePagination(state.filteredRows, state.page, state.viewMode);
    renderTableRows(state.filteredRows, state.page, state.expanded, state.viewMode);
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
    const btnPdf = document.getElementById('btnPdf');
    const btnPdfRegional = document.getElementById('btnPdfRegional');
    state.exportando = true;
    if (btnPdf) btnPdf.disabled = true;
    if (btnPdfRegional) btnPdfRegional.disabled = true;
    try {
      await handler();
    } finally {
      state.exportando = false;
      if (btnPdf) btnPdf.disabled = false;
      if (btnPdfRegional) btnPdfRegional.disabled = false;
    }
  };

  // jsPDF antes do AutoTable: o plugin se registra no jsPDF já carregado.
  const ensurePdfLibs = async () => {
    await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
    await ensureExportLib(
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
      'jspdfAutoTable',
      () => typeof window.jspdf?.jsPDF?.API?.autoTable === 'function'
    );
  };
  // Dá um respiro pro navegador pintar a mensagem antes do trabalho síncrono de montar o PDF.
  const aguardarPintura = () => new Promise((resolve) => setTimeout(resolve, 30));
  const agoraFormatado = () => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());

  document.getElementById('btnPdf')?.addEventListener('click', withExportLock(async () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar.', true);
      return;
    }
    try {
      setFeedback('Montando PDF...');
      await ensurePdfLibs();
      await aguardarPintura();
      const doc = gerarPdfPatrimonios({
        titulo: buildReportTitle(readFilters().tipo),
        subtitulo: `Base filtrada em ${agoraFormatado()}`,
        stats: computeStats(state.filteredRows),
        rows: state.filteredRows,
      });
      doc.save('relatorios-patrimonios.pdf');
      setFeedback('PDF gerado com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o PDF.', true);
    }
  }));

  document.getElementById('btnPdfRegional')?.addEventListener('click', withExportLock(async () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar por regional.', true);
      return;
    }

    try {
      setFeedback('Montando PDFs por regional...');
      await ensurePdfLibs();

      const tipo = readFilters().tipo;
      const geradoEm = agoraFormatado();
      const grupos = groupRowsByRegional(state.filteredRows);
      const nomesUsados = new Set();

      // Um PDF por Coordenação, no mesmo formato do "Exportar PDF". Os downloads saem
      // em sequência (o Chrome pede uma única vez para permitir vários downloads).
      for (let i = 0; i < grupos.length; i += 1) {
        const [regional, rows] = grupos[i];
        setFeedback(`Gerando PDF ${i + 1}/${grupos.length}: ${regional}...`);
        // eslint-disable-next-line no-await-in-loop
        await aguardarPintura();
        const doc = gerarPdfPatrimonios({
          titulo: buildReportTitle(tipo, regional),
          subtitulo: `Regional ${regional} | gerado em ${geradoEm}`,
          stats: computeStats(rows),
          rows,
        });
        doc.save(nomeArquivoRegional(regional, nomesUsados));
        // eslint-disable-next-line no-await-in-loop
        if (i < grupos.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
      }

      setFeedback(`${grupos.length} PDF(s) gerados, um por regional.`);
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar os PDFs por regional.', true);
    }
  }));

  const applyRowsToUi = (rows) => {
    state.allRows = rows;
    const aviso = document.getElementById('patrimonioFeedback');
    if (aviso && aviso.textContent === 'Carregando base atual...') aviso.textContent = '';
    const coordenacoes = [...new Set(rows.map((row) => getRegional(row)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelectOptions('fCoordenacao', coordenacoes, 'Todas as regionais');
    refreshSupervisoes();
    applyAndRender();
  };

  let cachedRows;
  try {
    const raw = localStorage.getItem(RELAT_CACHE_KEY);
    if (raw) {
      const { ts, rows } = JSON.parse(raw);
      if (Date.now() - ts < RELAT_CACHE_TTL) cachedRows = rows;
    }
  } catch {}

  (async () => {
    try {
      // Renderiza com o cache local ou com a base já persistida (sem esperar a
      // sincronização com o agente, que faz várias idas ao banco e deixava a tela
      // travada em "Carregando..." por vários segundos a cada abertura da página).
      if (cachedRows) {
        applyRowsToUi(cachedRows);
      } else {
        const fresh = await loadSnapshotRows();
        try { localStorage.setItem(RELAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: fresh })); } catch {}
        applyRowsToUi(fresh);
      }
    } catch (error) {
      console.error(error);
      renderTableRows([]);
      updateSummary([]);
      setFeedback(error?.message || 'Erro ao carregar base de patrimônios.', true);
    }
  })();

  // Sincronização com o agente roda em segundo plano; quando terminar, atualiza a
  // tela silenciosamente com a base mais recente.
  sincronizarPatrimoniosDoAgente()
    .then(() => loadSnapshotRows())
    .then((fresh) => {
      try { localStorage.setItem(RELAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: fresh })); } catch {}
      applyRowsToUi(fresh);
    })
    .catch((error) => console.error('[patrimonio-relatorios] sincronização em segundo plano falhou:', error));
}

initProtectedPage('Relatórios de Patrimônios', renderContent);
