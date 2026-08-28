// Cache compartilhado da base atual de colaboradores.
//
// Fonte principal: public.colaboradores, sincronizada automaticamente pelo
// agente grmserver-colaboradores-sync. A view colaboradores_atuais permanece
// apenas como fallback para ambientes que ainda não possuem a tabela nova.
//
// O cache guarda somente os campos cadastrais usados pelos módulos do painel;
// campos sensíveis da tabela não são persistidos no sessionStorage.

import { supabase } from './supabaseClient.js';

const CACHE_KEY = 'grm:colaboradores:v2';
const LEGACY_CACHE_KEY = 'grm:colaboradores_atuais:v1';
const TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 1000;

const CAMPOS_COMPLETOS = 'id,nome,cpf,tipo,cargo,supervisao,coordenacao,empresa,situacao,ativo';
const CAMPOS_MINIMOS = 'nome,cpf,tipo,supervisao,coordenacao,empresa,situacao';
const CAMPOS_FALLBACK = 'id,nome,cpf,tipo,cargo,supervisao,coordenacao,empresa,situacao,ativo,data_referencia';

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
    sessionStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // sessionStorage cheio/indisponível — segue sem cache persistente.
  }
}

function texto(value) {
  return String(value ?? '').trim();
}

function normalizarLinha(row = {}) {
  return {
    id: row.id ?? row.colaborador_id ?? null,
    nome: texto(row.nome ?? row.colaborador ?? row.funcionario),
    cpf: texto(row.cpf ?? row.documento),
    tipo: texto(row.tipo ?? row.tipo_colaborador),
    cargo: texto(row.cargo ?? row.funcao),
    supervisao: texto(row.supervisao ?? row.supervisor),
    coordenacao: texto(row.coordenacao ?? row.regional),
    empresa: texto(row.empresa),
    situacao: texto(row.situacao ?? row.status),
    ativo: row.ativo,
    data_referencia: row.data_referencia ?? null,
  };
}

function normalizarAtivo(row = {}) {
  if (typeof row.ativo === 'boolean') return row.ativo;
  if (typeof row.ativo === 'number') return row.ativo === 1;

  const valor = texto(row.ativo || row.situacao || 'ativo').toLowerCase();
  return ![
    'false', '0', 'inativo', 'inactive', 'desligado', 'demitido',
    'afastado definitivo', 'cancelado', 'nao', 'não',
  ].includes(valor);
}

function deduplicar(rows) {
  const mapa = new Map();
  for (const raw of rows || []) {
    const row = normalizarLinha(raw);
    const cpf = row.cpf.replace(/\D/g, '');
    const nome = row.nome.toLocaleLowerCase('pt-BR');
    const chave = cpf || nome || String(row.id || '');
    if (!chave || mapa.has(chave)) continue;
    mapa.set(chave, row);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function erroColunaAusente(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return error?.code === 'PGRST204'
    || msg.includes('schema cache')
    || msg.includes('could not find')
    || msg.includes('column');
}

async function buscarPaginado(tabela, colunas) {
  const rows = [];
  let inicio = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .order('nome', { ascending: true })
      .range(inicio, inicio + PAGE_SIZE - 1);

    if (error) throw error;
    const pagina = data || [];
    rows.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
    inicio += PAGE_SIZE;
  }

  return rows;
}

async function carregarFonteAtual() {
  try {
    return await buscarPaginado('colaboradores', CAMPOS_COMPLETOS);
  } catch (error) {
    if (!erroColunaAusente(error)) throw error;
    console.warn('[colaboradoresCache] Algumas colunas não existem em colaboradores; usando conjunto mínimo.', error);
    return buscarPaginado('colaboradores', CAMPOS_MINIMOS);
  }
}

async function carregarBase() {
  try {
    const rows = await carregarFonteAtual();
    return deduplicar(rows);
  } catch (errorAtual) {
    console.warn('[colaboradoresCache] Falha na tabela colaboradores; usando colaboradores_atuais.', errorAtual);
    const rows = await buscarPaginado('colaboradores_atuais', CAMPOS_FALLBACK);
    return deduplicar(rows);
  }
}

/**
 * Retorna a base atual de colaboradores.
 * @param {{ force?: boolean, somenteAtivos?: boolean }} [opts]
 */
export async function getColaboradores(opts = {}) {
  const { force = false, somenteAtivos = false } = opts;

  if (!force) {
    const cache = lerCache();
    if (cache) return somenteAtivos ? cache.filter(normalizarAtivo) : cache;
    if (inflight) {
      const data = await inflight;
      return somenteAtivos ? data.filter(normalizarAtivo) : data;
    }
  }

  inflight = carregarBase().then((lista) => {
    gravarCache(lista);
    return lista;
  });

  try {
    const data = await inflight;
    return somenteAtivos ? data.filter(normalizarAtivo) : data;
  } finally {
    inflight = null;
  }
}

/** Busca local por nome. */
export async function searchColaboradores(termo, opts = {}) {
  const { limite = 60, somenteAtivos = true } = opts;
  const q = texto(termo).toLocaleLowerCase('pt-BR');
  const lista = await getColaboradores({ somenteAtivos });
  if (!q) return lista.slice(0, limite);
  return lista
    .filter((c) => texto(c.nome).toLocaleLowerCase('pt-BR').includes(q))
    .slice(0, limite);
}

/** Invalida o cache após sincronização/importação. */
export function invalidateColaboradores() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {}
  inflight = null;
}
