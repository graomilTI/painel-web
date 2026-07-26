// assets/js/core/supabaseService.js
// Camada padrão de acesso ao Supabase (fundação P0, item 2.4).
//
// Padroniza: filtros, paginação, ordenação, normalização, datas locais,
// cancelamento de requisição, cache com invalidação, retry e mensagens de
// erro. Os repositories dos módulos usam esta camada em vez de chamar
// supabase.from(...) diretamente dentro de funções de renderização.
//
// Regra do plano (2.3): nenhuma tela cai para dados locais ou demonstrativos
// quando o Supabase retorna erro — o erro é sempre propagado com mensagem
// legível para o design system exibir.

import { supabase } from '../supabaseClient.js';

export { supabase };

// ── Erros padronizados ───────────────────────────────────────────────────────
export class ServiceError extends Error {
  constructor(message, { code, details, tabela, causa } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code || null;
    this.details = details || null;
    this.tabela = tabela || null;
    this.causa = causa || null;
  }
}

const MENSAGENS = new Map([
  ['PGRST116', 'Registro não encontrado.'],
  ['PGRST301', 'Sessão expirada. Faça login novamente.'],
  ['23505', 'Registro duplicado: já existe um item com esses dados.'],
  ['23503', 'Não é possível concluir: o registro está vinculado a outros dados.'],
  ['42501', 'Sem permissão para executar esta ação.'],
  ['42P01', 'Estrutura ausente no banco: execute as migrations pendentes.'],
]);

export function mensagemDeErro(error, tabela) {
  if (!error) return 'Erro desconhecido.';
  const base = MENSAGENS.get(String(error.code)) || null;
  if (base) return base;
  const raw = String(error.message || error);
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  }
  if (/JWT|token/i.test(raw)) return 'Sessão expirada. Recarregue a página e faça login novamente.';
  return tabela ? `Erro ao consultar ${tabela}: ${raw}` : raw;
}

function lancar(error, tabela) {
  throw new ServiceError(mensagemDeErro(error, tabela), {
    code: error?.code, details: error?.details, tabela, causa: error,
  });
}

// ── Cache com invalidação ────────────────────────────────────────────────────
const cache = new Map(); // chave → { valor, expiraEm, tabelas:Set }

export function invalidarCache(tabelaOuChave) {
  for (const [chave, entry] of cache) {
    if (chave === tabelaOuChave || entry.tabelas?.has(tabelaOuChave)) cache.delete(chave);
  }
}

export function limparCache() { cache.clear(); }

// ── Cancelamento de requisições concorrentes ─────────────────────────────────
// Uma "chave de corrida" por listagem: se uma nova consulta com a mesma chave
// começar antes da anterior terminar, o resultado antigo é descartado.
const corridas = new Map();

function iniciarCorrida(chave) {
  const token = Symbol(chave);
  corridas.set(chave, token);
  return () => corridas.get(chave) === token;
}

// ── Retry com backoff para falhas transitórias ───────────────────────────────
async function comRetry(executar, { tentativas = 2, atrasoMs = 400 } = {}) {
  let ultimoErro = null;
  for (let i = 0; i <= tentativas; i += 1) {
    try {
      return await executar();
    } catch (error) {
      ultimoErro = error;
      const transitorio = /Failed to fetch|NetworkError|fetch failed|timeout|503|502/i
        .test(String(error?.message || error));
      if (!transitorio || i === tentativas) throw error;
      await new Promise((r) => setTimeout(r, atrasoMs * (i + 1)));
    }
  }
  throw ultimoErro;
}

