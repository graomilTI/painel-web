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
      origem: body.origem || 'UBER',
    },
  };
}

async function tryDespesaFunction(originalInvoke, options) {
  const candidates = ['sync-uber-despesas', 'sync-uber-despesas-financeiro'];
  for (const functionName of candidates) {
    try {
      const res = await originalInvoke(functionName, asBody(options));
      if (!res?.error && !res?.data?.error) return res;
    } catch (error) {
      // Função fallback pode não existir no projeto; nesse caso a própria sync-uber-corridas deve tratar as despesas.
      console.info(`[Uber] fallback ${functionName} indisponível:`, error?.message || error);
    }
  }
  return null;
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
      const fallback = await tryDespesaFunction(originalInvoke, enhancedOptions);
      if (fallback?.data && result?.data && typeof result.data === 'object') {
        result.data.despesas = fallback.data;
        result.data.despesas_sincronizadas =
          fallback.data?.upserted ?? fallback.data?.importados ?? fallback.data?.total ?? fallback.data?.despesas_sincronizadas ?? result.data?.despesas_sincronizadas;
      }
    }

    return result;
  };

  supabase.functions[PATCH_FLAG] = true;
}
