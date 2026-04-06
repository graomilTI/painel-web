import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const EXPORT_W = 1920;
const EXPORT_H = 1080;
const EXPORT_SCALE = 2;
const DEFAULT_ROWS_PER_PAGE = 18;
const INACTIVE_STATUS = new Set(['baixado', 'manutencao', 'manutenção']);

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
    `<div class="gstat"><span class="glabel">Com dias:</span><strong>${stats.considerados}</strong></div>`,
    `<div class="gstat"><span class="glabel">Sem dias:</span><strong>${stats.semLeitura}</strong></div>`,
    `<div class="gstat"><span class="glabel">% em dia:</span><strong>${stats.percentual}</strong></div>`
  ].join('');

  const bodyRows = rows.map((item) => {
    const dias = parseDias(item.dias_sem_leitura ?? item.diasSemLeitura ?? item.dias);
    const rowClass = dias === null ? '' : dias > 10 ? 'is-atrasado' : 'is-ok';
    return `
      <tr class="${rowClass}">
        <td class="col-pat">${escapeHtml(item.patrimonio_codigo ?? item.patrimonio ?? '')}</td>
        <td class="col-sup">${escapeHtml(item.supervisao ?? '')}</td>
        <td class="col-nome">${escapeHtml(item.funcionario ?? item.nome ?? '')}</td>
        <td class="col-id">${escapeHtml(item.identificacao ?? '')}</td>
        <td class="col-leitura">${escapeHtml(item.ultima_leitura_fmt ?? item.ultimaLeitura ?? item.ultima_leitura ?? '')}</td>
        <td class="col-dias">${escapeHtml(dias === null ? '-' : dias)}</td>
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
    .g1000-header h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
    }
    .g1000-header p {
      margin: 8px 0 0;
      font-size: 16px;
      color: #475569;
    }
    .gpage-badge {
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .gstats {
      display: flex;
      gap: 16px;
      margin-bottom: 26px;
    }
    .gstat {
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 18px;
      padding: 14px 18px;
      min-width: 150px;
    }
    .glabel {
      color: #475569;
      margin-right: 6px;
    }
    .gtable-wrap {
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
    }
    .gtable {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .gtable thead th {
      background: #0f172a;
      color: #fff;
      font-size: 13px;
      letter-spacing: .04em;
      text-align: left;
      padding: 14px 10px;
      border-right: 1px solid rgba(255,255,255,.15);
    }
    .gtable tbody td {
      font-size: 14px;
      padding: 10px 10px;
      border: 1px solid #dbe4ef;
      vertical-align: top;
      word-break: break-word;
    }
    .gtable tbody tr.is-atrasado td.col-dias {
      color: #b91c1c;
      font-weight: 700;
    }
    .gtable tbody tr.is-ok td.col-dias {
      color: #166534;
      font-weight: 700;
    }
    .col-pat { width: 8%; white-space: nowrap; }
    .col-sup { width: 13%; }
    .col-nome { width: 22%; }
    .col-id { width: 35%; }
    .col-leitura { width: 14%; white-space: nowrap; font-size: 12px; }
    .col-dias { width: 8%; text-align: center; white-space: nowrap; }
    @media print {
      @page { size: landscape; margin: 10mm; }
    }
  `;
  document.head.appendChild(style);
}

async function domToPng(node, filenameBase) {
  if (!window.html2canvas) {
    throw new Error('html2canvas não encontrado.');
  }
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
  const dataUrl = canvas.toDataURL('image/png');
  return { filename: `${filenameBase}.png`, dataUrl };
}

async function gerarPacoteImagensPaginado({
  rows,
  titulo,
  subtitulo,
  stats,
  filePrefix,
  rowsPerPage = DEFAULT_ROWS_PER_PAGE
}) {
  ensureStyles();
  const host = ensureExportHost();
  host.innerHTML = '';

  const pages = chunkArray(rows, rowsPerPage);
  const results = [];

  for (let i = 0; i < pages.length; i++) {
    const wrap = document.createElement('div');
    wrap.innerHTML = buildPageHtml({
      titulo,
      subtitulo,
      stats,
      rows: pages[i],
      pageIndex: i,
      pageCount: pages.length
    });
    const page = wrap.firstElementChild;
    host.appendChild(page);
    // eslint-disable-next-line no-await-in-loop
    const png = await domToPng(page, `${filePrefix}-pagina-${String(i + 1).padStart(2, '0')}`);
    results.push(png);
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
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

function toCsv(rows) {
  const header = [
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

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function parseDias(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeStats(rows) {
  const registros = rows.length;
  const comDias = rows.filter((r) => parseDias(r.dias_sem_leitura) !== null);
  const emDia = comDias.filter((r) => parseDias(r.dias_sem_leitura) <= 10).length;
  const atrasados = comDias.filter((r) => parseDias(r.dias_sem_leitura) > 10).length;
  const semLeitura = registros - comDias.length;

  return {
    registros,
    base: registros ? 'Snapshot atual completo' : 'Sem base',
    percentual: formatPercent(emDia, comDias.length),
    atrasados,
    emDia,
    semLeitura,
    considerados: comDias.length
  };
}

function buildReportTitle(tipo) {
  if (tipo === 'atrasados') return 'Patrimônios em atraso';
  if (tipo === 'emdia') return 'Patrimônios em dia';
  return 'Relatório geral de patrimônios';
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    const situacao = normalizeKey(row.situacao);
    const dias = parseDias(row.dias_sem_leitura);
    const nome = normalizeKey(`${row.funcionario || ''} ${row.identificacao || ''} ${row.patrimonio_codigo || ''}`);

    if (filters.coordenacao && normalizeKey(row.coordenacao) !== normalizeKey(filters.coordenacao)) return false;
    if (filters.supervisao && normalizeKey(row.supervisao) !== normalizeKey(filters.supervisao)) return false;
    if (filters.busca && !nome.includes(normalizeKey(filters.busca))) return false;
    if (filters.tipo === 'ativos' && INACTIVE_STATUS.has(situacao)) return false;
    if (filters.tipo === 'atrasados' && (dias === null || dias <= 10)) return false;
    if (filters.tipo === 'emdia' && (dias === null || dias > 10)) return false;
    if (filters.tipo === 'semleitura' && dias !== null) return false;
    return true;
  });
}

async function loadSnapshotRows() {
  const { data, error } = await supabase
    .from('patrimonios_snapshot')
    .select('patrimonio_codigo, coordenacao, supervisao, funcionario, identificacao, situacao, ultima_leitura, dias_sem_leitura')
    .order('coordenacao', { ascending: true })
    .order('supervisao', { ascending: true })
    .order('funcionario', { ascending: true })
    ;

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    ultima_leitura_fmt: formatDateTime(row.ultima_leitura)
  }));
}

function renderTableRows(rows) {
  const tbody = document.getElementById('patrimonioRows');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado com os filtros informados.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const dias = parseDias(row.dias_sem_leitura);
    const tagClass = dias === null ? 'neutral' : dias > 10 ? 'danger' : 'success';
    return `
      <tr>
        <td>${escapeHtml(row.patrimonio_codigo || '-')}</td>
        <td>${escapeHtml(row.coordenacao || '-')}</td>
        <td>${escapeHtml(row.supervisao || '-')}</td>
        <td>${escapeHtml(row.funcionario || '-')}</td>
        <td>${escapeHtml(row.identificacao || '-')}</td>
        <td>${escapeHtml(row.ultima_leitura_fmt || '-')}</td>
        <td><span class="status-badge ${tagClass}">${escapeHtml(dias === null ? '-' : String(dias))}</span></td>
      </tr>
    `;
  }).join('');
}

