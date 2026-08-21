import { supabase } from '../supabaseClient.js';

const PATCH_FLAG = '__uberDespesasSyncPatch';
const CACHE_BRIDGE_FLAG = '__uberPersistentScreenCacheV2';
const UI_ORGANIZER_FLAG = '__uberUiOrganizerV1';
const UBER_SESSION_CACHE_KEY = 'uberConferenciaCache_v1';
const UBER_PERSISTENT_CACHE_KEY = 'uberConferenciaCache_persist_v2';
const UBER_DEFAULT_CACHE_KEY = 'uberConferenciaCache_default_period_v1';

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

function rowDateKey(row) {
  return String(row?.data_solicitacao_local || row?.data_corrida || row?.data || '').slice(0, 10);
}

function compactEmbarqueMatch(match) {
  if (!match || typeof match !== 'object') return match ?? null;
  return {
    os: match.os ?? null,
    numero_os: match.numero_os ?? null,
    cliente: match.cliente ?? null,
    local: match.local ?? null,
    local_embarque: match.local_embarque ?? null,
    embarque: match.embarque ?? null,
    origem: match.origem ?? null,
    cidade: match.cidade ?? null,
    cidade_embarque: match.cidade_embarque ?? null,
    armazem: match.armazem ?? null,
    armazém: match.armazém ?? null,
    produtor: match.produtor ?? null,
  };
}

function compactUberCache(serialized) {
  try {
    const payload = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (!payload || !Array.isArray(payload.rows)) return null;

    const rows = payload.rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const compact = { ...row };
      if (Object.prototype.hasOwnProperty.call(compact, '__embarqueMatch')) {
        compact.__embarqueMatch = compactEmbarqueMatch(compact.__embarqueMatch);
      }
      return compact;
    });

    const filters = {
      inicio: payload?.filters?.inicio || '',
      fim: payload?.filters?.fim || '',
      q: payload?.filters?.q || '',
      status: payload?.filters?.status || '',
    };

    const sessionSerialized = JSON.stringify({
      rows,
      producao: [],
      filters,
      cachedAt: new Date().toISOString(),
    });

    const isFullDataset = !filters.inicio && !filters.fim;
    const persistentSerialized = isFullDataset
      ? JSON.stringify({
          rows,
          producao: [],
          filters: { inicio: '', fim: '', q: '', status: '' },
          cachedAt: new Date().toISOString(),
        })
      : null;

    return { rows, filters, sessionSerialized, persistentSerialized };
  } catch (error) {
    console.warn('[Uber] Não foi possível compactar o cache da tela:', error);
    return null;
  }
}

function isDefaultPeriod(filters) {
  const period = defaultUberPeriod();
  return filters?.inicio === period.inicio && filters?.fim === period.fim;
}

function rowIdentity(row, index) {
  return String(
    row?.id ||
    row?.trip_id ||
    row?.trip_uuid ||
    row?.uuid ||
    row?.identificador_corrida ||
    `${rowDateKey(row)}|${row?.nome_colaborador || row?.nome || ''}|${row?.hora_solicitacao_local || ''}|${index}`
  );
}

function buildDefaultPeriodCache(...serializedSources) {
  const period = defaultUberPeriod();
  const merged = new Map();

  for (const serialized of serializedSources) {
    if (!serialized) continue;
    try {
      const payload = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
      if (!Array.isArray(payload?.rows)) continue;
      payload.rows.forEach((row, index) => {
        const date = rowDateKey(row);
        if (!date || date < period.inicio || date > period.fim) return;
        merged.set(rowIdentity(row, index), row);
      });
    } catch (error) {
      console.warn('[Uber] Cache anterior ignorado ao montar período padrão:', error);
    }
  }

  const rows = [...merged.values()].sort((a, b) => {
    const dateCmp = rowDateKey(b).localeCompare(rowDateKey(a));
    if (dateCmp) return dateCmp;
    return String(b?.hora_solicitacao_local || '').localeCompare(String(a?.hora_solicitacao_local || ''));
  });

  if (!rows.length) return null;
  return JSON.stringify({
    rows,
    producao: [],
    filters: { inicio: period.inicio, fim: period.fim, q: '', status: '' },
    cachedAt: new Date().toISOString(),
  });
}

