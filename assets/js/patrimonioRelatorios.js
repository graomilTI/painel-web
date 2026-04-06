import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const EXPORT_W = 1920;
const EXPORT_H = 1080;
const EXPORT_SCALE = 2;
const DEFAULT_ROWS_PER_PAGE = 18;
const TABLE_ROWS_PER_PAGE = 100;
const IGNORED_STATUS = new Set(['baixado', 'manutencao', 'manutenção']);
const FETCH_BATCH_SIZE = 1000;

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
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
    }
    .g1000-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .g1000-header h1 { margin: 0; font-size: 34px; line-height: 1.1; }
    .g1000-header p { margin: 8px 0 0; font-size: 16px; color: #475569; }
    .gpage-badge {
      background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 999px;
      padding: 10px 16px; font-size: 14px; font-weight: 700; white-space: nowrap;
    }
    .gstats { display: flex; gap: 16px; margin-bottom: 26px; flex-wrap: wrap; }
    .gstat {
      background: #fff; border: 1px solid #cbd5e1; border-radius: 18px;
      padding: 14px 18px; min-width: 150px;
    }
    .glabel { color: #475569; margin-right: 6px; }
    .gtable-wrap {
      background: #fff; border-radius: 20px; overflow: hidden;
      box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
    }
    .gtable { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .gtable thead th {
      background: #0f172a; color: #fff; font-size: 13px; letter-spacing: .04em;
      text-align: left; padding: 14px 10px; border-right: 1px solid rgba(255,255,255,.15);
    }
    .gtable tbody td {
      font-size: 14px; padding: 10px 10px; border: 1px solid #dbe4ef;
      vertical-align: top; word-break: break-word;
    }
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
    host.removeChild(page);
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

function renderTableRows(rows, page = 1) {
  const tbody = document.getElementById('patrimonioRows');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado com os filtros informados.</td></tr>';
    return;
  }

  const start = (page - 1) * TABLE_ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + TABLE_ROWS_PER_PAGE);

  tbody.innerHTML = pageRows.map((row) => {
    const diasInfo = getDiasInfo(row);
    const diasLabel = diasInfo.hasValue ? String(diasInfo.value) : '-';
    const tagClass = !diasInfo.hasValue ? '' : diasInfo.value > 10 ? 'danger' : 'success';
    return `
      <tr>
        <td>${escapeHtml(row.patrimonio_codigo || '-')}</td>
        <td>${escapeHtml(getRegional(row))}</td>
        <td>${escapeHtml(row.supervisao || '-')}</td>
        <td>${escapeHtml(row.funcionario || '-')}</td>
        <td>${escapeHtml(row.identificacao || '-')}</td>
        <td>${escapeHtml(row.ultima_leitura_fmt || '-')}</td>
        <td><span class="status-badge ${tagClass}">${escapeHtml(diasLabel)}</span></td>
      </tr>
    `;
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
  const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalRows ? ((safePage - 1) * TABLE_ROWS_PER_PAGE) + 1 : 0;
  const end = Math.min(safePage * TABLE_ROWS_PER_PAGE, totalRows);

  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');

  if (info) info.textContent = totalRows ? `Página ${safePage}/${totalPages} • exibindo ${start}-${end} de ${totalRows}` : 'Página 1/1 • sem registros';
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

initProtectedPage('Relatórios de Patrimônios', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Relatórios de Patrimônios</h2>
          <p class="section-subtitle">Consulta da base atual importada em <strong>RELATÓRIOS &gt; Patrimônios</strong>, com filtros por coordenação, supervisão e situação de atraso.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('patrimonio-relatorios')}" class="active">Relatórios</a>
          <a href="${toPanelUrl('importar-patrimonios')}">Importar arquivo</a>
          <a href="${toPanelUrl('adm-patrimonio')}">Painel de Patrimônios</a>
        </div>
      </div>

      <div class="grid-cards">
        <article class="card"><h3>Total filtrado</h3><div class="hero-metric" id="sumRegistros">0</div></article>
        <article class="card"><h3>Em dia</h3><div class="hero-metric" id="sumEmDia">0</div></article>
        <article class="card"><h3>Em atraso</h3><div class="hero-metric" id="sumAtrasados">0</div></article>
        <article class="card"><h3>Sem dias</h3><div class="hero-metric" id="sumSemDias">0</div></article>
        <article class="card"><h3>% em dia</h3><div class="hero-metric" id="sumPercentual">0%</div></article>
      </div>

      <article class="base-card">
        <div class="base-grid">
          <div class="base-field third">
            <label class="base-label" for="fCoordenacao">Regional</label>
            <select class="base-select" id="fCoordenacao"><option value="">Todas</option></select>
          </div>
          <div class="base-field third">
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <select class="base-select" id="fSupervisao"><option value="">Todas</option></select>
          </div>
          <div class="base-field third">
            <label class="base-label" for="fTipo">Situação</label>
            <select class="base-select" id="fTipo">
              <option value="geral">Geral</option>
              <option value="atrasados">Somente atrasados</option>
              <option value="emdia">Somente em dia</option>
              <option value="semdias">Somente sem dias</option>
            </select>
          </div>
          <div class="base-field third">
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
          <button class="base-button secondary" id="btnCsv">Baixar CSV</button>
          <button class="base-button secondary" id="btnZip">Gerar ZIP imagens</button>
          <button class="base-button secondary" id="btnZipRegional">Gerar ZIP por regional</button>
        </div>

        <pre id="patrimonioFeedback" style="white-space:pre-wrap;margin:14px 0 0;color:#cbd5e1;">Carregando base atual...</pre>
      </article>

      <article class="base-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
          <strong>Lista de patrimônios</strong>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="base-button secondary" id="btnPrevPage" type="button">Anterior</button>
            <span id="paginationInfo" style="opacity:.85;">Página 1/1</span>
            <button class="base-button secondary" id="btnNextPage" type="button">Próxima</button>
          </div>
        </div>
        <div style="overflow:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Regional</th>
                <th>Supervisão</th>
                <th>Funcionário</th>
                <th>Identificação</th>
                <th>Última leitura</th>
                <th>Dias</th>
              </tr>
            </thead>
            <tbody id="patrimonioRows">
              <tr><td colspan="7">Carregando...</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const state = { allRows: [], filteredRows: [], currentPage: 1 };

  const readFilters = () => ({
    coordenacao: document.getElementById('fCoordenacao')?.value || '',
    supervisao: document.getElementById('fSupervisao')?.value || '',
    tipo: document.getElementById('fTipo')?.value || 'geral',
    busca: document.getElementById('fBusca')?.value || '',
    excluirIgnorados: (document.getElementById('fIgnorados')?.value || 'mostrar') === 'excluir'
  });

  const applyAndRender = (page = 1) => {
    state.filteredRows = applyFilters(state.allRows, readFilters());
    state.currentPage = updatePagination(state.filteredRows.length, page);
    renderTableRows(state.filteredRows, state.currentPage);
    updateSummary(state.filteredRows);

    const stats = computeStats(state.filteredRows);
    setFeedback(`${state.filteredRows.length} registro(s) exibido(s) na tela. | Com dias informados: ${stats.emDia + stats.atrasados} | Sem dias informados: ${stats.semDias}`);
  };

  const refreshSupervisoes = () => {
    const coord = document.getElementById('fCoordenacao')?.value || '';
    const source = coord ? state.allRows.filter((row) => normalizeKey(getRegional(row)) === normalizeKey(coord)) : state.allRows;
    const supervisoes = [...new Set(source.map((row) => normalizeText(row.supervisao)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelectOptions('fSupervisao', supervisoes, 'Todas');
  };

  document.getElementById('btnAplicar')?.addEventListener('click', () => applyAndRender(1));
  document.getElementById('btnLimpar')?.addEventListener('click', () => {
    document.getElementById('fCoordenacao').value = '';
    document.getElementById('fTipo').value = 'geral';
    document.getElementById('fIgnorados').value = 'mostrar';
    document.getElementById('fBusca').value = '';
    refreshSupervisoes();
    document.getElementById('fSupervisao').value = '';
    applyAndRender(1);
  });
  document.getElementById('fCoordenacao')?.addEventListener('change', () => { refreshSupervisoes(); applyAndRender(1); });
  document.getElementById('fSupervisao')?.addEventListener('change', () => applyAndRender(1));
  document.getElementById('fTipo')?.addEventListener('change', () => applyAndRender(1));
  document.getElementById('fIgnorados')?.addEventListener('change', () => applyAndRender(1));
  document.getElementById('fBusca')?.addEventListener('input', () => applyAndRender(1));
  document.getElementById('btnPrevPage')?.addEventListener('click', () => applyAndRender(state.currentPage - 1));
  document.getElementById('btnNextPage')?.addEventListener('click', () => applyAndRender(state.currentPage + 1));

  document.getElementById('btnCsv')?.addEventListener('click', () => {
    if (!state.filteredRows.length) return setFeedback('Não há registros filtrados para exportar.', true);
    downloadBlob('relatorio-patrimonios.csv', new Blob([toCsv(state.filteredRows)], { type: 'text/csv;charset=utf-8' }));
    setFeedback('CSV gerado com sucesso.');
  });

  document.getElementById('btnZip')?.addEventListener('click', async () => {
    if (!state.filteredRows.length) return setFeedback('Não há registros filtrados para exportar.', true);
    try {
      setFeedback('Carregando bibliotecas de exportação e montando páginas...');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
      const images = await gerarPacoteImagensPaginado({
        rows: state.filteredRows,
        titulo: buildReportTitle(readFilters().tipo, readFilters().coordenacao),
        subtitulo: `Base filtrada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
        stats: computeStats(state.filteredRows),
        filePrefix: 'patrimonios'
      });
      await baixarZipDeImagens(images, 'relatorios-patrimonios.zip');
      setFeedback('ZIP de imagens gerado com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o ZIP.', true);
    }
  });

  document.getElementById('btnZipRegional')?.addEventListener('click', async () => {
    try {
      setFeedback('Gerando ZIP geral por regional...');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      await ensureExportLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

      const globalFilters = readFilters();
      const baseRows = applyFilters(state.allRows, { ...globalFilters, coordenacao: '', supervisao: '', busca: '' });
      const regionais = groupRowsByRegional(baseRows);
      if (!regionais.length) return setFeedback('Não há registros para gerar o ZIP por regional.', true);

      const zip = new window.JSZip();
      const geradoEm = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      const resumo = [
        `Total de regionais: ${regionais.length}`,
        `Total de registros considerados: ${baseRows.length}`,
        `Gerado em: ${geradoEm}`,
        ''
      ];

      for (let i = 0; i < regionais.length; i += 1) {
        const [regional, rows] = regionais[i];
        const slug = slugify(regional);
        const stats = computeStats(rows);
        const folder = zip.folder(slug);
        if (!folder) continue;

        resumo.push(`${regional}: ${rows.length} registro(s)`);
        folder.file('relatorio.csv', toCsv(rows));

        setFeedback(`Gerando ZIP por regional... ${i + 1}/${regionais.length} | ${regional}`);
        // eslint-disable-next-line no-await-in-loop
        const images = await gerarPacoteImagensPaginado({
          rows,
          titulo: buildReportTitle(globalFilters.tipo, regional),
          subtitulo: `Regional ${regional} • Gerado em ${geradoEm}`,
          stats,
          filePrefix: slug
        });

        images.forEach((img) => {
          const base64 = img.dataUrl.split(',')[1];
          folder.file(img.filename, base64, { base64: true });
        });
      }

      zip.file('resumo.txt', resumo.join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob('relatorios-patrimonios-por-regional.zip', blob);
      setFeedback(`ZIP por regional gerado com sucesso. ${regionais.length} regional(is) incluída(s).`);
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o ZIP por regional.', true);
    }
  });

  (async () => {
    try {
      state.allRows = await loadSnapshotRows();
      const coordenacoes = [...new Set(state.allRows.map((row) => getRegional(row)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      fillSelectOptions('fCoordenacao', coordenacoes, 'Todas');
      refreshSupervisoes();
      applyAndRender(1);
    } catch (error) {
      console.error(error);
      renderTableRows([], 1);
      updateSummary([]);
      updatePagination(0, 1);
      setFeedback(error?.message || 'Erro ao carregar base de patrimônios.', true);
    }
  })();
});

window.PATRIMONIO_RELATORIOS = window.PATRIMONIO_RELATORIOS || {};
window.PATRIMONIO_RELATORIOS.gerarPacoteImagensPaginado = gerarPacoteImagensPaginado;
window.PATRIMONIO_RELATORIOS.baixarZipDeImagens = baixarZipDeImagens;
window.PATRIMONIO_RELATORIOS.EXPORT_CONFIG = { width: EXPORT_W, height: EXPORT_H, rowsPerPage: DEFAULT_ROWS_PER_PAGE };
