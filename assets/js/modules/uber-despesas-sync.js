import { supabase } from '../supabaseClient.js';

const PATCH_FLAG = '__uberDespesasSyncPatch';
const UI_ORGANIZER_FLAG = '__uberUiOrganizerV1';

function localDateISO(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultUberPeriod() {
  return {
    inicio: localDateISO(-1),
    fim: localDateISO(0),
  };
}

const sortState = {
  conferir: { index: null, direction: 'asc' },
  caixa: { index: null, direction: 'asc' },
  valida: { index: null, direction: 'asc' },
};
const defaultRefreshButtons = new WeakSet();

function tableGroup(table) {
  if (table.closest('[data-conferir]')) return 'conferir';
  if (table.closest('[data-caixa]')) return 'caixa';
  if (table.closest('[data-valida]')) return 'valida';
  return 'conferir';
}

function parseDateCell(text) {
  const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return 0;
  return Number(`${match[3]}${match[2]}${match[1]}`);
}

function parseMoneyCell(text) {
  const match = String(text || '').match(/-?\s*R\$\s*([\d.]+,\d{2})/i);
  if (!match) return 0;
  const negative = /^\s*-/.test(match[0]);
  const value = Number(match[1].replaceAll('.', '').replace(',', '.')) || 0;
  return negative ? -value : value;
}

function cellSortValue(cell, index) {
  const text = cell?.textContent?.trim() || '';
  if (index === 0) return parseDateCell(text);
  if (index === 5) return parseMoneyCell(text);
  return text;
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base', numeric: true });
}

function applyTableSort(table, index, direction) {
  const tbody = table?.tBodies?.[0];
  if (!tbody) return;
  const rows = [...tbody.rows].filter((row) => !row.querySelector('.uber-empty'));
  const multiplier = direction === 'desc' ? -1 : 1;
  const sorted = [...rows].sort((a, b) => {
    const av = cellSortValue(a.cells[index], index);
    const bv = cellSortValue(b.cells[index], index);
    return compareValues(av, bv) * multiplier;
  });

  const changed = sorted.some((row, position) => row !== rows[position]);
  if (!changed) return;
  sorted.forEach((row) => tbody.appendChild(row));
}

function ensureOrganizerStyle() {
  if (document.getElementById('uberOrganizerStyle')) return;
  const style = document.createElement('style');
  style.id = 'uberOrganizerStyle';
  style.textContent = `
    .uber-hero{padding:0!important;min-height:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;display:flex!important;justify-content:flex-end!important;align-items:center!important}
    .uber-hero>div:not(.uber-actions){display:none!important}
    .uber-hero .uber-actions{margin:0!important;width:auto!important;justify-content:flex-end!important;gap:8px!important}
    .uber-hero .uber-btn{min-height:38px!important;padding:8px 12px!important}
    .uber-grid{margin-top:10px!important}
    .uber-table th[data-uber-sort-col]{cursor:pointer;user-select:none;white-space:nowrap}
    .uber-table th[data-uber-sort-col]:hover{background:rgba(22,101,52,.28)}
    .uber-table th[data-uber-sort-col]::after{content:' ↕';opacity:.38;font-size:11px}
    .uber-table th[data-uber-sort-col][data-sort-direction="asc"]::after{content:' ↑';opacity:1;color:#86efac}
    .uber-table th[data-uber-sort-col][data-sort-direction="desc"]::after{content:' ↓';opacity:1;color:#86efac}
  `;
  document.head.appendChild(style);
}

function compactUberLayout() {
  const hero = document.querySelector('.uber-hero');
  if (hero) {
    [...hero.children].forEach((child) => {
      if (!child.classList?.contains('uber-actions')) child.remove();
    });
  }

  document.querySelectorAll('.uber-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')];
    const categoryIndex = headers.findIndex((th) => /^(CATEGORIA)$/i.test((th.textContent || '').trim()));
    if (categoryIndex < 0) return;
    headers[categoryIndex]?.remove();
    table.querySelectorAll('tbody tr').forEach((row) => row.cells?.[categoryIndex]?.remove());
  });
}

function decorateUberTables() {
  ensureOrganizerStyle();
  compactUberLayout();
  document.querySelectorAll('.uber-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')];
    const group = tableGroup(table);
    const state = sortState[group];

    headers.forEach((th, index) => {
      const isActions = index === headers.length - 1 || /AÇÕES|ACOES/i.test(th.textContent || '');
      if (isActions) return;
      th.dataset.uberSortCol = String(index);
      th.setAttribute('role', 'button');
      th.setAttribute('tabindex', '0');
      th.setAttribute('title', 'Clique para ordenar esta coluna');
      if (state.index === index) th.dataset.sortDirection = state.direction;
      else delete th.dataset.sortDirection;
    });

    if (state.index !== null && state.index < headers.length - 1) {
      applyTableSort(table, state.index, state.direction);
    }
  });
}

// Retorna null enquanto os inputs ainda não existem, true se acabou de
// preencher o período padrão (inputs estavam vazios) e false se os inputs já
// tinham data (veio de cache/filtro do usuário) — nesse caso não mexe em nada.
function applyDefaultDateInputs() {
  const start = document.querySelector('[data-inicio]');
  const end = document.querySelector('[data-fim]');
  if (!start || !end) return null;
  if (start.dataset.uberDefaultInitialized) return false;
  start.dataset.uberDefaultInitialized = '1';
  end.dataset.uberDefaultInitialized = '1';

  if (start.value || end.value) return false;
  // A tela abriu com as corridas do cache (uber.js) e o filtro que o usuário deixou, mesmo sem datas:
  // trocar por ontem→hoje e recarregar descartaria o que já estava carregado.
  if (window.__uberCacheRestaurado) return false;

  const period = defaultUberPeriod();
  start.value = period.inicio;
  end.value = period.fim;
  return true;
}

