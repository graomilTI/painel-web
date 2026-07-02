// Programação: usa a relação programacao_usuario_supervisoes/RPC para não buscar todas as supervisões a cada carregamento.
import { supabase } from './supabaseClient.js';
import './programacao-extras-inline.js?v=20260629-extras1';

const CACHE_KEY = 'programacao_supervisoes_v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const originalFrom = supabase.from.bind(supabase);
const originalRpc = supabase.rpc.bind(supabase);
let pending = null;
let lastResult = null;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    if (Date.now() - Number(parsed.ts || 0) > CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch (_) {
    return null;
  }
}

function writeCache(rows) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
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
  const cached = readCache();
  if (cached?.length) return { data: cached, error: null, fromCache: true };

  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await originalRpc('programacao_listar_supervisoes');
      if (error) throw error;
      const rows = normalizeRows(data);
      if (rows.length) {
        writeCache(rows);
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
    if (!fallback.error && rows.length) writeCache(rows);
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
  clear() {
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
    lastResult = null;
  },
  getLast() { return lastResult; },
};
