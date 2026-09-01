// Programação: usa a relação programacao_usuario_supervisoes/RPC para não buscar todas as supervisões a cada carregamento.
import { supabase } from './supabaseClient.js';

// v5 invalida o cache amplo criado quando coordenação ainda expandia acesso.
// Regra de segurança: resposta vazia do RPC significa ZERO supervisões
// liberadas. Nunca deve cair para uma consulta irrestrita de supervisoes.
// v6: TTL caiu de 12h para 5min (mesmo padrão do grao1000:user-ctx:v1) —
// 12h deixava usuário vendo lista de supervisão desatualizada por até 12h
// depois de o cadastro (app_usuarios.supervisao / programacao_usuario_supervisoes)
// ser alterado por um admin, já que a chave só expira por tempo, não por mudança
// de dado (caso real: SARA KELCI RIBAS, 01/09/2026).
const CACHE_KEY_PREFIX = 'programacao_supervisoes_v6';
const CACHE_TTL_MS = 1000 * 60 * 5;
try {
  Object.keys(localStorage)
    .filter((key) => /^programacao_supervisoes_v[1-5](?::|$)/.test(key))
    .forEach((key) => localStorage.removeItem(key));
} catch (_) {}

const originalFrom = supabase.from.bind(supabase);
const originalRpc = supabase.rpc.bind(supabase);
let pending = null;
let lastResult = null;

// A chave PRECISA ser por usuário para não compartilhar permissões entre
// contas que usam o mesmo navegador/dispositivo.
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
    localStorage.setItem(await cacheKey(), JSON.stringify({ ts: Date.now(), rows: Array.isArray(rows) ? rows : [] }));
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
  // Array vazio é resultado válido: significa que o usuário não tem nenhuma
  // supervisão liberada. Não confundir com ausência de cache.
  if (Array.isArray(cached)) {
    lastResult = { data: cached, error: null };
    return { ...lastResult, fromCache: true };
  }

  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await originalRpc('programacao_listar_supervisoes');
      if (error) throw error;

      const rows = normalizeRows(data);
      await writeCache(rows);
      lastResult = { data: rows, error: null };
      return lastResult;
    } catch (error) {
      // FAIL CLOSED: se a fonte de autorização falhar, não consulta a tabela
      // supervisoes sem escopo. Isso impediria um erro de rede/RPC de liberar
      // todas as regionais para um usuário restrito.
      console.error('[programacao-supervisoes-cache] falha ao resolver supervisões autorizadas.', error);
      lastResult = { data: [], error };
      return lastResult;
    }
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