function installUberPersistentCacheBridge() {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
  if (window[CACHE_BRIDGE_FLAG]) return;

  const storageProto = Storage.prototype;
  const originalSetItem = storageProto.setItem;
  const originalGetItem = storageProto.getItem;
  const originalRemoveItem = storageProto.removeItem;

  try {
    const sessionRaw = originalGetItem.call(window.sessionStorage, UBER_SESSION_CACHE_KEY);
    const persistentRaw = originalGetItem.call(window.localStorage, UBER_PERSISTENT_CACHE_KEY);
    const defaultRaw = originalGetItem.call(window.localStorage, UBER_DEFAULT_CACHE_KEY);

    if (sessionRaw) {
      const compact = compactUberCache(sessionRaw);
      if (compact?.persistentSerialized) {
        originalSetItem.call(window.localStorage, UBER_PERSISTENT_CACHE_KEY, compact.persistentSerialized);
      }
      if (compact && isDefaultPeriod(compact.filters)) {
        originalSetItem.call(window.localStorage, UBER_DEFAULT_CACHE_KEY, compact.sessionSerialized);
      }
    }

    const defaultSnapshot = buildDefaultPeriodCache(persistentRaw, defaultRaw, sessionRaw);
    if (defaultSnapshot) {
      originalSetItem.call(window.sessionStorage, UBER_SESSION_CACHE_KEY, defaultSnapshot);
    } else {
      originalRemoveItem.call(window.sessionStorage, UBER_SESSION_CACHE_KEY);
    }
  } catch (error) {
    console.warn('[Uber] Não foi possível restaurar o cache persistente da tela:', error);
  }

  storageProto.setItem = function patchedStorageSetItem(key, value) {
    if (this === window.sessionStorage && key === UBER_SESSION_CACHE_KEY) {
      const compact = compactUberCache(value);
      const sessionValue = compact?.sessionSerialized || String(value ?? '');

      try {
        originalSetItem.call(this, key, sessionValue);
      } catch (error) {
        try {
          originalRemoveItem.call(this, key);
          originalSetItem.call(this, key, sessionValue);
        } catch (retryError) {
          console.warn('[Uber] Não foi possível salvar o cache leve da tela:', retryError || error);
        }
      }

      if (compact?.persistentSerialized) {
        try {
          originalSetItem.call(window.localStorage, UBER_PERSISTENT_CACHE_KEY, compact.persistentSerialized);
        } catch (error) {
          console.warn('[Uber] Não foi possível salvar o cache persistente da tela:', error);
        }
      }

      if (compact && isDefaultPeriod(compact.filters)) {
        try {
          originalSetItem.call(window.localStorage, UBER_DEFAULT_CACHE_KEY, compact.sessionSerialized);
        } catch (error) {
          console.warn('[Uber] Não foi possível salvar o cache do período padrão:', error);
        }
      }
      return;
    }

    return originalSetItem.call(this, key, value);
  };

  window[CACHE_BRIDGE_FLAG] = true;
}

installUberPersistentCacheBridge();

const sortState = {
  conferir: { index: null, direction: 'asc' },
  caixa: { index: null, direction: 'asc' },
  valida: { index: null, direction: 'asc' },
};

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

  rows.sort((a, b) => {
    const av = cellSortValue(a.cells[index], index);
    const bv = cellSortValue(b.cells[index], index);
    return compareValues(av, bv) * multiplier;
  });

  rows.forEach((row) => tbody.appendChild(row));
}

function ensureOrganizerStyle() {
  if (document.getElementById('uberOrganizerStyle')) return;
  const style = document.createElement('style');
  style.id = 'uberOrganizerStyle';
  style.textContent = `
    .uber-table th[data-uber-sort-col]{cursor:pointer;user-select:none;white-space:nowrap}
    .uber-table th[data-uber-sort-col]:hover{background:rgba(22,101,52,.28)}
    .uber-table th[data-uber-sort-col]::after{content:' ↕';opacity:.38;font-size:11px}
    .uber-table th[data-uber-sort-col][data-sort-direction="asc"]::after{content:' ↑';opacity:1;color:#86efac}
    .uber-table th[data-uber-sort-col][data-sort-direction="desc"]::after{content:' ↓';opacity:1;color:#86efac}
  `;
  document.head.appendChild(style);
}

function decorateUberTables() {
  ensureOrganizerStyle();
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

    if (state.index !== null) applyTableSort(table, state.index, state.direction);
  });
}

function applyDefaultDateInputs() {
  const start = document.querySelector('[data-inicio]');
  const end = document.querySelector('[data-fim]');
  if (!start || !end) return false;
  const period = defaultUberPeriod();

  if (!start.dataset.uberDefaultInitialized) {
    start.value = period.inicio;
    end.value = period.fim;
    start.dataset.uberDefaultInitialized = '1';
    end.dataset.uberDefaultInitialized = '1';
  }
  return true;
}

function scheduleDefaultRefresh() {
  if (window.__uberDefaultPeriodRefreshScheduled) return;
  window.__uberDefaultPeriodRefreshScheduled = true;
  let attempts = 0;

  const tryRefresh = () => {
    attempts += 1;
    const ready = applyDefaultDateInputs();
    const button = document.querySelector('[data-refresh]');
    const feedback = document.querySelector('[data-feedback]')?.textContent || '';

    if (!ready || !button) {
      if (attempts < 30) setTimeout(tryRefresh, 100);
      return;
    }

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
