import { supabase } from './supabaseClient.js';

const STYLE_ID = 'conferenciaBonusCaixaStyles';
const POLL_MS = 15000;
let sortKey = null;
let sortDir = 'asc';
let lancando = false;
let enhanceQueued = false;
let bodyObserver = null;
let observedBody = null;
let filtroLancamento = 'TODOS';
let competenciaCarregada = null;
let statusLoading = null;
let pollTimer = null;
let lancamentos = new Map();

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
    .bonus-launch-msg{max-width:360px;color:#91aa9f;font-size:10.5px;line-height:1.25}
    .bonus-launch-msg.ok{color:#72efb1}.bonus-launch-msg.err{color:#ff9a9a}
    .bonus-table th.bonus-sortable{cursor:pointer;user-select:none;white-space:nowrap}
    .bonus-table th.bonus-sortable:hover{color:#9cf5c6;background:#08251b}
    .bonus-sort-icon{display:inline-block;width:12px;margin-left:5px;color:#76998a;font-size:10px;text-align:center}
    .bonus-table th[aria-sort="ascending"] .bonus-sort-icon,.bonus-table th[aria-sort="descending"] .bonus-sort-icon{color:#72efb1}
    .bonus-check:disabled{opacity:.25;cursor:not-allowed}
    .bonus-launch-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .bonus-launch-filter{height:32px;padding:0 10px;border:1px solid rgba(110,231,183,.14);border-radius:9px;background:#071b15;color:#91aa9f;font:inherit;font-size:10.5px;font-weight:850;cursor:pointer;white-space:nowrap}
    .bonus-launch-filter:hover{border-color:rgba(110,231,183,.3);color:#d8eee3}
    .bonus-launch-filter.active{background:rgba(34,197,94,.13);border-color:rgba(74,222,128,.28);color:#72efb1}
    .bonus-launch-filter[data-filter="PENDENTE"].active{background:rgba(245,158,11,.12);border-color:rgba(251,191,36,.28);color:#f8cb67}
    .bonus-launch-filter[data-filter="ERRO"].active{background:rgba(239,68,68,.11);border-color:rgba(248,113,113,.25);color:#ff9a9a}
    .bonus-launch-filter-count{margin-left:4px;opacity:.82;font-variant-numeric:tabular-nums}
    .bonus-launch-state{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid transparent;font-size:10.5px;font-weight:900;white-space:nowrap}
    .bonus-launch-state::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .bonus-launch-state.nao-lancado{color:#9fb7aa;background:rgba(148,163,184,.08);border-color:rgba(148,163,184,.12)}
    .bonus-launch-state.pendente{color:#f8cb67;background:rgba(245,158,11,.1);border-color:rgba(251,191,36,.17)}
    .bonus-launch-state.lancado{color:#72efb1;background:rgba(16,185,129,.13);border-color:rgba(52,211,153,.2)}
    .bonus-launch-state.erro{color:#ff9a9a;background:rgba(239,68,68,.1);border-color:rgba(248,113,113,.17)}
    .bonus-launch-state.carregando{color:#9fb7aa;background:rgba(148,163,184,.06);border-color:rgba(148,163,184,.1)}
    .bonus-table tbody tr.bonus-row-lancado{background:rgba(34,197,94,.095);box-shadow:inset 3px 0 0 rgba(74,222,128,.68)}
    .bonus-table tbody tr.bonus-row-lancado:hover{background:rgba(34,197,94,.145)}
    .bonus-table tbody tr.bonus-row-pendente{background:rgba(245,158,11,.035)}
    .bonus-table tbody tr.bonus-row-erro{background:rgba(239,68,68,.025)}
    @media(max-width:1180px){.bonus-toolbar{align-items:flex-start}.bonus-launch-filters{width:100%;order:3}.bonus-selected{order:4}}
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

function canonicalLaunchStatus(value) {
  const key = norm(value);
  if (key === 'LANCADO' || key === 'CONCLUIDO' || key === 'SUCESSO') return 'LANCADO';
  if (key === 'PENDENTE' || key === 'PROCESSANDO' || key === 'RODANDO') return 'PENDENTE';
  if (key === 'ERRO' || key === 'FALHA') return 'ERRO';
  return 'NAO_LANCADO';
}

function statusMeta(status) {
  if (status === 'LANCADO') return { label: 'Lançado', css: 'lancado' };
  if (status === 'PENDENTE') return { label: 'Pendente', css: 'pendente' };
  if (status === 'ERRO') return { label: 'Erro', css: 'erro' };
  if (status === 'CARREGANDO') return { label: 'Carregando', css: 'carregando' };
  return { label: 'Não lançado', css: 'nao-lancado' };
}

function launchRecordForRow(tr) {
  const name = tr.querySelector('.bonus-name')?.textContent?.trim() || '';
  return lancamentos.get(norm(name)) || null;
}

function launchStatusForRow(tr) {
  if (competenciaCarregada !== getCompetencia()) return 'CARREGANDO';
  return canonicalLaunchStatus(launchRecordForRow(tr)?.status);
}

function getProductionRows() {
  return [...document.querySelectorAll('#bonusBody .bonus-table tbody tr')]
    .filter((tr) => tr.querySelector('.bonus-name'));
}

function isRowLaunchable(tr) {
  const checkbox = tr.querySelector('[data-row-check]');
  const apto = tr.querySelector('.bonus-status')?.textContent?.trim() === 'Apto';
  const launchStatus = launchStatusForRow(tr);
  return !!checkbox && apto && ['NAO_LANCADO', 'ERRO'].includes(launchStatus);
}

function getLaunchableRows() {
  return getProductionRows().filter((tr) => {
    const checkbox = tr.querySelector('[data-row-check]');
    return !tr.hidden && isRowLaunchable(tr) && checkbox?.checked && !checkbox.disabled;
  });
}

function setMessage(text, type = '') {
  const msg = document.getElementById('bonusLaunchMsg');
  if (!msg) return;
  const className = `bonus-launch-msg ${type}`.trim();
  if (msg.className !== className) msg.className = className;
  const nextText = text || '';
  if (msg.textContent !== nextText) msg.textContent = nextText;
}

function syncSelectionUi() {
  const selected = getLaunchableRows().length;
  const text = `${selected} selecionado(s) apto(s)`;
  const label = document.querySelector('#bonusBody .bonus-selected');
  if (label && label.textContent !== text) label.textContent = text;

  const button = document.getElementById('bonusLaunchCaixa');
  if (button) {
    const statusesReady = competenciaCarregada === getCompetencia();
    const disabled = lancando || !isProduction() || !statusesReady || selected === 0;
    if (button.disabled !== disabled) button.disabled = disabled;
  }

  const visibleLaunchable = getProductionRows().filter((tr) => !tr.hidden && isRowLaunchable(tr));
  const checkAll = document.getElementById('bonusCheckAll');
  if (checkAll) {
    const checked = visibleLaunchable.length > 0 && visibleLaunchable.every((tr) => tr.querySelector('[data-row-check]')?.checked);
    if (checkAll.checked !== checked) checkAll.checked = checked;
    checkAll.disabled = visibleLaunchable.length === 0;
  }
}

function syncLaunchability() {
  getProductionRows().forEach((tr) => {
    const checkbox = tr.querySelector('[data-row-check]');
    if (!checkbox) return;

    const apto = tr.querySelector('.bonus-status')?.textContent?.trim() === 'Apto';
    const launchStatus = launchStatusForRow(tr);
    const disabled = !apto || ['LANCADO', 'PENDENTE', 'CARREGANDO'].includes(launchStatus);

    if (checkbox.disabled !== disabled) checkbox.disabled = disabled;
    if (disabled && checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    let title = 'Selecionar para lançamento no Caixa';
    if (!apto) title = 'Colaborador inapto não pode ser lançado';
    else if (launchStatus === 'LANCADO') title = 'Bônus já lançado. Novo lançamento bloqueado para evitar duplicidade.';
    else if (launchStatus === 'PENDENTE') title = 'Lançamento já está pendente/processando.';
    else if (launchStatus === 'CARREGANDO') title = 'Conferindo histórico de lançamentos...';
    else if (launchStatus === 'ERRO') title = 'Falha anterior. Selecione para tentar novamente.';
    if (checkbox.title !== title) checkbox.title = title;
  });
}

function ensureLaunchColumn() {
  const table = document.querySelector('#bonusBody .bonus-table');
  if (!table || !table.querySelector('.bonus-status')) return;

  const headRow = table.querySelector('thead tr');
  if (headRow && !headRow.querySelector('[data-bonus-launch-header]')) {
    const th = document.createElement('th');
    th.dataset.bonusLaunchHeader = '1';
    th.textContent = 'Lançamento';
    headRow.appendChild(th);
  }

  table.querySelectorAll('tbody td[colspan]').forEach((td) => {
    if (Number(td.colSpan) < 6) td.colSpan = 6;
  });

  getProductionRows().forEach((tr) => {
    const status = launchStatusForRow(tr);
    const meta = statusMeta(status);
    const record = launchRecordForRow(tr);
    tr.dataset.bonusLaunchStatus = status;
    tr.classList.toggle('bonus-row-lancado', status === 'LANCADO');
    tr.classList.toggle('bonus-row-pendente', status === 'PENDENTE');
    tr.classList.toggle('bonus-row-erro', status === 'ERRO');

    let td = tr.querySelector('[data-bonus-launch-cell]');
    if (!td) {
      td = document.createElement('td');
      td.dataset.bonusLaunchCell = '1';
      tr.appendChild(td);
    }

    const detail = status === 'ERRO' && record?.ultimo_erro ? String(record.ultimo_erro) : '';
    td.innerHTML = `<span class="bonus-launch-state ${meta.css}" title="${detail.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}">${meta.label}</span>`;
  });
}

function launchCounts() {
  const counts = { TODOS: 0, NAO_LANCADO: 0, PENDENTE: 0, LANCADO: 0, ERRO: 0 };
  getProductionRows().forEach((tr) => {
    const status = launchStatusForRow(tr);
    counts.TODOS += 1;
    if (status in counts) counts[status] += 1;
  });
  return counts;
}

function applyLaunchFilter() {
  getProductionRows().forEach((tr) => {
    const status = launchStatusForRow(tr);
    tr.hidden = filtroLancamento !== 'TODOS' && status !== filtroLancamento;
  });
  document.querySelectorAll('.bonus-launch-filter').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filtroLancamento);
  });
  syncSelectionUi();
}

function ensureLaunchFilters() {
  const toolbar = document.querySelector('#bonusBody .bonus-toolbar');
  if (!toolbar) return;
  const counts = launchCounts();
  let wrap = toolbar.querySelector('.bonus-launch-filters');

  const buttons = [
    ['TODOS', 'Todos'],
    ['NAO_LANCADO', 'Não lançados'],
    ['PENDENTE', 'Pendentes'],
    ['LANCADO', 'Lançados'],
    ['ERRO', 'Erro'],
  ];

  const html = buttons.map(([key, label]) => `
    <button class="bonus-launch-filter ${filtroLancamento === key ? 'active' : ''}" type="button" data-filter="${key}">
      ${label}<span class="bonus-launch-filter-count">${counts[key] || 0}</span>
    </button>
  `).join('');

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'bonus-launch-filters';
    const selected = toolbar.querySelector('.bonus-selected');
    if (selected) toolbar.insertBefore(wrap, selected); else toolbar.appendChild(wrap);
    wrap.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      filtroLancamento = button.dataset.filter || 'TODOS';
      applyLaunchFilter();
    });
  }

  if (wrap.innerHTML !== html) wrap.innerHTML = html;
  applyLaunchFilter();
}

function valueForRow(tr, key) {
  if (key === 'colaborador') return norm(tr.querySelector('.bonus-name')?.textContent);
  if (key === 'tons') return parseBrNumber(tr.cells?.[2]?.textContent);
  if (key === 'valor') return parseBrNumber(tr.cells?.[3]?.textContent);
  if (key === 'status') return norm(tr.querySelector('.bonus-status')?.textContent);
  if (key === 'lancamento') return launchStatusForRow(tr);
  return '';
}

function applySort() {
  if (!sortKey) return;
  const tbody = document.querySelector('#bonusBody .bonus-table tbody');
  if (!tbody) return;
  const rows = getProductionRows();
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
  const keys = [null, 'colaborador', 'tons', 'valor', 'status', 'lancamento'];
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

async function loadCaixaStatus(force = false) {
  const comp = getCompetencia();
  if (!force && competenciaCarregada === comp) return;
  if (statusLoading) return statusLoading;

  statusLoading = (async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_caixa_lancamentos')
        .select('colaborador_nome,nome_normalizado,status,tentativas,ultimo_erro,solicitado_em,iniciado_em,processado_em,updated_at')
        .eq('competencia', comp)
        .order('solicitado_em', { ascending: true });
      if (error) throw error;

      const next = new Map();
      (data || []).forEach((row) => {
        const keys = [norm(row.colaborador_nome), norm(row.nome_normalizado)].filter(Boolean);
        keys.forEach((key) => next.set(key, row));
      });
      lancamentos = next;
      competenciaCarregada = comp;
      scheduleEnhance();
    } catch (error) {
      console.error('[conferencia-bonus-caixa] status', error);
      setMessage(error?.message || 'Não foi possível consultar os lançamentos do Caixa.', 'err');
    } finally {
      statusLoading = null;
    }
  })();

  return statusLoading;
}

async function launchSelected() {
  if (lancando) return;
  const rows = getLaunchableRows();
  const colaboradores = rows.map((tr) => tr.querySelector('.bonus-name')?.textContent?.trim()).filter(Boolean);
  if (!colaboradores.length) {
    setMessage('Selecione ao menos um colaborador Apto e ainda não lançado.', 'err');
    return;
  }

  lancando = true;
  syncSelectionUi();
  setMessage(`Enviando ${colaboradores.length} colaborador(es) para lançamento no Caixa...`);
  try {
    const { data, error } = await supabase.rpc('bonus_solicitar_lancamento_caixa', {
      p_competencia: getCompetencia(),
      p_colaboradores: colaboradores,
    });
    if (error) throw error;

    const queued = Number(data?.enfileirados || 0);
    const launched = Number(data?.ja_lancados || 0);
    const pending = Number(data?.ja_pendentes || 0);
    const rejected = Number(data?.rejeitados || 0);
    const parts = [`${queued} enviado(s)`];
    if (pending) parts.push(`${pending} já pendente(s)`);
    if (launched) parts.push(`${launched} já lançado(s)`);
    if (rejected) parts.push(`${rejected} rejeitado(s)`);
    setMessage(parts.join(' · '), rejected ? 'err' : 'ok');

    rows.forEach((tr) => {
      const checkbox = tr.querySelector('[data-row-check]');
      if (!checkbox?.checked) return;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await loadCaixaStatus(true);
    window.dispatchEvent(new CustomEvent('bonus-caixa-updated', { detail: { competencia: getCompetencia() } }));
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

function cleanupSidebarDuplicates() {
  const menu = document.getElementById('sidebarMenu');
  if (!menu) return;
  const links = [...menu.querySelectorAll('a[href]')].filter((a) => {
    try {
      return /\/conferencia-bonus(?:\.html)?$/i.test(new URL(a.href, location.href).pathname);
    } catch {
      return false;
    }
  });
  links.slice(1).forEach((link) => link.closest('li')?.remove());
}

function enhance() {
  ensureTopAction();
  cleanupSidebarDuplicates();

  if (!isProduction()) {
    syncSelectionUi();
    return;
  }

  if (competenciaCarregada !== getCompetencia() && !statusLoading) {
    void loadCaixaStatus();
  }

  ensureLaunchColumn();
  syncLaunchability();
  ensureLaunchFilters();
  enhanceHeaders();

  document.querySelectorAll('#bonusBody [data-row-check]').forEach((input) => {
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

function handleCheckAllCapture(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'bonusCheckAll' || !isProduction()) return;

  event.stopImmediatePropagation();
  const shouldCheck = target.checked;
  getProductionRows()
    .filter((tr) => !tr.hidden && isRowLaunchable(tr))
    .forEach((tr) => {
      const checkbox = tr.querySelector('[data-row-check]');
      if (!checkbox || checkbox.disabled || checkbox.checked === shouldCheck) return;
      checkbox.checked = shouldCheck;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  syncSelectionUi();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !isProduction()) return;
    const hasPending = [...lancamentos.values()].some((row) => canonicalLaunchStatus(row.status) === 'PENDENTE');
    if (hasPending) void loadCaixaStatus(true);
  }, POLL_MS);
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

  document.addEventListener('change', handleCheckAllCapture, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('.bonus-tab,[data-month],[data-year-step]')) {
      queueMicrotask(() => {
        if (competenciaCarregada !== getCompetencia()) void loadCaixaStatus();
        scheduleEnhance();
      });
    }
  });
  window.addEventListener('bonus-caixa-updated', () => void loadCaixaStatus(true));

  startPolling();
  scheduleEnhance();
}

start();
