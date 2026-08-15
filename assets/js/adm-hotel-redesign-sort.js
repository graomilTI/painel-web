const SORT_VERSION = '20260815-hoteis-sort1';

const sortState = new Map();
let observer = null;
let observerRoot = null;

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function tableKey(table) {
  const panel = table.closest('.hosp-rd-panel');
  if (panel?.id) return panel.id;
  return [...document.querySelectorAll('#hospRedesignRoot .hosp-rd-panel .hosp-rd-table')].indexOf(table).toString();
}

function headerLabel(th) {
  return th.dataset.hospSortLabel || normalize(th.textContent);
}

function isActionHeader(label) {
  return /^(OP(C|Ç)OES|ACOES|A(C|Ç)(A|Ã)O)$/i.test(normalize(label));
}

function parseDate(text) {
  const raw = normalize(text);
  const match = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  const timestamp = Date.UTC(year, month - 1, day);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseCurrency(text) {
  const raw = normalize(text);
  if (!/R\$/.test(raw)) return null;
  const match = raw.match(/-?R\$\s*([\d.]+(?:,\d+)?)/i);
  if (!match) return null;
  const sign = raw.includes('-') ? -1 : 1;
  const value = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? sign * value : null;
}

function parseNumber(text) {
  const raw = normalize(text);
  if (!/^[-+]?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?$/.test(raw)) return null;
  const first = raw.split('/')[0].trim().replace(',', '.');
  const value = Number(first);
  return Number.isFinite(value) ? value : null;
}

function valueForCell(cell) {
  const text = normalize(cell?.textContent || '');
  const date = parseDate(text);
  if (date !== null) return { type: 'number', value: date };
  const currency = parseCurrency(text);
  if (currency !== null) return { type: 'number', value: currency };
  const numeric = parseNumber(text);
  if (numeric !== null) return { type: 'number', value: numeric };
  return { type: 'text', value: text };
}

function compareRows(a, b, index, direction) {
  const av = valueForCell(a.cells[index]);
  const bv = valueForCell(b.cells[index]);
  let result = 0;
  if (av.type === 'number' && bv.type === 'number') {
    result = av.value - bv.value;
  } else {
    result = String(av.value).localeCompare(String(bv.value), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }
  return direction === 'desc' ? -result : result;
}

function updateIndicators(table, activeIndex, direction) {
  [...table.querySelectorAll('thead th[data-hosp-sortable="1"]')].forEach((th, index) => {
    const button = th.querySelector('.hosp-rd-sort-button');
    if (!button) return;
    const indicator = button.querySelector('.hosp-rd-sort-indicator');
    const isActive = index === activeIndex;
    th.classList.toggle('hosp-rd-sorted', isActive);
    th.setAttribute('aria-sort', isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    if (indicator) indicator.textContent = isActive ? (direction === 'asc' ? '▲' : '▼') : '↕';
  });
}

function connectObserver() {
  if (!observer || !observerRoot) return;
  observer.observe(observerRoot, { childList: true, subtree: true });
}

function applySort(table, index, direction, persist = true) {
  const tbody = table.tBodies?.[0];
  if (!tbody) return;
  const rows = [...tbody.rows];
  if (rows.length < 2) {
    updateIndicators(table, index, direction);
    if (persist) sortState.set(tableKey(table), { index, direction });
    return;
  }

  observer?.disconnect();
  const indexed = rows.map((row, originalIndex) => ({ row, originalIndex }));
  indexed.sort((a, b) => compareRows(a.row, b.row, index, direction) || (a.originalIndex - b.originalIndex));
  const fragment = document.createDocumentFragment();
  indexed.forEach(({ row }) => fragment.appendChild(row));
  tbody.appendChild(fragment);
  updateIndicators(table, index, direction);
  if (persist) sortState.set(tableKey(table), { index, direction });
  connectObserver();
}

function enhanceTable(table) {
  if (!table || !table.tHead?.rows?.length) return;
  const key = tableKey(table);
  const headers = [...table.tHead.rows[0].cells];

  headers.forEach((th, index) => {
    if (!th.dataset.hospSortLabel) th.dataset.hospSortLabel = normalize(th.textContent);
    const label = headerLabel(th);
    if (isActionHeader(label)) {
      th.dataset.hospSortable = '0';
      th.classList.add('hosp-rd-sort-disabled');
      return;
    }
    th.dataset.hospSortable = '1';
    th.classList.add('hosp-rd-sortable');
    if (!th.querySelector('.hosp-rd-sort-button')) {
      th.textContent = '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hosp-rd-sort-button';
      button.dataset.hospSortIndex = String(index);
      button.innerHTML = `<span class="hosp-rd-sort-label"></span><span class="hosp-rd-sort-indicator" aria-hidden="true">↕</span>`;
      button.querySelector('.hosp-rd-sort-label').textContent = label;
      button.title = `Ordenar por ${label}`;
      button.setAttribute('aria-label', `Ordenar por ${label}`);
      th.appendChild(button);
    }
  });

  const saved = sortState.get(key);
  if (saved && saved.index < headers.length) applySort(table, saved.index, saved.direction, false);
  else updateIndicators(table, -1, 'asc');
}

function enhanceAll() {
  document.querySelectorAll('#hospRedesignRoot .hosp-rd-panel .hosp-rd-table').forEach(enhanceTable);
}

function injectStyles() {
  if (document.getElementById('hospRdSortStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospRdSortStyles';
  style.textContent = `
    #hospRedesignRoot .hosp-rd-sortable{padding:0!important;user-select:none}
    #hospRedesignRoot .hosp-rd-sort-button{width:100%;min-height:42px;display:flex;align-items:center;gap:7px;padding:11px 12px;border:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;text-transform:inherit;letter-spacing:inherit;text-align:left;cursor:pointer}
    #hospRedesignRoot .hosp-rd-sort-button:hover{background:rgba(74,222,128,.055);color:#dcfce7}
    #hospRedesignRoot .hosp-rd-sort-button:focus-visible{outline:1px solid #4ade80;outline-offset:-2px}
    #hospRedesignRoot .hosp-rd-sort-indicator{margin-left:auto;color:#668176;font-size:9px;line-height:1;transition:color .15s ease}
    #hospRedesignRoot th.hosp-rd-sorted .hosp-rd-sort-indicator{color:#4ade80}
    #hospRedesignRoot th.hosp-rd-sorted .hosp-rd-sort-label{color:#d9fbe6}
    #hospRedesignRoot .hosp-rd-sort-disabled{cursor:default}
  `;
  document.head.appendChild(style);
}

function handleClick(event) {
  const button = event.target.closest('#hospRedesignRoot .hosp-rd-sort-button');
  if (!button) return;
  const table = button.closest('table');
  const index = Number(button.dataset.hospSortIndex);
  if (!table || !Number.isInteger(index)) return;
  const key = tableKey(table);
  const previous = sortState.get(key);
  const direction = previous?.index === index && previous.direction === 'asc' ? 'desc' : 'asc';
  applySort(table, index, direction, true);
}

function init() {
  injectStyles();
  document.addEventListener('click', handleClick);

  const wait = setInterval(() => {
    const root = document.getElementById('hospRedesignRoot');
    if (!root) return;
    clearInterval(wait);
    observerRoot = root;
    observer = new MutationObserver(() => {
      requestAnimationFrame(enhanceAll);
    });
    connectObserver();
    enhanceAll();
  }, 50);

  setTimeout(() => clearInterval(wait), 15000);
  console.info(`[hosp-redesign-sort] ativo ${SORT_VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