// ── Normalização ─────────────────────────────────────────────────────────────
export function dataLocalISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function normalizarTexto(value = '') {
  return String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Consulta de listagem padronizada ─────────────────────────────────────────
/**
 * listar(tabela, opções)
 *
 * @param {string} tabela  Nome da tabela ou view
 * @param {object} opts
 *   select     — colunas (default '*')
 *   filtros    — array de { coluna, op, valor } (op: eq, neq, gte, lte, gt, lt, like, ilike, in, is, not )
 *   busca      — { colunas: [], termo } gera OR ilike
 *   ordenar    — array de { coluna, asc } (default created_at desc quando existir)
 *   pagina     — número da página (1-based)
 *   porPagina  — tamanho da página (default 50, com count exato)
 *   cacheMs    — cache do resultado por N milissegundos (invalidável por tabela)
 *   chaveCorrida — string p/ cancelar consultas anteriores da mesma tela
 * @returns {Promise<{rows, total, pagina, porPagina, cancelada}>}
 */
export async function listar(tabela, opts = {}) {
  const {
    select = '*', filtros = [], busca = null, ordenar = [],
    pagina = 1, porPagina = 50, cacheMs = 0, chaveCorrida = null, head = false,
  } = opts;

  const chaveCache = cacheMs > 0 ? `${tabela}:${JSON.stringify([select, filtros, busca, ordenar, pagina, porPagina])}` : null;
  if (chaveCache) {
    const hit = cache.get(chaveCache);
    if (hit && hit.expiraEm > Date.now()) return hit.valor;
  }

  const aindaValida = chaveCorrida ? iniciarCorrida(chaveCorrida) : () => true;

  const executar = async () => {
    let query = supabase.from(tabela).select(select, { count: 'exact', head });

    for (const f of filtros) {
      if (f == null || f.valor === undefined || f.valor === null || f.valor === '') continue;
      const op = f.op || 'eq';
      if (op === 'in') query = query.in(f.coluna, f.valor);
      else if (op === 'is') query = query.is(f.coluna, f.valor);
      else if (op === 'not') query = query.not(f.coluna, f.op2 || 'is', f.valor);
      else query = query[op](f.coluna, f.valor);
    }

    if (busca?.termo && busca?.colunas?.length) {
      const termo = String(busca.termo).replaceAll(',', ' ').trim();
      if (termo) {
        query = query.or(busca.colunas.map((c) => `${c}.ilike.%${termo}%`).join(','));
      }
    }

    const ordens = ordenar.length ? ordenar : [];
    for (const o of ordens) query = query.order(o.coluna, { ascending: o.asc !== false });

    if (porPagina > 0) {
      const de = (Math.max(1, pagina) - 1) * porPagina;
      query = query.range(de, de + porPagina - 1);
    }

    const { data, error, count } = await query;
    if (error) lancar(error, tabela);
    return { rows: data || [], total: count ?? (data?.length || 0), pagina, porPagina, cancelada: false };
  };

  const resultado = await comRetry(executar);

  if (!aindaValida()) return { ...resultado, cancelada: true };

  if (chaveCache) {
    cache.set(chaveCache, { valor: resultado, expiraEm: Date.now() + cacheMs, tabelas: new Set([tabela]) });
  }
  return resultado;
}

// ── Escritas padronizadas (sempre invalidam cache da tabela) ─────────────────
export async function inserir(tabela, payload, { select = '*' } = {}) {
  const { data, error } = await supabase.from(tabela).insert(payload).select(select);
  if (error) lancar(error, tabela);
  invalidarCache(tabela);
  return data;
}

export async function atualizar(tabela, filtros, payload, { select = '*' } = {}) {
  let query = supabase.from(tabela).update(payload);
  for (const f of filtros) {
    const op = f.op || 'eq';
    query = op === 'in' ? query.in(f.coluna, f.valor) : query[op](f.coluna, f.valor);
  }
  const { data, error } = await query.select(select);
  if (error) lancar(error, tabela);
  invalidarCache(tabela);
  return data;
}

export async function excluir(tabela, filtros) {
  let query = supabase.from(tabela).delete();
  for (const f of filtros) {
    const op = f.op || 'eq';
    query = op === 'in' ? query.in(f.coluna, f.valor) : query[op](f.coluna, f.valor);
  }
  const { error } = await query;
  if (error) lancar(error, tabela);
  invalidarCache(tabela);
}

export async function chamarRpc(nome, params = {}) {
  const { data, error } = await supabase.rpc(nome, params);
  if (error) lancar(error, `rpc:${nome}`);
  return data;
}
