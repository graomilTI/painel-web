// assets/js/modules/notas-fiscais/repository.js
// Única camada do módulo que fala com o Supabase (padrão docs/ARQUITETURA.md).

import { listar, atualizar } from '../../core/supabaseService.js';

const SELECT_ITENS = [
  'id', 'material', 'tipo', 'quantidade', 'unidade', 'valor_total',
  'comprado_em', 'nf_url', 'comprovante_url', 'nf_lancado', 'nf_lancado_em',
  'marca', 'tamanho',
  'compras_solicitacoes(solicitante, coordenacao, data_solicitacao, observacoes)',
].join(', ');

/**
 * Itens de compras com NF anexada (base das janelas Pendentes/Lançados).
 */
export async function listarItensComNf({ chaveCorrida } = {}) {
  const { rows } = await listar('compras_itens', {
    select: SELECT_ITENS,
    filtros: [
      { coluna: 'status', op: 'eq', valor: 'comprado' },
      { coluna: 'nf_url', op: 'not', op2: 'is', valor: null },
      { coluna: 'comprovante_url', op: 'not', op2: 'is', valor: null },
    ],
    ordenar: [{ coluna: 'comprado_em', asc: false }],
    pagina: 1,
    porPagina: 500,
    chaveCorrida,
  });
  return rows;
}

/**
 * Dados de pagamento (fornecedor, CNPJ, número da NF) vinculados aos itens.
 */
export async function listarPagamentosPorItens(ids) {
  if (!ids?.length) return {};
  const { rows } = await listar('financeiro_pagamentos', {
    select: 'origem_id, fornecedor, favorecido_nome, favorecido_documento, nf_numero',
    filtros: [
      { coluna: 'origem', op: 'eq', valor: 'COMPRAS' },
      { coluna: 'origem_id', op: 'in', valor: ids },
    ],
    porPagina: 0,
  });
  const mapa = {};
  for (const p of rows) {
    if (p.origem_id) mapa[p.origem_id] = p;
  }
  return mapa;
}

/**
 * Marca os itens de uma NF como lançados.
 */
export async function marcarItensLancados(ids, quandoISO) {
  return atualizar(
    'compras_itens',
    [{ coluna: 'id', op: 'in', valor: ids }],
    { nf_lancado: true, nf_lancado_em: quandoISO },
    { select: 'id' },
  );
}

/**
 * Estorna (reabre) os itens de uma NF lançada — volta para Pendentes (plano 6.5).
 */
export async function estornarItens(ids) {
  return atualizar(
    'compras_itens',
    [{ coluna: 'id', op: 'in', valor: ids }],
    { nf_lancado: false, nf_lancado_em: null },
    { select: 'id' },
  );
}

/**
 * Persiste dados extraídos da NF (OCR/XML) no pagamento correspondente.
 */
export async function salvarDadosNfNoPagamento(origemId, payload) {
  return atualizar(
    'financeiro_pagamentos',
    [
      { coluna: 'origem', op: 'eq', valor: 'COMPRAS' },
      { coluna: 'origem_id', op: 'eq', valor: origemId },
    ],
    payload,
    { select: 'origem_id' },
  );
}
