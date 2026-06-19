import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const ROWS_PER_PAGE = 20;
const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const state = {
  mode: 'volume',
  sourceRows: [],
  reportRows: [],
  reportHeaders: [],
  sourceLabel: '',
  sourceKind: 'auto',
  sort: { index: 0, direction: 'asc' },
  busy: false,
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function clean(value) {
  return String(value ?? '').trim();
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && clean(value) !== '') return value;
  }
  return '';
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text || norm(text) === 'NHE') return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const text = clean(value);
  const br = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (br) {
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function isoDate(value) {
  const date = dateValue(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  const date = dateValue(value);
  return date ? date.toLocaleDateString('pt-BR') : '';
}

function getByAliases(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const target = norm(alias);
    const key = keys.find((candidate) => norm(candidate) === target);
    if (key) return row[key];
  }
  return null;
}

function objectRowsFromWorkbook(workbook, requiredHeaders) {
  const output = [];
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!raw.length) continue;

    let headerIndex = -1;
    for (let i = 0; i < Math.min(raw.length, 30); i += 1) {
      const normalized = (raw[i] || []).map(norm);
      if (requiredHeaders.every((aliases) => aliases.some((alias) => normalized.includes(norm(alias))))) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex < 0) continue;

    const headers = raw[headerIndex].map((value, index) => clean(value) || `COLUNA_${index + 1}`);
    raw.slice(headerIndex + 1).forEach((cells) => {
      const row = {};
      headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
      row.__sheet = sheetName;
      output.push(row);
    });
  }
  return output;
}

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