// Só força um refresh automático quando a tela realmente começou sem
// nenhuma data preenchida (primeira visita sem cache algum). Se já havia
// cache ou filtro do usuário, os dados já estão passivamente na tela e um
// clique automático em "Atualizar" só reintroduziria o "Carregando..." e
// poderia atropelar um filtro que o usuário acabou de aplicar.
function scheduleDefaultRefresh() {
  const button = document.querySelector('[data-refresh]');
  if (!button || defaultRefreshButtons.has(button)) return;
  defaultRefreshButtons.add(button);
  let attempts = 0;
  let forcedDefault = false;

  const tryRefresh = () => {
    attempts += 1;
    const applied = applyDefaultDateInputs();

    if (applied === null) {
      if (attempts < 30) setTimeout(tryRefresh, 100);
      return;
    }
    if (applied) forcedDefault = true;
    if (!forcedDefault) return;

    const feedback = document.querySelector('[data-feedback]')?.textContent || '';
    if (/Carregando|Cruzando/i.test(feedback)) {
      if (attempts < 40) setTimeout(tryRefresh, 150);
      return;
    }

    button.click();
  };

  setTimeout(tryRefresh, 0);
}

function installUberUiOrganizer() {
  if (typeof window === 'undefined' || window[UI_ORGANIZER_FLAG]) return;
  window[UI_ORGANIZER_FLAG] = true;

  const handleSort = (header) => {
    const table = header.closest('.uber-table');
    if (!table) return;
    const group = tableGroup(table);
    const index = Number(header.dataset.uberSortCol);
    if (!Number.isInteger(index)) return;

    const current = sortState[group];
    if (current.index === index) current.direction = current.direction === 'asc' ? 'desc' : 'asc';
    else {
      current.index = index;
      current.direction = index === 0 ? 'desc' : 'asc';
    }

    decorateUberTables();
  };

  document.addEventListener('click', (event) => {
    const header = event.target.closest?.('.uber-table th[data-uber-sort-col]');
    if (header) handleSort(header);
  });

  document.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const header = event.target.closest?.('.uber-table th[data-uber-sort-col]');
    if (!header) return;
    event.preventDefault();
    handleSort(header);
  });

  let raf = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      applyDefaultDateInputs();
      decorateUberTables();
      scheduleDefaultRefresh();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  queueMicrotask(() => {
    applyDefaultDateInputs();
    decorateUberTables();
    scheduleDefaultRefresh();
  });
}

installUberUiOrganizer();

function asBody(options = {}) {
  const original = options && typeof options === 'object' ? options : {};
  const body = original.body && typeof original.body === 'object' ? original.body : {};
  return {
    ...original,
    body: {
      ...body,
      sincronizar_despesas: true,
      sync_despesas: true,
      gerar_despesas: true,
      sincronizar_equipe: true,
      sync_equipe: true,
      sincronizar_colaboradores: true,
      somente_ativos_painel: true,
      remover_inativos: true,
      remover_colaboradores_inativos: true,
      excluir_inativos_da_equipe_uber: true,
      origem: body.origem || 'UBER',
    },
  };
}

async function tryFunctionCandidates(originalInvoke, candidates, options, label) {
  for (const functionName of candidates) {
    try {
      const res = await originalInvoke(functionName, asBody(options));
      if (!res?.error && !res?.data?.error) return res;
    } catch (error) {
      // A função fallback pode não existir no projeto; nesse caso a própria sync-uber-corridas deve tratar o fluxo.
      console.info(`[Uber] fallback ${label} ${functionName} indisponível:`, error?.message || error);
    }
  }
  return null;
}

function countFromPayload(payload, keys) {
  if (!payload || typeof payload !== 'object') return undefined;
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function mergeFallbackResult(target, key, fallback, countKeys) {
  if (!fallback?.data || !target?.data || typeof target.data !== 'object') return;
  target.data[key] = fallback.data;
  const count = countFromPayload(fallback.data, countKeys);
  if (count !== undefined) target.data[`${key}_total`] = count;
}

if (supabase?.functions && !supabase.functions[PATCH_FLAG]) {
  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  supabase.functions.invoke = async function patchedInvoke(functionName, options = {}) {
    if (functionName !== 'sync-uber-corridas') {
      return originalInvoke(functionName, options);
    }

    const enhancedOptions = asBody(options);
    const result = await originalInvoke(functionName, enhancedOptions);

    if (!result?.error && !result?.data?.error) {
      const despesasFallback = await tryFunctionCandidates(
        originalInvoke,
        ['sync-uber-despesas', 'sync-uber-despesas-financeiro'],
        enhancedOptions,
        'despesas'
      );
      mergeFallbackResult(result, 'despesas', despesasFallback, ['upserted', 'importados', 'total', 'despesas_sincronizadas']);
      if (result?.data?.despesas_total !== undefined) {
        result.data.despesas_sincronizadas = result.data.despesas_total;
      }

      const equipeFallback = await tryFunctionCandidates(
        originalInvoke,
        ['sync-uber-equipe', 'sync-uber-colaboradores', 'sync-uber-equipe-colaboradores', 'sync-uber-remover-inativos'],
        enhancedOptions,
        'equipe'
      );
      mergeFallbackResult(result, 'equipe', equipeFallback, ['removidos', 'inativos_removidos', 'excluidos', 'excluídos', 'total_removidos', 'uber_equipe_removidos']);
      if (result?.data?.equipe_total !== undefined) {
        result.data.uber_equipe_removidos = result.data.equipe_total;
        result.data.equipe_inativos_removidos = result.data.equipe_total;
      }
    }

    return result;
  };

  supabase.functions[PATCH_FLAG] = true;
}
