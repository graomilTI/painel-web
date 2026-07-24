import { supabase } from './supabaseClient.js';

const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const ROWS_PER_PAGE = 20;
let applying = false;
let scheduled = false;
let historyCache = null;
let historyCacheAt = 0;

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

async function fetchAll(table, select, maxRows = 50000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadStatusHistory() {
  const now = Date.now();
  if (historyCache && now - historyCacheAt < 60_000) return historyCache;
  historyCache = await fetchAll(
    'colaboradores_status_historico',
    'cpf,nome,situacao_nova,ativo_novo,data_efetiva,detectado_em,fonte',
  );
  historyCacheAt = now;
  return historyCache;
}

function latestStatusByNameAtDate(history, referenceDate) {
  const result = new Map();
  history.forEach((row) => {
    const nameKey = norm(row.nome);
    const effectiveDate = clean(row.data_efetiva).slice(0, 10);
    if (!nameKey || !effectiveDate || effectiveDate > referenceDate) return;

    const previous = result.get(nameKey);
    const rowKey = `${effectiveDate}|${row.detectado_em || ''}`;
    const previousKey = previous
      ? `${previous.data_efetiva || ''}|${previous.detectado_em || ''}`
      : '';
    if (!previous || rowKey > previousKey) result.set(nameKey, row);
  });
  return result;
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

function updateValidationText(reportPages, removedCount) {
  reportPages.querySelectorAll('.li-report-head p').forEach((paragraph) => {
    const base = clean(paragraph.textContent).replace(/\s*·\s*Validação da base:.*$/i, '');
    paragraph.textContent = `${base} · Validação da base: ${removedCount} não ativo${removedCount === 1 ? '' : 's'} removido${removedCount === 1 ? '' : 's'} pelo histórico dos relatórios de colaboradores.`;
  });
}

async function applyEffectiveFix() {
  if (applying || !effectiveModeActive()) return;
  const reportPages = document.getElementById('liReportPages');
  const reportCount = document.getElementById('liReportCount');
  const feedback = document.getElementById('liFeedback');
  const reportFrom = document.getElementById('liEfetivosDateFrom')?.value;
  if (!reportPages || !reportCount || !reportFrom) return;

  const currentRows = collectReportRows(reportPages);
  if (!currentRows.length) return;

  applying = true;
  try {
    const history = await loadStatusHistory();
    const statusByName = latestStatusByNameAtDate(history, reportFrom);
    const removed = [];

    const filtered = currentRows.filter(({ cells }) => {
      const status = statusByName.get(norm(cells[0]));
      if (status && status.ativo_novo === false) {
        removed.push({
          name: cells[0],
          status: status.situacao_nova,
          effectiveDate: status.data_efetiva,
          source: status.fonte,
        });
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));

    if (!filtered.length) {
      reportPages.innerHTML = '<div class="li-empty">Todos os efetivos ativos aparecem no relatório de cargas ou estavam não ativos/indisponíveis no período.</div>';
    } else {
      distributeRows(reportPages, filtered);
      forceSupervisionIndicator(reportPages);
      updateValidationText(reportPages, removed.length);
    }
    reportCount.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;

    if (feedback) {
      feedback.textContent = `Conferência concluída: ${filtered.length} efetivo(s) sem cargas; ${removed.length} não ativo(s) removido(s) conforme a mudança registrada entre relatórios de colaboradores.`;
    }
    if (removed.length) console.info('[informativos/efetivos] não ativos removidos pelo histórico', removed);
  } catch (error) {
    console.warn('[informativos/efetivos] histórico de situação indisponível', error);
    const rows = collectReportRows(reportPages).sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));
    distributeRows(reportPages, rows);
    forceSupervisionIndicator(reportPages);
    if (feedback) {
      feedback.textContent = `A ordenação foi aplicada, mas o histórico dos relatórios de colaboradores não pôde ser consultado: ${error.message || error}`;
    }
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
  if (reportPages.dataset.efetivosHistoryFix === 'true') return true;
  reportPages.dataset.efetivosHistoryFix = 'true';

  new MutationObserver(scheduleApply).observe(reportPages, { childList: true, subtree: true });
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#liEfetivosDateFrom, #liEfetivosDateTo')) {
      historyCache = null;
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