async function loadAll(table, fields, orderColumn = null) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    let query = supabase.from(table).select(fields).range(from, from + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function setLatestDateRange(rows, elements) {
  const dates = rows.map((row) => isoDate(row.data)).filter(Boolean).sort();
  const latest = dates[dates.length - 1];
  if (!latest) return;
  elements.dateFrom.value = latest;
  elements.dateTo.value = latest;
}

function normalizeNheRows(rows) {
  return (rows || []).map((row) => ({
    os: firstValue(row, ['os', 'numero_os', 'ordem_servico', 'o_s']),
    data: firstValue(row, ['data', 'data_referencia', 'data_os', 'dt_referencia']),
    supervisao: firstValue(row, ['supervisao', 'coordenacao', 'regional']),
    cliente: firstValue(row, ['cliente', 'cliente_nacional', 'cliente_regional', 'cliente_final']),
    cidade_embarque: firstValue(row, ['cidade_embarque', 'cidade', 'cidade_origem', 'local_embarque']),
    classificador: firstValue(row, ['classificador', 'funcionario', 'colaborador', 'nome']),
    motivo: firstValue(row, ['motivo', 'observacao', 'status', 'situacao']),
  })).filter((row) => clean(row.os) && isoDate(row.data));
}

function buildVolumeReport(elements) {
  const minimum = Math.max(0, numberValue(elements.minimumLoads.value));
  const from = elements.dateFrom.value || null;
  const to = elements.dateTo.value || null;
  const groups = new Map();

  state.sourceRows.forEach((row) => {
    const date = isoDate(row.data);
    if (from && (!date || date < from)) return;
    if (to && (!date || date > to)) return;

    const coordenacao = clean(row.coordenacao);
    const local = clean(row.local_embarque);
    const funcionario = clean(row.funcionario);
    const os = clean(row.os);
    if (!coordenacao || !local || !funcionario || !os) return;

    const key = [coordenacao, local, funcionario, os].map(norm).join('|');
    if (!groups.has(key)) {
      groups.set(key, { coordenacao, local, os, funcionario, cargas: 0, toneladas: 0 });
    }
    const item = groups.get(key);
    item.cargas += numberValue(row.cargas);
    item.toneladas += numberValue(row.toneladas ?? row.tons);
  });

  const rows = Array.from(groups.values())
    .filter((row) => row.cargas >= minimum)
    .sort((a, b) => b.cargas - a.cargas || PT.compare(a.coordenacao, b.coordenacao))
    .map((row, index) => [
      index + 1,
      row.coordenacao,
      row.local,
      row.os,
      row.funcionario,
      row.cargas,
      row.toneladas,
    ]);

  state.reportHeaders = ['#', 'Coordenação', 'Local de Embarque', 'O.S.', 'Funcionário', 'Cargas', 'Toneladas'];
  state.reportRows = rows;
  state.sort = { index: 5, direction: 'desc' };
}

function buildNheReport(elements) {
  const minimumSequence = Math.max(2, Math.min(31, Number(elements.recentDays.value) || 3));
  const dates = Array.from(new Set(state.sourceRows.map((row) => isoDate(row.data)).filter(Boolean)))
    .sort()
    .reverse();
  const dateIndexes = new Map(dates.map((date, index) => [date, index]));
  const groups = new Map();

  state.sourceRows.forEach((row) => {
    const os = clean(row.os);
    const date = isoDate(row.data);
    if (!os || !date || !dateIndexes.has(date)) return;
    if (!groups.has(os)) groups.set(os, { rowsByDate: new Map(), dates: new Set() });
    const info = groups.get(os);
    info.dates.add(date);
    if (!info.rowsByDate.has(date)) info.rowsByDate.set(date, row);
  });

  const rows = [];
  groups.forEach((info, os) => {
    const positions = Array.from(info.dates)
      .map((date) => dateIndexes.get(date))
      .sort((a, b) => a - b);
    const sequences = [];
    let current = [];

    positions.forEach((position) => {
      const previous = current[current.length - 1];
      if (!current.length || position === previous + 1) {
        current.push(position);
      } else {
        sequences.push(current);
        current = [position];
      }
    });
    if (current.length) sequences.push(current);

    const qualifying = sequences
      .filter((sequence) => sequence.length >= minimumSequence)
      .sort((a, b) => b.length - a.length || a[0] - b[0]);
    if (!qualifying.length) return;

    const sequence = qualifying[0];
    const sequenceDates = sequence.map((index) => dates[index]);
    const row = info.rowsByDate.get(sequenceDates[0]);
    rows.push([
      row.supervisao,
      os,
      row.cliente,
      row.cidade_embarque,
      row.classificador,
      row.motivo,
      sequence.length,
      `${formatDate(sequenceDates[sequenceDates.length - 1])} a ${formatDate(sequenceDates[0])}`,
    ]);
  });

  rows.sort((a, b) => Number(b[6]) - Number(a[6]) || PT.compare(a[0], b[0]));
  state.reportHeaders = ['Supervisão', 'O.S.', 'Cliente', 'Cidade de Embarque', 'Classificador', 'Motivo', 'Dias sem embarque', 'Período'];
  state.reportRows = rows;
  state.sort = { index: 6, direction: 'desc' };
}

function sortedReportRows() {
  const factor = state.sort.direction === 'asc' ? 1 : -1;
  return [...state.reportRows].sort((a, b) => {
    const av = a[state.sort.index];
    const bv = b[state.sort.index];
    const an = Number(av);
    const bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * factor;
    return PT.compare(String(av ?? ''), String(bv ?? '')) * factor;
  });
}

function reportTitle(elements) {
  if (state.mode === 'volume') {
    const from = elements.dateFrom.value ? formatDate(elements.dateFrom.value) : '';
    const to = elements.dateTo.value ? formatDate(elements.dateTo.value) : '';
    const period = from && to ? (from === to ? from : `${from} a ${to}`) : '';
    return `Volume de Embarques${period ? ` - ${period}` : ''}`;
  }
  return 'Sequência de NHE';
}

function renderReport(elements) {
  const rows = sortedReportRows();
  const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
  elements.reportCount.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;
  elements.downloadAll.disabled = !rows.length || state.busy;
  elements.reportPages.innerHTML = '';

  if (!rows.length) {
    elements.reportPages.innerHTML = '<div class="li-empty">Nenhum registro atende aos critérios informados.</div>';
    return;
  }

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * ROWS_PER_PAGE, (pageIndex + 1) * ROWS_PER_PAGE);
    const section = document.createElement('section');
    section.className = 'li-report-page';
    section.id = `li-report-page-${pageIndex}`;
    section.innerHTML = `
      <div class="li-report-head">
        <div>
          <h3>${esc(reportTitle(elements))}</h3>
          <p>${esc(state.sourceLabel)}</p>
        </div>
        <span>Página ${pageIndex + 1} de ${totalPages}</span>
      </div>
      <div class="li-report-table-wrap">
        <table class="li-report-table">
          <thead><tr>${state.reportHeaders.map((header, index) => {
            const active = state.sort.index === index;
            const arrow = active ? (state.sort.direction === 'asc' ? '↑' : '↓') : '↕';
            return `<th><button type="button" data-report-sort="${index}">${esc(header)} <span>${arrow}</span></button></th>`;
          }).join('')}</tr></thead>
          <tbody>${pageRows.map((row) => `<tr>${row.map((cell, index) => {
            const value = typeof cell === 'number' && index >= state.reportHeaders.length - 2
              ? NUMBER.format(cell)
              : cell;
            return `<td>${esc(value)}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="li-page-actions" data-html2canvas-ignore>
        <button class="btn btn-secondary" type="button" data-download-page="${pageIndex}">Baixar PNG desta página</button>
      </div>`;
    elements.reportPages.appendChild(section);
  }
}

async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PNG.'));
    document.head.appendChild(script);
  });
  return window.html2canvas;
}

