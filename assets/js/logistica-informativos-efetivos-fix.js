import { supabase } from './supabaseClient.js';

const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const ROWS_PER_PAGE = 20;
let applying = false;
let scheduled = false;
let databaseCache = null;
let databaseCacheAt = 0;

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
    timestamp(row.sincronizado_em),
    timestamp(row.updated_at),
    timestamp(row.created_at),
    timestamp(row.desligamento),
    timestamp(row.admissao),
  );
}

function maxIso(values) {
  return values.map(isoDate).filter(Boolean).sort().at(-1) || '';
}

function isInactiveStatus(value) {
  const status = norm(value);
  return ['INATIV', 'DESLIGAD', 'DEMITID', 'RESCINDID'].some((term) => status.includes(term));
}

async function fetchAll(table, select, orderColumn, maxRows = 15000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchDatabaseSources() {
  const now = Date.now();
  if (databaseCache && now - databaseCacheAt < 60_000) return databaseCache;

  const [collaborators, rescissions] = await Promise.all([
    fetchAll(
      'colaboradores',
      'id,nome,cpf,situacao,admissao,desligamento,sincronizado_em,created_at,updated_at',
      'nome',
      15000,
    ),
    fetchAll(
      'rh_rescisoes',
      'id,colaborador_id,colaborador_nome,data_desligamento,status,tipo,created_at,updated_at',
      'data_desligamento',
      5000,
    ).catch((error) => {
      console.warn('[informativos/efetivos] rh_rescisoes indisponível', error);
      return [];
    }),
  ]);

  databaseCache = { collaborators, rescissions };
  databaseCacheAt = now;
  return databaseCache;
}

function employmentStatusByName(collaborators, rescissions, reportFrom) {
  const collaboratorGroups = new Map();
  collaborators.forEach((row) => {
    const key = norm(row.nome);
    if (!key) return;
    if (!collaboratorGroups.has(key)) collaboratorGroups.set(key, []);
    collaboratorGroups.get(key).push(row);
  });

  const result = new Map();
  collaboratorGroups.forEach((records, key) => {
    const latestRow = [...records].sort((a, b) => recordMoment(b) - recordMoment(a))[0] || {};
    const latestAdmission = maxIso(records.map((row) => row.admissao));
    const latestDismissal = maxIso(records.map((row) => row.desligamento));
    const rehiredAfterDismissal = Boolean(latestAdmission && latestDismissal && latestAdmission > latestDismissal);
    const dismissedBeforePeriod = Boolean(latestDismissal && latestDismissal < reportFrom && !rehiredAfterDismissal);
    const inactiveByLatestStatus = isInactiveStatus(latestRow.situacao) && !rehiredAfterDismissal;

    result.set(key, {
      inactive: dismissedBeforePeriod || inactiveByLatestStatus,
      source: dismissedBeforePeriod || inactiveByLatestStatus ? 'colaboradores' : null,
      dismissal: latestDismissal,
      status: clean(latestRow.situacao),
      records: records.length,
    });
  });

  rescissions.forEach((row) => {
    const key = norm(row.colaborador_nome);
    const dismissal = isoDate(row.data_desligamento);
    const status = norm(row.status);
    const cancelled = status.includes('CANCEL');
    if (!key || !dismissal || cancelled || dismissal >= reportFrom) return;

    const current = result.get(key) || { inactive: false, source: null, dismissal: '', status: '', records: 0 };
    const collaboratorRecords = collaboratorGroups.get(key) || [];
    const latestAdmission = maxIso(collaboratorRecords.map((record) => record.admissao));
    const rehiredAfterRescission = Boolean(latestAdmission && latestAdmission > dismissal);
    if (rehiredAfterRescission) return;

    result.set(key, {
      ...current,
      inactive: true,
      source: 'rh_rescisoes',
      dismissal,
      status: clean(row.status) || 'rescisão registrada',
      rescissionId: row.id,
    });
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

function updateValidationText(reportPages, removed) {
  const byCollaborators = removed.filter((item) => item.source === 'colaboradores').length;
  const byRescissions = removed.filter((item) => item.source === 'rh_rescisoes').length;
  reportPages.querySelectorAll('.li-report-head p').forEach((paragraph) => {
    const base = clean(paragraph.textContent).replace(/\s*·\s*Validação da base:.*$/i, '');
    paragraph.textContent = `${base} · Validação da base: ${removed.length} desligado${removed.length === 1 ? '' : 's'} removido${removed.length === 1 ? '' : 's'} (${byCollaborators} em colaboradores; ${byRescissions} em Rescisões RH).`;
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
    const { collaborators, rescissions } = await fetchDatabaseSources();
    const statusByName = employmentStatusByName(collaborators, rescissions, reportFrom);
    const removed = [];

    const filtered = currentRows.filter(({ cells }) => {
      const status = statusByName.get(norm(cells[0]));
      if (status?.inactive) {
        removed.push({ name: cells[0], ...status });
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
      reportPages.innerHTML = '<div class="li-empty">Todos os efetivos ativos aparecem no relatório de cargas ou foram desconsiderados por indisponibilidade/desligamento no período.</div>';
    } else {
      distributeRows(reportPages, filtered);
      forceSupervisionIndicator(reportPages);
      updateValidationText(reportPages, removed);
    }
    reportCount.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;

    if (feedback && removed.length) {
      const rescissionCount = removed.filter((item) => item.source === 'rh_rescisoes').length;
      feedback.textContent = `Conferência concluída: ${filtered.length} efetivo(s) sem cargas; ${removed.length} desligado(s) removido(s), sendo ${rescissionCount} identificado(s) em RH > Rescisões.`;
    }
    if (removed.length) console.info('[informativos/efetivos] desligados removidos', removed);
  } catch (error) {
    console.warn('[informativos/efetivos-fix] não foi possível validar desligamentos', error);
    const rows = collectReportRows(reportPages).sort((a, b) => (
      PT.compare(a.cells[2] || '', b.cells[2] || '')
      || PT.compare(a.cells[1] || '', b.cells[1] || '')
      || PT.compare(a.cells[0] || '', b.cells[0] || '')
    ));
    distributeRows(reportPages, rows);
    forceSupervisionIndicator(reportPages);
    if (feedback) feedback.textContent = `A ordenação foi aplicada, mas a validação das tabelas colaboradores/rh_rescisoes falhou: ${error.message || error}`;
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
      databaseCache = null;
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
