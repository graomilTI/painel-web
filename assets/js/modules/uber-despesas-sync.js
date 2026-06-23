import { supabase } from '../supabaseClient.js';

const PATCH_FLAG = '__uberDespesasSyncPatch';

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