function slugify(value) {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function downloadPage(pageIndex, elements) {
  const page = document.getElementById(`li-report-page-${pageIndex}`);
  if (!page) return;
  const html2canvas = await ensureHtml2Canvas();
  const canvas = await html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });
  const link = document.createElement('a');
  link.download = `${slugify(reportTitle(elements))}_pag_${pageIndex + 1}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadAll(elements) {
  const totalPages = document.querySelectorAll('.li-report-page').length;
  if (!totalPages || state.busy) return;
  state.busy = true;
  elements.downloadAll.disabled = true;
  elements.downloadAll.textContent = 'Gerando páginas...';
  try {
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      elements.downloadAll.textContent = `Gerando ${pageIndex + 1}/${totalPages}...`;
      await downloadPage(pageIndex, elements);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  } catch (error) {
    elements.feedback.textContent = error.message || 'Falha ao gerar os arquivos PNG.';
    elements.feedback.classList.add('is-error');
  } finally {
    state.busy = false;
    elements.downloadAll.disabled = false;
    elements.downloadAll.textContent = 'Baixar PNG de todas as páginas';
  }
}

function rebuildReport(elements, feedbackMessage = '') {
  if (state.mode === 'volume') buildVolumeReport(elements);
  else buildNheReport(elements);
  renderReport(elements);
  if (feedbackMessage) setFeedback(elements, feedbackMessage);
}

async function loadVolumeFromDatabase(elements) {
  setBusy(elements, true, 'Carregando dados automáticos do Resultado Diário...');
  try {
    const rows = await loadAll(
      'relatorio_resultado_diario',
      'os,data,funcionario,coordenacao,supervisao,local_embarque,cargas,toneladas',
      'data'
    );
    state.sourceRows = rows;
    state.sourceKind = 'auto';
    state.sourceLabel = `Resultado Diário sincronizado no painel/Supabase (${rows.length} linhas)`;
    setLatestDateRange(rows, elements);
    rebuildReport(elements, `Pré-visualização automática atualizada com ${rows.length} linhas do Resultado Diário.`);
  } catch (error) {
    setFeedback(elements, `Não foi possível carregar o Resultado Diário automático: ${error.message}`, true);
  } finally {
    setBusy(elements, false);
  }
}

async function loadNheFromDatabase(elements) {
  setBusy(elements, true, 'Carregando dados automáticos para Sequência de NHE...');
  try {
    const rows = await loadAll('relatorio_resultado_diario', '*', 'data');
    state.sourceRows = normalizeNheRows(rows);
    state.sourceKind = 'auto';
    state.sourceLabel = `Resultado Diário sincronizado no painel/Supabase (${state.sourceRows.length} linhas analisáveis)`;
    rebuildReport(elements, `Pré-visualização automática atualizada com dados sincronizados do painel.`);
  } catch (error) {
    setFeedback(elements, `Não foi possível carregar a base automática para NHE: ${error.message}`, true);
  } finally {
    setBusy(elements, false);
  }
}

async function loadAutomaticSource(elements) {
  if (state.mode === 'volume') return loadVolumeFromDatabase(elements);
  return loadNheFromDatabase(elements);
}

async function handleFile(file, elements) {
  if (!file) return;
  setBusy(elements, true, `Lendo ${file.name}...`);
  try {
    const workbook = await readWorkbook(file);
    if (state.mode === 'volume') {
      const rows = objectRowsFromWorkbook(workbook, [
        ['O.S.', 'OS'],
        ['Data'],
        ['Funcionário', 'Funcionario'],
        ['Cargas'],
      ]).map((row) => ({
        os: getByAliases(row, ['O.S.', 'O.S', 'OS']),
        data: getByAliases(row, ['Data']),
        funcionario: getByAliases(row, ['Funcionário', 'Funcionario']),
        coordenacao: getByAliases(row, ['Coordenação', 'Coordenacao']),
        supervisao: getByAliases(row, ['Supervisão', 'Supervisao']),
        local_embarque: getByAliases(row, ['Local de Embarque', 'Local Embarque']),
        cargas: getByAliases(row, ['Cargas', 'Carga']),
        toneladas: getByAliases(row, ['Toneladas', 'Tons']),
      }));
      if (!rows.length) throw new Error('Cabeçalhos esperados: O.S., Data, Funcionário e Cargas.');
      state.sourceRows = rows;
      state.sourceKind = 'manual';
      state.sourceLabel = `${file.name} (${rows.length} linhas) · fonte manual temporária`;
      setLatestDateRange(rows, elements);
      buildVolumeReport(elements);
    } else {
      const rows = objectRowsFromWorkbook(workbook, [
        ['O.S.', 'OS'],
        ['Data'],
        ['Supervisão', 'Supervisao'],
        ['Classificador'],
        ['Motivo'],
      ]).map((row) => ({
        os: getByAliases(row, ['O.S.', 'O.S', 'OS']),
        data: getByAliases(row, ['Data']),
        supervisao: getByAliases(row, ['Supervisão', 'Supervisao']),
        cliente: getByAliases(row, ['Cliente']),
        cidade_embarque: getByAliases(row, ['Cidade de Embarque']),
        classificador: getByAliases(row, ['Classificador']),
        motivo: getByAliases(row, ['Motivo']),
      }));
      if (!rows.length) throw new Error('Cabeçalhos esperados: O.S., Data, Supervisão, Classificador e Motivo.');
      state.sourceRows = rows;
      state.sourceKind = 'manual';
      state.sourceLabel = `${file.name} (${rows.length} linhas) · fonte manual temporária`;
      buildNheReport(elements);
    }
    renderReport(elements);
    setFeedback(elements, `Arquivo manual processado: ${state.sourceRows.length} linhas de ${file.name}.`);
  } catch (error) {
    setFeedback(elements, error.message || 'Falha ao processar a planilha.', true);
  } finally {
    setBusy(elements, false);
    elements.fileInput.value = '';
  }
}

function setFeedback(elements, message, error = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', error);
}

function setBusy(elements, busy, message = '') {
  state.busy = busy;
  elements.generate.disabled = busy;
  elements.databaseButton.disabled = busy;
  elements.fileButton.disabled = busy;
  elements.modeButtons.forEach((button) => { button.disabled = busy; });
  elements.downloadAll.disabled = busy || !state.reportRows.length;
  if (message) setFeedback(elements, message);
}

function renderMode(elements) {
  const volume = state.mode === 'volume';
  elements.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === state.mode));
  elements.volumeControls.hidden = !volume;
  elements.nheControls.hidden = volume;
  elements.databaseButton.textContent = volume
    ? 'Recarregar Resultado Diário'
    : 'Recarregar dados automáticos';
  elements.fileButton.textContent = volume
    ? 'Importar Resultado Diário manual'
    : 'Importar relatório NHE manual';
  elements.fileHint.textContent = volume
    ? 'Fonte principal: Resultado Diário sincronizado no painel/Supabase. Use XLSX apenas como contingência.'
    : 'Fonte principal: dados sincronizados do painel/Supabase. Use XLSX apenas para reprocessamento manual.';
  elements.fileInput.accept = '.xlsx,.xls';
  state.sourceRows = [];
  state.reportRows = [];
  state.reportHeaders = [];
  state.sourceLabel = '';
  state.sourceKind = 'auto';
  elements.reportPages.innerHTML = '<div class="li-empty">Carregando dados automáticos do painel/Supabase...</div>';
  elements.reportCount.textContent = '0 registros';
  elements.downloadAll.disabled = true;
  setFeedback(elements, 'Os dados são carregados automaticamente do painel/Supabase. Upload manual fica disponível como contingência.');
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .li-shell{color:#e2e2f0}.li-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.li-head h2{margin:0;color:#f8fafc;font-size:24px}.li-head p{margin:6px 0 0;color:#94a3b8;font-size:13px}
    .li-mode{display:flex;gap:8px;flex-wrap:wrap}.li-mode button{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.7);color:#cbd5e1;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}.li-mode button.active{background:#16a34a;color:#052e16;border-color:#22c55e}
    .li-source{border-top:1px solid rgba(148,163,184,.14);padding-top:16px}.li-source-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.li-file-hint{color:#94a3b8;font-size:12px}.li-auto-source{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.22);border-radius:999px;padding:7px 10px;background:rgba(22,101,52,.16);color:#bbf7d0;font-size:12px;font-weight:800}
    .li-controls{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;margin-top:14px}.li-controls[hidden],.li-field[hidden]{display:none!important}.li-field label{display:block;margin-bottom:5px;color:#bbf7d0;font-size:11px;font-weight:800;text-transform:uppercase}.li-field input{width:100%;box-sizing:border-box;min-height:40px;border-radius:10px;border:1px solid rgba(148,163,184,.2);background:#0d0d18;color:#e2e2f0;padding:8px 10px}
    .li-actions{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:14px}.li-feedback{margin-top:12px;color:#86efac;font-size:12px}.li-feedback.is-error{color:#fca5a5}
    .li-report-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.li-report-toolbar h3{margin:0;color:#f8fafc}.li-report-pages{display:grid;gap:20px}.li-empty{padding:28px;text-align:center;border:1px dashed rgba(148,163,184,.2);border-radius:14px;color:#94a3b8}
    .li-report-page{background:#fff;color:#111827;border-radius:8px;padding:16px;overflow:hidden}.li-report-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}.li-report-head h3{margin:0;font-size:16px;color:#111827}.li-report-head p{margin:4px 0 0;color:#4b5563;font-size:10px}.li-report-head>span{font-size:10px;color:#6b7280;white-space:nowrap}
    .li-report-table-wrap{overflow:auto}.li-report-table{width:100%;border-collapse:collapse;font-size:10px}.li-report-table th,.li-report-table td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top;max-width:230px;word-break:break-word}.li-report-table th{background:#b6d7a8}.li-report-table th button{width:100%;padding:0;border:0;background:transparent;color:#111827;font:inherit;font-weight:800;text-align:left;cursor:pointer;display:flex;justify-content:space-between;gap:6px}.li-report-table tbody tr:nth-child(odd){background:#f8fafc}.li-page-actions{margin-top:10px;text-align:right}
    @media(max-width:800px){.li-head,.li-report-toolbar{flex-direction:column}.li-controls{grid-template-columns:1fr 1fr}.li-report-page{padding:10px}.li-report-table{min-width:900px}}
    @media(max-width:520px){.li-controls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Informativos - Logistica', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card li-shell">
      <div class="li-head">
        <div><h2>Informativos</h2><p>Gere relatórios operacionais paginados a partir dos dados sincronizados automaticamente no painel/Supabase.</p></div>
        <div class="li-mode">
          <button type="button" class="active" data-mode="volume">Volume de Embarques</button>
          <button type="button" data-mode="nhe">Sequência de NHE</button>
        </div>
      </div>
      <div class="li-source">
        <div class="li-source-row">
          <span class="li-auto-source">Fonte automática: painel/Supabase</span>
          <button class="btn btn-secondary" type="button" id="liLoadDatabase">Recarregar Resultado Diário</button>
          <button class="btn btn-secondary" type="button" id="liFileButton">Importar Resultado Diário manual</button>
          <input type="file" id="liFileInput" accept=".xlsx,.xls" hidden />
          <span class="li-file-hint" id="liFileHint"></span>
        </div>
        <div class="li-controls" id="liVolumeControls">
          <div class="li-field"><label>Data inicial</label><input type="date" id="liDateFrom" /></div>
          <div class="li-field"><label>Data final</label><input type="date" id="liDateTo" /></div>
          <div class="li-field"><label>Mínimo de cargas</label><input type="number" id="liMinimumLoads" min="0" step="1" value="9" /></div>
        </div>
        <div class="li-controls" id="liNheControls" hidden>
          <div class="li-field"><label>Contagem de dias</label><input type="number" id="liRecentDays" min="2" max="31" value="3" /></div>
        </div>
        <div class="li-actions">
          <button class="btn" type="button" id="liGenerate">Atualizar pré-visualização</button>
        </div>
        <div class="li-feedback" id="liFeedback"></div>
      </div>
    </section>
    <section class="card mt-16 li-shell">
      <div class="li-report-toolbar">
        <div><h3>Pré-visualização</h3><span class="badge" id="liReportCount">0 registros</span></div>
        <button class="btn btn-secondary" type="button" id="liDownloadAll" disabled>Baixar PNG de todas as páginas</button>
      </div>
      <div class="li-report-pages" id="liReportPages"></div>
    </section>`;

  const elements = {
    modeButtons: Array.from(content.querySelectorAll('[data-mode]')),
    databaseButton: content.querySelector('#liLoadDatabase'),
    fileButton: content.querySelector('#liFileButton'),
    fileInput: content.querySelector('#liFileInput'),
    fileHint: content.querySelector('#liFileHint'),
    volumeControls: content.querySelector('#liVolumeControls'),
    nheControls: content.querySelector('#liNheControls'),
    dateFrom: content.querySelector('#liDateFrom'),
    dateTo: content.querySelector('#liDateTo'),
    minimumLoads: content.querySelector('#liMinimumLoads'),
    recentDays: content.querySelector('#liRecentDays'),
    generate: content.querySelector('#liGenerate'),
    feedback: content.querySelector('#liFeedback'),
    reportCount: content.querySelector('#liReportCount'),
    reportPages: content.querySelector('#liReportPages'),
    downloadAll: content.querySelector('#liDownloadAll'),
  };

  elements.modeButtons.forEach((button) => button.addEventListener('click', async () => {
    if (state.busy || state.mode === button.dataset.mode) return;
    state.mode = button.dataset.mode;
    renderMode(elements);
    await loadAutomaticSource(elements);
  }));
  elements.databaseButton.addEventListener('click', () => loadAutomaticSource(elements));
  elements.fileButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', () => handleFile(elements.fileInput.files?.[0], elements));
  [elements.dateFrom, elements.dateTo, elements.minimumLoads, elements.recentDays].forEach((input) => {
    input.addEventListener('change', () => {
      if (!state.sourceRows.length || state.busy) return;
      rebuildReport(elements, 'Pré-visualização atualizada pelos filtros.');
    });
    input.addEventListener('input', () => {
      if (!state.sourceRows.length || state.busy || input.type === 'date') return;
      rebuildReport(elements, 'Pré-visualização atualizada pelos filtros.');
    });
  });
  elements.generate.addEventListener('click', async () => {
    if (!state.sourceRows.length) {
      await loadAutomaticSource(elements);
      return;
    }
    rebuildReport(elements, 'Pré-visualização atualizada manualmente.');
  });
  elements.downloadAll.addEventListener('click', () => downloadAll(elements));
  elements.reportPages.addEventListener('click', (event) => {
    const download = event.target.closest('[data-download-page]');
    if (download) {
      downloadPage(Number(download.dataset.downloadPage), elements)
        .catch((error) => setFeedback(elements, error.message, true));
      return;
    }
    const sort = event.target.closest('[data-report-sort]');
    if (!sort) return;
    const index = Number(sort.dataset.reportSort);
    state.sort = {
      index,
      direction: state.sort.index === index && state.sort.direction === 'asc' ? 'desc' : 'asc',
    };
    renderReport(elements);
  });

  renderMode(elements);
  await loadAutomaticSource(elements);
});