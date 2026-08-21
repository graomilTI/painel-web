import { supabase } from '../supabaseClient.js';

const PATCH_FLAG = '__uberDespesasSyncPatch';
const CACHE_BRIDGE_FLAG = '__uberPersistentScreenCacheV2';
const UBER_SESSION_CACHE_KEY = 'uberConferenciaCache_v1';
const UBER_PERSISTENT_CACHE_KEY = 'uberConferenciaCache_persist_v2';

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

    return { sessionSerialized, persistentSerialized };
  } catch (error) {
    console.warn('[Uber] Não foi possível compactar o cache da tela:', error);
    return null;
  }
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

    if (!sessionRaw && persistentRaw) {
      originalSetItem.call(window.sessionStorage, UBER_SESSION_CACHE_KEY, persistentRaw);
    } else if (sessionRaw) {
      const compact = compactUberCache(sessionRaw);
      if (compact?.sessionSerialized) {
        originalSetItem.call(window.sessionStorage, UBER_SESSION_CACHE_KEY, compact.sessionSerialized);
      }
      if (compact?.persistentSerialized) {
        originalSetItem.call(window.localStorage, UBER_PERSISTENT_CACHE_KEY, compact.persistentSerialized);
      }
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
      return;
    }

    return originalSetItem.call(this, key, value);
  };

  window[CACHE_BRIDGE_FLAG] = true;
}

installUberPersistentCacheBridge();

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
