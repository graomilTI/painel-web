// Cache compartilhado de colaboradores (foto mais recente).
//
// Motivação: vários módulos faziam supabase.from('colaborador_snapshot')
// .select('*').limit(5000) e autocompletes com ilike '%nome%' a cada tela /
// tecla. Isso gerava ~20k consultas e era a query #1 em custo do banco.
//
// Este módulo busca a lista UMA vez (via view colaboradores_atuais), guarda em
// sessionStorage com TTL e serve todas as telas. Autocomplete passa a filtrar
// localmente, sem ir ao banco.
//
// Uso:
//   import { getColaboradores, searchColaboradores, invalidateColaboradores } from './colaboradoresCache.js';
//   const lista = await getColaboradores();              // array (cacheado)
//   const achados = await searchColaboradores('maria');  // filtro local por nome

import { supabase } from './supabaseClient.js';

const CACHE_KEY = 'grm:colaboradores_atuais:v1';
const TTL_MS = 10 * 60 * 1000; // 10 minutos

// Colunas suficientes para os módulos que hoje fazem select('*').
// Propositalmente NÃO inclui campos sensíveis (salario, conta_bancaria,
// data_nascimento, whatsapp, emails) — telas que precisam deles devem
// continuar com query própria.
const COLUNAS = 'id,nome,cpf,tipo,cargo,supervisao,coordenacao,empresa,situacao,ativo,data_referencia';

// Dedup de chamadas concorrentes na mesma página.
let inflight = null;

function lerCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || (Date.now() - ts) > TTL_MS) return null;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function gravarCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // sessionStorage cheio/indisponível — segue sem cache persistente.
  }
}

function normalizarAtivo(v) {
  const t = String(v ?? 'ativo').trim().toLowerCase();
  return !['false', '0', 'inativo', 'desligado', 'nao', 'não'].includes(t);
}

/**
 * Retorna a lista de colaboradores da foto mais recente (cacheada).
 * @param {{ force?: boolean, somenteAtivos?: boolean }} [opts]
 */
export async function getColaboradores(opts = {}) {
  const { force = false, somenteAtivos = false } = opts;

  if (!force) {
    const cache = lerCache();
    if (cache) return somenteAtivos ? cache.filter(c => normalizarAtivo(c.ativo)) : cache;
    if (inflight) {
      const data = await inflight;
      return somenteAtivos ? data.filter(c => normalizarAtivo(c.ativo)) : data;
    }
  }

  inflight = (async () => {
    // View já filtra a data_referencia mais recente no servidor.
    const { data, error } = await supabase
      .from('colaboradores_atuais')
      .select(COLUNAS)
      .order('nome', { ascending: true })
      .limit(10000);
    if (error) throw error;
    const lista = data || [];
    gravarCache(lista);
    return lista;
  })();

  try {
    const data = await inflight;
    return somenteAtivos ? data.filter(c => normalizarAtivo(c.ativo)) : data;
  } finally {
    inflight = null;
  }
}

/**
 * Busca local por nome (substitui autocompletes com ilike '%termo%').
 * @param {string} termo
 * @param {{ limite?: number, somenteAtivos?: boolean }} [opts]
 */
export async function searchColaboradores(termo, opts = {}) {
  const { limite = 60, somenteAtivos = true } = opts;
  const q = String(termo || '').trim().toLowerCase();
  const lista = await getColaboradores({ somenteAtivos });
  if (!q) return lista.slice(0, limite);
  return lista
    .filter(c => String(c.nome || '').toLowerCase().includes(q))
    .slice(0, limite);
}

/** Invalida o cache (ex.: após uma nova importação de colaboradores). */
export function invalidateColaboradores() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  inflight = null;
}
