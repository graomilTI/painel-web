// Programação: usa a relação programacao_usuario_supervisoes/RPC para não buscar todas as supervisões a cada carregamento.
import { supabase } from './supabaseClient.js';

// v4 invalida o cache de 12h criado antes do ajuste de coordenação/supervisão.
// Sem isso, um navegador que já abriu Programação hoje poderia continuar
// escondendo uma supervisão recém-corrigida até o TTL expirar.
const CACHE_KEY_PREFIX = 'programacao_supervisoes_v4';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
try {
  localStorage.removeItem('programacao_supervisoes_v3');
  localStorage.removeItem('programacao_supervisoes_v2');
  localStorage.removeItem('programacao_supervisoes_v1');
} catch (_) {}
const originalFrom = supabase.from.bind(supabase);
const originalRpc = supabase.rpc.bind(supabase);
let pending = null;
let lastResult = null;

// A chave PRECISA ser por usuário: antes (v1/v2) era uma chave global só em
// localStorage, então num mesmo navegador/dispositivo o resultado do RPC
// programacao_listar_supervisoes (que já é restrito por usuário) de quem
// carregasse a página primeiro ficava em cache e era servido pro PRÓXIMO
// usuário que logasse ali dentro das 12h — vazando a lista de supervisões
// (e, em cascata, colaboradores/O.S.) de outra conta pra quem não deveria ver.
async function cacheKey() {
  try {
    const { data } = await supabase.auth.getUser();
    return `${CACHE_KEY_PREFIX}:${data?.user?.id || 'anon'}`;
  } catch (_) {
    return `${CACHE_KEY_PREFIX}:anon`;
  }
}

async function readCache() {
  try {
    const raw = localStorage.getItem(await cacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    if (Date.now() - Number(parsed.ts || 0) > CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch (_) {
    return null;
  }
}

async function writeCache(rows) {
  try {
    localStorage.setItem(await cacheKey(), JSON.stringify({ ts: Date.now(), rows }));
  } catch (_) {}
}

function normalizeRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const nome = String(row?.nome || row?.supervisao || '').trim();
    const key = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (nome && key && !map.has(key)) map.set(key, { nome });
  });
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function fetchSupervisoes() {
  const cached = await readCache();
  if (cached?.length) return { data: cached, error: null, fromCache: true };

  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await originalRpc('programacao_listar_supervisoes');
      if (error) throw error;
      const rows = normalizeRows(data);
      if (rows.length) {
        await writeCache(rows);
        lastResult = { data: rows, error: null };
        return lastResult;
      }
    } catch (error) {
      console.warn('[programacao-supervisoes-cache] RPC indisponível; usando tabela supervisoes.', error);
    }

    const fallback = await originalFrom('supervisoes')
      .select('nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    const rows = normalizeRows(fallback.data || []);
    if (!fallback.error && rows.length) await writeCache(rows);
    lastResult = { data: rows, error: fallback.error || null };
    return lastResult;
  })().finally(() => { pending = null; });

  return pending;
}

function makeCachedSupervisoesBuilder() {
  const builder = {};
  ['select', 'eq', 'neq', 'order', 'limit', 'range'].forEach((method) => {
    builder[method] = () => builder;
  });
  builder.then = (resolve, reject) => fetchSupervisoes().then(resolve, reject);
  builder.catch = (reject) => fetchSupervisoes().catch(reject);
  builder.finally = (cb) => fetchSupervisoes().finally(cb);
  return builder;
}

supabase.from = function patchedFrom(table) {
  if (String(table) === 'supervisoes') return makeCachedSupervisoesBuilder();
  return originalFrom(table);
};

window.programacaoSupervisoesCache = {
  async clear() {
    try { localStorage.removeItem(await cacheKey()); } catch (_) {}
    lastResult = null;
  },
  getLast() { return lastResult; },
};