function fillSelectOptions(selectId, values, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const current = el.value;
  const options = ['<option value="">' + escapeHtml(placeholder) + '</option>']
    .concat(values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  el.innerHTML = options.join('');
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
  set('sumSemLeitura', stats.semLeitura);
  set('sumPercentual', stats.percentual);
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

initProtectedPage('Relatórios de Patrimônios', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Relatórios de Patrimônios</h2>
          <p class="section-subtitle">
            Consulta da base atual importada em <strong>RELATÓRIOS &gt; Patrimônios</strong>, com filtros por coordenação,
            supervisão e situação de atraso.
          </p>
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
        <article class="card"><h3>Sem dias</h3><div class="hero-metric" id="sumSemLeitura">0</div></article>
        <article class="card"><h3>% em dia</h3><div class="hero-metric" id="sumPercentual">0%</div></article>
      </div>

      <article class="base-card">
        <div class="base-grid">
          <div class="base-field third">
            <label class="base-label" for="fCoordenacao">Coordenação</label>
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
              <option value="ativos">Excluir baixado/manutenção</option>
              <option value="atrasados">Somente atrasados</option>
              <option value="emdia">Somente em dia</option>
              <option value="semleitura">Sem dias informados</option>
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
        </div>

        <pre id="patrimonioFeedback" style="white-space:pre-wrap;margin:14px 0 0;color:#cbd5e1;">Carregando base atual...</pre>
      </article>

      <article class="base-card">
        <div style="overflow:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Coordenação</th>
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

  const state = {
    allRows: [],
    filteredRows: []
  };

  const readFilters = () => ({
    coordenacao: document.getElementById('fCoordenacao')?.value || '',
    supervisao: document.getElementById('fSupervisao')?.value || '',
    tipo: document.getElementById('fTipo')?.value || 'geral',
    busca: document.getElementById('fBusca')?.value || ''
  });

  const applyAndRender = () => {
    state.filteredRows = applyFilters(state.allRows, readFilters());
    renderTableRows(state.filteredRows);
    updateSummary(state.filteredRows);
    const stats = computeStats(state.filteredRows);
    setFeedback([
      `${state.filteredRows.length} registro(s) exibido(s) na tela.`,
      `Com dias informados: ${stats.considerados}`,
      `Sem dias informados: ${stats.semLeitura}`
    ].join(' | '));
  };

  const refreshSupervisoes = () => {
    const coord = document.getElementById('fCoordenacao')?.value || '';
    const source = coord
      ? state.allRows.filter((row) => normalizeKey(row.coordenacao) === normalizeKey(coord))
      : state.allRows;
    const supervisoes = [...new Set(source.map((row) => normalizeText(row.supervisao)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    fillSelectOptions('fSupervisao', supervisoes, 'Todas');
  };

  document.getElementById('btnAplicar')?.addEventListener('click', applyAndRender);
  document.getElementById('btnLimpar')?.addEventListener('click', () => {
    document.getElementById('fCoordenacao').value = '';
    refreshSupervisoes();
    document.getElementById('fSupervisao').value = '';
    document.getElementById('fTipo').value = 'geral';
    document.getElementById('fBusca').value = '';
    applyAndRender();
  });
  document.getElementById('fCoordenacao')?.addEventListener('change', () => {
    refreshSupervisoes();
    applyAndRender();
  });
  document.getElementById('fSupervisao')?.addEventListener('change', applyAndRender);
  document.getElementById('fTipo')?.addEventListener('change', applyAndRender);
  document.getElementById('fBusca')?.addEventListener('input', applyAndRender);

  document.getElementById('btnCsv')?.addEventListener('click', () => {
    if (!state.filteredRows.length) {
      setFeedback('Não há registros filtrados para exportar.', true);
      return;
    }
    downloadTextFile('relatorio-patrimonios.csv', toCsv(state.filteredRows), 'text/csv;charset=utf-8');
    setFeedback('CSV gerado com sucesso.');
  });

  document.getElementById('btnZip')?.addEventListener('click', async () => {
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
      const images = await gerarPacoteImagensPaginado({
        rows: state.filteredRows,
        titulo,
        subtitulo,
        stats,
        filePrefix: 'patrimonios'
      });
      await baixarZipDeImagens(images, 'relatorios-patrimonios.zip');
      setFeedback('ZIP de imagens gerado com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback(error?.message || 'Não foi possível gerar o ZIP.', true);
    }
  });

  (async () => {
    try {
      state.allRows = await loadSnapshotRows();
      const coordenacoes = [...new Set(state.allRows.map((row) => normalizeText(row.coordenacao)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
});

window.PATRIMONIO_RELATORIOS = window.PATRIMONIO_RELATORIOS || {};
window.PATRIMONIO_RELATORIOS.gerarPacoteImagensPaginado = gerarPacoteImagensPaginado;
window.PATRIMONIO_RELATORIOS.baixarZipDeImagens = baixarZipDeImagens;
window.PATRIMONIO_RELATORIOS.EXPORT_CONFIG = {
  width: EXPORT_W,
  height: EXPORT_H,
  rowsPerPage: DEFAULT_ROWS_PER_PAGE
};
