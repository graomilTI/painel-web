import { supabase } from './supabaseClient.js';

const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const ROWS_PER_PAGE = 20;
let applying = false;
let scheduled = false;
let collaboratorsCache = null;
let collaboratorsCacheAt = 0;

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isoDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (!br) return '';
  const year = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
}

function timestamp(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordMoment(row) {
  return Math.max(
    timestamp(row.updated_at),
    timestamp(row.created_at),
    timestamp(row.desligamento),
    timestamp(row.data_desligamento),
    timestamp(row.admissao),
    timestamp(row.data_admissao),
  );
}

function isInactiveRecord(row, reportFrom) {
  const dismissal = isoDate(row.desligamento || row.data_desligamento);
  if (dismissal && dismissal < reportFrom) return true;
  if (row.ativo === false) return true;
  const status = norm(row.situacao || row.status);
  return ['INATIV', 'DESLIGAD', 'DEMITID'].some((term) => status.includes(term));
}

async function fetchCollaborators() {
  const now = Date.now();
  if (collaboratorsCache && now - collaboratorsCacheAt < 60_000) return collaboratorsCache;

  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 15000; offset += pageSize) {
    const { data, error } = await supabase
      .from('colaboradores_atuais')
      .select('id,nome,cpf,situacao,status,ativo,admissao,data_admissao,desligamento,data_desligamento,created_at,updated_at')
      .order('nome', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  collaboratorsCache = rows;
  collaboratorsCacheAt = now;
  return rows;
}

function latestRecordByName(rows) {
  const latest = new Map();
  rows.forEach((row) => {
    const key = norm(row.nome);
    if (!key) return;
    const previous = latest.get(key);
    if (!previous || recordMoment(row) >= recordMoment(previous)) latest.set(key, row);
  });
  return latest;
}

function effectiveModeActive() {
  return Boolean(document.querySelector('[data-efetivos-mode="true"].active'));
}

function collectReportRows(reportPages) {
  return Array.from(reportPages.querySelectorAll('.li-report-page .li-report-table tbody tr'))
    .map((tr) => ({
      tr,
      cells: Array.from(tr.cells).map((cell) => clean(cell.textContent)),
    }))
    .filter((item) => item.cells.length >= 3);
}

function distributeRows(reportPages, rows) {
  const sections = Array.from(reportPages.querySelectorAll('.li-report-page'));
  if (!sections.length) return;

  const neededPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  sections.forEach((section, index) => {
    const tbody = section.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.slice(index * ROWS_PER_PAGE, (index + 1) * ROWS_PER_PAGE)
      .forEach((item) => tbody.appendChild(item.tr));
    const pageLabel = section.querySelector('.li-report-head > span');
    if (pageLabel) pageLabel.textContent = `Página ${index + 1} de ${neededPages}`;
    section.hidden = index >= neededPages;
  });

  sections.slice(neededPages).forEach((section) => section.remove());
}

function forceSupervisionIndicator(reportPages) {
  reportPages.querySelectorAll('[data-efetivos-sort]').forEach((button) => {
    const index = Number(button.dataset.efetivosSort);
    const span = button.querySelector('span');
    if (span) span.textContent = index === 2 ? '↑' : '↕';
  });
}

async function applyEffectiveFix() {
  if (applying || !effectiveModeActive()) return;
  const reportPages = document.getElementById('liReportPages');
  const reportCount = document.getElementById('liReportCount');
  const reportFrom = document.getElementById('liEfetivosDateFrom')?.value;
  if (!reportPages || !reportCount || !reportFrom) return;

  const currentRows = collectReportRows(reportPages);
  if (!currentRows.length) return;

  applying = true;
  try {
    const collaborators = await fetchCollaborators();
    const latest = latestRecordByName(collaborators);

    const filtered = currentRows.filter(({ cells }) => {
      const record = latest.get(norm(cells[0]));
      return !record || !isInactiveRecord(record, reportFrom);
    });

    filtered.sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));

    distributeRows(reportPages, filtered);
    forceSupervisionIndicator(reportPages);
    reportCount.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
  } catch (error) {
    console.warn('[informativos/efetivos-fix] não foi possível validar desligamentos', error);
    const rows = collectReportRows(reportPages).sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));
    distributeRows(reportPages, rows);
    forceSupervisionIndicator(reportPages);
  } finally {
    window.setTimeout(() => { applying = false; }, 0);
  }
}

function scheduleApply() {
  if (applying || scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    applyEffectiveFix();
  }, 120);
}

function install() {
  const reportPages = document.getElementById('liReportPages');
  if (!reportPages) return false;
  if (reportPages.dataset.efetivosDismissalFix === 'true') return true;
  reportPages.dataset.efetivosDismissalFix = 'true';

  new MutationObserver(scheduleApply).observe(reportPages, { childList: true, subtree: true });
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#liEfetivosDateFrom, #liEfetivosDateTo')) {
      collaboratorsCache = null;
      scheduleApply();
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-efetivos-mode="true"], [data-efetivos-sort]')) scheduleApply();
  });
  scheduleApply();
  return true;
}

if (!install()) {
  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
