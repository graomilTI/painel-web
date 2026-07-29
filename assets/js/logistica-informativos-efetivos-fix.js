import { supabase } from './supabaseClient.js';

const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const ROWS_PER_PAGE = 20;
let applying = false;
let scheduled = false;
let historyCache = null;
let historyCacheAt = 0;
let productionCache = null;
let productionCacheKey = '';
let productionCacheAt = 0;

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

async function fetchProductionRange(from, to, maxRows = 50000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from('producao_snapshot')
      .select('funcionario,data,cargas,tons')
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: true })
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

async function loadProductionNames(from, to) {
  const cacheKey = `${from}|${to}`;
  const now = Date.now();
  if (productionCache && productionCacheKey === cacheKey && now - productionCacheAt < 60_000) {
    return productionCache;
  }

  const rows = await fetchProductionRange(from, to);
  productionCache = new Set(
    rows
      .filter((row) => numberValue(row.cargas) > 0 || numberValue(row.tons) > 0)
      .map((row) => norm(row.funcionario))
      .filter(Boolean),
  );
  productionCacheKey = cacheKey;
  productionCacheAt = now;
  return productionCache;
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

function updateValidationText(reportPages, inactiveCount, productionCount) {
  reportPages.querySelectorAll('.li-report-head p').forEach((paragraph) => {
    const base = clean(paragraph.textContent).replace(/\s*·\s*Validação da base:.*$/i, '');
    paragraph.textContent = `${base} · Validação da base: ${inactiveCount} não ativo${inactiveCount === 1 ? '' : 's'} removido${inactiveCount === 1 ? '' : 's'} pelo histórico dos relatórios de colaboradores; ${productionCount} com carga${productionCount === 1 ? '' : 's'} registrada${productionCount === 1 ? '' : 's'} na Produção Diária removido${productionCount === 1 ? '' : 's'}.`;
  });
}

async function applyEffectiveFix() {
  if (applying || !effectiveModeActive()) return;
  const reportPages = document.getElementById('liReportPages');
  const reportCount = document.getElementById('liReportCount');
  const feedback = document.getElementById('liFeedback');
  const reportFrom = document.getElementById('liEfetivosDateFrom')?.value;
  const reportTo = document.getElementById('liEfetivosDateTo')?.value;
  if (!reportPages || !reportCount || !reportFrom || !reportTo) return;

  const currentRows = collectReportRows(reportPages);
  if (!currentRows.length) return;

  applying = true;
  try {
    const [historyResult, productionResult] = await Promise.allSettled([
      loadStatusHistory(),
      loadProductionNames(reportFrom, reportTo),
    ]);

    if (historyResult.status === 'rejected' && productionResult.status === 'rejected') {
      throw new Error(`Histórico: ${historyResult.reason?.message || historyResult.reason}; Produção Diária: ${productionResult.reason?.message || productionResult.reason}`);
    }

    const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const productionNames = productionResult.status === 'fulfilled' ? productionResult.value : new Set();
    const statusByName = latestStatusByNameAtDate(history, reportFrom);
    const removedInactive = [];
    const removedProduction = [];

    const filtered = currentRows.filter(({ cells }) => {
      const nameKey = norm(cells[0]);
      const status = statusByName.get(nameKey);
      if (status && status.ativo_novo === false) {
        removedInactive.push({
          name: cells[0],
          status: status.situacao_nova,
          effectiveDate: status.data_efetiva,
          source: status.fonte,
        });
        return false;
      }
      if (productionNames.has(nameKey)) {
        removedProduction.push(cells[0]);
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
      reportPages.innerHTML = '<div class="li-empty">Todos os efetivos ativos aparecem no relatório de cargas, na Produção Diária ou estavam não ativos/indisponíveis no período.</div>';
    } else {
      distributeRows(reportPages, filtered);
      forceSupervisionIndicator(reportPages);
      updateValidationText(reportPages, removedInactive.length, removedProduction.length);
    }
    reportCount.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;

    if (feedback) {
      const warnings = [];
      if (historyResult.status === 'rejected') warnings.push('histórico de colaboradores indisponível');
      if (productionResult.status === 'rejected') warnings.push('Produção Diária indisponível');
      const warningText = warnings.length ? ` Atenção: ${warnings.join(' e ')}.` : '';
      feedback.textContent = `Conferência concluída: ${filtered.length} efetivo(s) sem cargas; ${removedProduction.length} com carga(s) na Produção Diária e ${removedInactive.length} não ativo(s) removido(s).${warningText}`;
    }
    if (removedInactive.length) console.info('[informativos/efetivos] não ativos removidos pelo histórico', removedInactive);
    if (removedProduction.length) console.info('[informativos/efetivos] colaboradores removidos por carga na Produção Diária', removedProduction);
  } catch (error) {
    console.warn('[informativos/efetivos] validações complementares indisponíveis', error);
    const rows = collectReportRows(reportPages).sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));
    distributeRows(reportPages, rows);
    forceSupervisionIndicator(reportPages);
    if (feedback) {
      feedback.textContent = `A ordenação foi aplicada, mas as validações complementares não puderam ser consultadas: ${error.message || error}`;
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
      productionCache = null;
      productionCacheKey = '';
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
