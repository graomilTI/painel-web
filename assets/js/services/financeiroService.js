// ============================================================================
// financeiroService — serviço de domínio do Financeiro (plano 7.3 a 7.5)
//
// 7.3 fluxo de caixa com origem identificada e drill-down por KPI;
// 7.4 pagamentos consolidados sem duplicidade;
// 7.5 adiantamentos/alimentação/diárias como tipos do mesmo domínio.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'financeiro';

// ── 7.5 Tipos do mesmo domínio ───────────────────────────────────────────────
export const TIPOS_LANCAMENTO = [
  'compra', 'nota_fiscal', 'diaria', 'alimentacao', 'adiantamento',
  'hospedagem', 'frota', 'producao', 'outro',
];

export const REGIMES = ['efetivo', 'intermitente', 'diarista'];

/** Regras por regime (plano 7.5). */
export function regrasDoRegime(regime) {
  switch (regime) {
    case 'efetivo':
      return { diariaPermitida: false, alimentacaoPadrao: true, adiantamentoMaximoPct: 40 };
    case 'intermitente':
      return { diariaPermitida: true, alimentacaoPadrao: true, adiantamentoMaximoPct: 30 };
    case 'diarista':
      return { diariaPermitida: true, alimentacaoPadrao: false, adiantamentoMaximoPct: 0 };
    default:
      throw new Error(`Regime desconhecido: ${regime}.`);
  }
}

// ── 7.4 Pagamentos consolidados sem duplicidade ─────────────────────────────
/** Chave de deduplicação: origem + origem_id + valor + vencimento. */
function chaveDedup(p) {
  return [p.origem || '', p.origem_id || '', Number(p.valor || 0).toFixed(2), p.vencimento || ''].join('|');
}

export async function lancarPagamento(payload, { usuario = null } = {}) {
  for (const campo of ['origem', 'descricao', 'valor']) {
    if (payload[campo] == null || payload[campo] === '') {
      throw new Error(`Pagamento exige ${campo} (origem identificada — plano 7.3).`);
    }
  }
  if (payload.tipo && !TIPOS_LANCAMENTO.includes(payload.tipo)) {
    throw new Error(`Tipo de lançamento inválido: ${payload.tipo}.`);
  }
  // Deduplicação (plano 7.4): mesmo origem+id+valor+vencimento não entra 2x
  if (payload.origem_id) {
    const { rows } = await listar('financeiro_pagamentos', {
      filtros: [
        { coluna: 'origem', valor: payload.origem },
        { coluna: 'origem_id', valor: String(payload.origem_id) },
      ],
      porPagina: 50,
    }).catch(() => ({ rows: [] }));
    const nova = chaveDedup(payload);
    if ((rows || []).some((r) => chaveDedup(r) === nova)) {
      throw new Error('Lançamento duplicado: já existe pagamento com a mesma origem, valor e vencimento.');
    }
  }
  const linhas = await inserir('financeiro_pagamentos', { ...payload, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'financeiro_pagamentos', registroId: linha?.id,
    acao: 'pagamento_lancado', valorNovo: payload,
  });
  return linha;
}

export async function listarPagamentos({ filtros = [], pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('financeiro_pagamentos', {
    filtros,
    busca: busca ? { colunas: ['descricao', 'fornecedor', 'origem'], termo: busca } : null,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina, chaveCorrida: 'fin:pagamentos',
  });
}

// ── 7.3 Fluxo de caixa com drill-down ────────────────────────────────────────
/** Consolida os pagamentos por dimensão e devolve, para cada total, os
 *  registros que o formaram (drill-down obrigatório do plano 7.3). */
export async function fluxoDeCaixa({ inicio, fim, dimensao = 'categoria' } = {}) {
  const t0 = performance.now();
  const filtros = [];
  if (inicio) filtros.push({ coluna: 'vencimento', op: 'gte', valor: inicio });
  if (fim) filtros.push({ coluna: 'vencimento', op: 'lte', valor: fim });
  const { rows } = await listar('financeiro_pagamentos', { filtros, porPagina: 5000 });
  const grupos = new Map();
  for (const r of rows || []) {
    const chave = String(r[dimensao] || r.categoria || r.origem || 'Sem classificação');
    if (!grupos.has(chave)) grupos.set(chave, { chave, previsto: 0, realizado: 0, registros: [] });
    const g = grupos.get(chave);
    const valor = Number(r.valor || 0);
    if (String(r.status || '').toLowerCase().includes('pag')) g.realizado += valor;
    else g.previsto += valor;
    g.registros.push(r); // drill-down: registros que formaram o total
  }
  return {
    grupos: [...grupos.values()].sort((a, b) => (b.previsto + b.realizado) - (a.previsto + a.realizado)),
    totalPrevisto: [...grupos.values()].reduce((s, g) => s + g.previsto, 0),
    totalRealizado: [...grupos.values()].reduce((s, g) => s + g.realizado, 0),
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase · financeiro_pagamentos',
    duracaoMs: Math.round(performance.now() - t0),
  };
}

export async function pagarObrigacao(id, { usuario = null, comprovanteUrl = null } = {}) {
  const { rows } = await listar('financeiro_pagamentos', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const anterior = rows?.[0] || null;
  if (!anterior) throw new Error('Pagamento não encontrado.');
  if (String(anterior.status || '').toLowerCase().includes('pag')) {
    throw new Error('Esta obrigação já está paga.');
  }
  const linhas = await atualizar('financeiro_pagamentos', [{ coluna: 'id', valor: id }], {
    status: 'Paga', pago_em: new Date().toISOString(), comprovante_url: comprovanteUrl,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'financeiro_pagamentos', registroId: id, acao: 'obrigacao_paga',
    valorAnterior: { status: anterior.status }, valorNovo: { status: 'Paga', usuario },
  });
  return linhas?.[0] || null;
}
