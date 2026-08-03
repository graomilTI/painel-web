// Filtros rápidos da aba Gestor > Logística > Atualizar.
// O módulo é carregado globalmente pelo pageInit, mas só atua nesta rota/aba.

const FILTER_BAR_ID = 'atzSaldoFilterBar';
const EMPTY_ROW_ATTR = 'data-atz-saldo-empty';
const activeFilters = new Set();
let scheduled = false;

function currentRoute() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || '';
}

function isAtualizarTab() {
  return currentRoute() === 'logistica' && window.location.hash.replace('#', '') === 'atualizar';
}

function parseSaldo(row) {
  const cell = row.querySelector('td[data-label="Remanescente"]') || row.cells?.[2];
  const text = cell?.querySelector('.log-chip')?.textContent || cell?.textContent || '';
  const normalized = String(text)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function syncButtonState(bar) {
  bar.querySelectorAll('[data-atz-saldo-filter]').forEach((button) => {
    const type = button.dataset.atzSaldoFilter;
    const active = activeFilters.has(type);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function applyFilters() {
  const reloadButton = document.getElementById('atualizarReload');
  const section = reloadButton?.closest('section.card');
  const tbody = section?.querySelector('.log-table tbody');
  if (!tbody) return;

  const rows = [...tbody.querySelectorAll('tr[data-os-row]')];
  const filtering = activeFilters.size > 0;
  let visible = 0;

  rows.forEach((row) => {
    const saldo = parseSaldo(row);
    const matchesZero = activeFilters.has('zero') && saldo === 0;
    const matchesNegative = activeFilters.has('negative') && saldo !== null && saldo < 0;
    const show = !filtering || matchesZero || matchesNegative;
    row.hidden = !show;
    if (show) visible += 1;
  });

  let emptyRow = tbody.querySelector(`tr[${EMPTY_ROW_ATTR}]`);
  if (filtering && rows.length > 0 && visible === 0) {
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.setAttribute(EMPTY_ROW_ATTR, '');
      emptyRow.innerHTML = '<td class="log-empty" colspan="4" style="text-align:center;padding:24px">Nenhuma O.S. encontrada para o filtro de saldo selecionado.</td>';
      tbody.appendChild(emptyRow);
    }
    emptyRow.hidden = false;
  } else if (emptyRow) {
    emptyRow.remove();
  }
}

function ensureFilterBar() {
  if (!isAtualizarTab()) return;

  const reloadButton = document.getElementById('atualizarReload');
  const header = reloadButton?.parentElement;
  if (!reloadButton || !header) return;

  let bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = FILTER_BAR_ID;
    bar.className = 'atz-saldo-filter-bar';
    bar.setAttribute('aria-label', 'Filtros por saldo remanescente');
    bar.innerHTML = `
      <button type="button" class="atz-saldo-filter-btn zero" data-atz-saldo-filter="zero" aria-pressed="false">Saldo Zerado</button>
      <button type="button" class="atz-saldo-filter-btn negative" data-atz-saldo-filter="negative" aria-pressed="false">Saldo Negativo</button>
    `;
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-atz-saldo-filter]');
      if (!button) return;
      const type = button.dataset.atzSaldoFilter;
      if (activeFilters.has(type)) activeFilters.delete(type);
      else activeFilters.add(type);
      syncButtonState(bar);
      applyFilters();
    });
    header.insertBefore(bar, reloadButton);
  }

  syncButtonState(bar);
  applyFilters();
}

function scheduleEnsure() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    ensureFilterBar();
  });
}

function injectStyles() {
  if (document.getElementById('atz-saldo-filter-styles')) return;
  const style = document.createElement('style');
  style.id = 'atz-saldo-filter-styles';
  style.textContent = `
    .atz-saldo-filter-bar{display:flex;align-items:center;gap:8px;margin-left:auto}
    .atz-saldo-filter-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.62);color:#8fa1b5;border-radius:10px;padding:8px 13px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s,box-shadow .15s}
    .atz-saldo-filter-btn:hover{background:rgba(22,101,52,.18);color:#dcfce7}
    .atz-saldo-filter-btn.zero.active{background:rgba(250,204,21,.16);border-color:rgba(250,204,21,.48);color:#fde68a;box-shadow:0 0 0 2px rgba(250,204,21,.08)}
    .atz-saldo-filter-btn.negative.active{background:rgba(239,68,68,.16);border-color:rgba(248,113,113,.48);color:#fecaca;box-shadow:0 0 0 2px rgba(239,68,68,.08)}
    @media(max-width:760px){.atz-saldo-filter-bar{order:3;width:100%;margin-left:0;flex-wrap:wrap}.atz-saldo-filter-btn{flex:1}}
  `;
  document.head.appendChild(style);
}

injectStyles();

const observer = new MutationObserver(scheduleEnsure);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleEnsure);
window.addEventListener('popstate', scheduleEnsure);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnsure, { once: true });
else scheduleEnsure();
