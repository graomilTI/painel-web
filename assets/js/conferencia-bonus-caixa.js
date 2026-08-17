import { supabase } from './supabaseClient.js';

const STYLE_ID = 'conferenciaBonusCaixaStyles';
let sortKey = null;
let sortDir = 'asc';
let lancando = false;
let enhanceQueued = false;
let bodyObserver = null;
let observedBody = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .bonus-head-actions{display:flex;align-items:center;gap:9px;margin-left:auto}
    .bonus-launch-wrap{display:flex;align-items:center;gap:8px}
    .bonus-launch-btn{height:38px;padding:0 15px;border:1px solid rgba(74,222,128,.32);border-radius:10px;background:#159957;color:#f3fff8;font:inherit;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;box-shadow:0 7px 24px rgba(21,153,87,.14)}
    .bonus-launch-btn:hover:not(:disabled){background:#19aa62}
    .bonus-launch-btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
    .bonus-launch-msg{max-width:330px;color:#91aa9f;font-size:10.5px;line-height:1.25}
    .bonus-launch-msg.ok{color:#72efb1}.bonus-launch-msg.err{color:#ff9a9a}
    .bonus-table th.bonus-sortable{cursor:pointer;user-select:none;white-space:nowrap}
    .bonus-table th.bonus-sortable:hover{color:#9cf5c6;background:#08251b}
    .bonus-sort-icon{display:inline-block;width:12px;margin-left:5px;color:#76998a;font-size:10px;text-align:center}
    .bonus-table th[aria-sort="ascending"] .bonus-sort-icon,.bonus-table th[aria-sort="descending"] .bonus-sort-icon{color:#72efb1}
    .bonus-check:disabled{opacity:.25;cursor:not-allowed}
    @media(max-width:980px){.bonus-head-actions{width:100%;margin-left:0;flex-wrap:wrap}.bonus-launch-msg{max-width:none}.bonus-launch-wrap{flex:1;flex-wrap:wrap}}
  `;
  document.head.appendChild(style);
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function parseBrNumber(value) {
  const text = String(value ?? '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function getCompetencia() {
  const month = Number(document.querySelector('#bonusPeriodo .bonus-month.active')?.dataset.month ?? new Date().getMonth());
  const year = Number(document.querySelector('#bonusPeriodo .bonus-year strong')?.textContent ?? new Date().getFullYear());
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function isProduction() {
  return document.querySelector('.bonus-tab.active')?.dataset.tab === 'producao';
}

function getLaunchableRows() {
  return [...document.querySelectorAll('#bonusBody .bonus-table tbody tr')].filter((tr) => {
    const checkbox = tr.querySelector('[data-row-check]');
    const status = tr.querySelector('.bonus-status')?.textContent?.trim();
    return checkbox && checkbox.checked && !checkbox.disabled && status === 'Apto';
  });
}

function syncSelectionUi() {
  const selected = getLaunchableRows().length;
  const text = `${selected} selecionado(s) apto(s)`;
  const label = document.querySelector('#bonusBody .bonus-selected');
  if (label && label.textContent !== text) label.textContent = text;

  const button = document.getElementById('bonusLaunchCaixa');
  if (button) {
    const disabled = lancando || !isProduction() || selected === 0;
    if (button.disabled !== disabled) button.disabled = disabled;
  }
}

function disableInaptos() {
  document.querySelectorAll('#bonusBody .bonus-table tbody tr').forEach((tr) => {
    const checkbox = tr.querySelector('[data-row-check]');
    if (!checkbox) return;
    const apto = tr.querySelector('.bonus-status')?.textContent?.trim() === 'Apto';
    if (checkbox.disabled === apto) checkbox.disabled = !apto;
    if (!apto && checkbox.checked) checkbox.checked = false;
    const title = apto ? 'Selecionar para lançamento no Caixa' : 'Colaborador inapto não pode ser lançado';
    if (checkbox.title !== title) checkbox.title = title;
  });
}

function valueForRow(tr, key) {
  if (key === 'colaborador') return norm(tr.querySelector('.bonus-name')?.textContent);
  if (key === 'tons') return parseBrNumber(tr.cells?.[2]?.textContent);
  if (key === 'valor') return parseBrNumber(tr.cells?.[3]?.textContent);
  if (key === 'status') return norm(tr.querySelector('.bonus-status')?.textContent);
  return '';
}

function applySort() {
  if (!sortKey) return;
  const tbody = document.querySelector('#bonusBody .bonus-table tbody');
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')].filter((tr) => tr.querySelector('.bonus-name'));
  if (!rows.length) return;

  const sortedRows = [...rows].sort((a, b) => {
    const av = valueForRow(a, sortKey);
    const bv = valueForRow(b, sortKey);
    let result = 0;
    if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
    else result = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? result : -result;
  });

  const alreadySorted = sortedRows.every((row, index) => rows[index] === row);
  if (alreadySorted) return;

  const fragment = document.createDocumentFragment();
  sortedRows.forEach((row) => fragment.appendChild(row));
  tbody.appendChild(fragment);
}

function enhanceHeaders() {
  const table = document.querySelector('#bonusBody .bonus-table');
  if (!table || !table.querySelector('.bonus-status')) return;
  const headers = [...table.querySelectorAll('thead th')];
  const keys = [null, 'colaborador', 'tons', 'valor', 'status'];
  headers.forEach((th, index) => {
    const key = keys[index];
    if (!key || th.dataset.sortBound === '1') return;
    th.dataset.sortBound = '1';
    th.dataset.sortKey = key;
    th.classList.add('bonus-sortable');
    const icon = document.createElement('span');
    icon.className = 'bonus-sort-icon';
    icon.textContent = '↕';
    th.appendChild(icon);
    th.addEventListener('click', () => {
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      headers.forEach((header) => header.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      headers.forEach((header) => {
        const currentIcon = header.querySelector('.bonus-sort-icon');
        if (!currentIcon) return;
        currentIcon.textContent = header === th ? (sortDir === 'asc' ? '▲' : '▼') : '↕';
      });
      applySort();
    });
  });
  if (sortKey) {
    const active = headers.find((th) => th.dataset.sortKey === sortKey);
    if (active) {
      active.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      const icon = active.querySelector('.bonus-sort-icon');
      if (icon) icon.textContent = sortDir === 'asc' ? '▲' : '▼';
    }
    applySort();
  }
}

function setMessage(text, type = '') {
  const msg = document.getElementById('bonusLaunchMsg');
  if (!msg) return;
  const className = `bonus-launch-msg ${type}`.trim();
  if (msg.className !== className) msg.className = className;
  const nextText = text || '';
  if (msg.textContent !== nextText) msg.textContent = nextText;
}

async function launchSelected() {
  if (lancando) return;
  const rows = getLaunchableRows();
  const colaboradores = rows.map((tr) => tr.querySelector('.bonus-name')?.textContent?.trim()).filter(Boolean);
  if (!colaboradores.length) {
    setMessage('Selecione ao menos um colaborador Apto.', 'err');
    return;
  }

  lancando = true;
  syncSelectionUi();
  setMessage(`Enviando ${colaboradores.length} colaborador(es) para a fila do Caixa...`);
  try {
    const { data, error } = await supabase.rpc('bonus_solicitar_lancamento_caixa', {
      p_competencia: getCompetencia(),
      p_colaboradores: colaboradores,
    });
    if (error) throw error;
    const queued = Number(data?.enfileirados || 0);
    const launched = Number(data?.ja_lancados || 0);
    const rejected = Number(data?.rejeitados || 0);
    const parts = [`${queued} enfileirado(s)`];
    if (launched) parts.push(`${launched} já lançado(s)`);
    if (rejected) parts.push(`${rejected} rejeitado(s)`);
    setMessage(parts.join(' · '), rejected ? 'err' : 'ok');
    rows.forEach((tr) => {
      const checkbox = tr.querySelector('[data-row-check]');
      if (!checkbox?.checked) return;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  } catch (error) {
    console.error('[conferencia-bonus-caixa] lançamento', error);
    setMessage(error?.message || 'Não foi possível enviar os lançamentos ao Caixa.', 'err');
  } finally {
    lancando = false;
    syncSelectionUi();
  }
}

function ensureTopAction() {
  const head = document.querySelector('.bonus-head');
  const tabs = head?.querySelector('.bonus-tabs');
  if (!head || !tabs) return;
  let group = head.querySelector('.bonus-head-actions');
  if (!group) {
    group = document.createElement('div');
    group.className = 'bonus-head-actions';
    const launchWrap = document.createElement('div');
    launchWrap.className = 'bonus-launch-wrap';
    launchWrap.innerHTML = '<button class="bonus-launch-btn" id="bonusLaunchCaixa" type="button" disabled>Lançar no Caixa</button><span class="bonus-launch-msg" id="bonusLaunchMsg"></span>';
    head.insertBefore(group, tabs);
    group.append(launchWrap, tabs);
    group.querySelector('#bonusLaunchCaixa')?.addEventListener('click', launchSelected);
  }
  const wrap = group.querySelector('.bonus-launch-wrap');
  if (wrap) {
    const display = isProduction() ? 'flex' : 'none';
    if (wrap.style.display !== display) wrap.style.display = display;
  }
}

function enhance() {
  ensureTopAction();
  if (!isProduction()) {
    syncSelectionUi();
    return;
  }
  disableInaptos();
  enhanceHeaders();
  document.querySelectorAll('#bonusBody [data-row-check], #bonusCheckAll').forEach((input) => {
    if (input.dataset.caixaBound === '1') return;
    input.dataset.caixaBound = '1';
    input.addEventListener('change', () => scheduleEnhance());
  });
  syncSelectionUi();
}

function attachBodyObserver() {
  const body = document.getElementById('bonusBody');
  if (!body) return false;
  if (observedBody === body && bodyObserver) return true;

  bodyObserver?.disconnect();
  observedBody = body;
  bodyObserver = new MutationObserver(() => scheduleEnhance());
  bodyObserver.observe(body, { childList: true });
  return true;
}

function scheduleEnhance() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  queueMicrotask(() => {
    enhanceQueued = false;
    attachBodyObserver();
    enhance();
  });
}

function start() {
  injectStyles();

  if (!attachBodyObserver()) {
    const host = document.getElementById('pageContent') || document.body;
    const bootstrapObserver = new MutationObserver(() => {
      if (!attachBodyObserver()) return;
      bootstrapObserver.disconnect();
      scheduleEnhance();
    });
    bootstrapObserver.observe(host, { childList: true, subtree: true });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.bonus-tab,[data-month],[data-year-step]')) scheduleEnhance();
  });

  scheduleEnhance();
}

start();