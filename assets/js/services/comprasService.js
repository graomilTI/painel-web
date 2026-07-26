// ============================================================================
// comprasService — serviço de domínio de Compras (plano seção 7)
//
// 7.1 etapas padronizadas; 7.2 compra agrupada (grupo_compra, grupo_pagamento,
// grupo_nf) com obrigação única; histórico e auditoria em toda transição.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'compras';

// ── 7.1 Etapas padronizadas ──────────────────────────────────────────────────
export const ETAPAS_COMPRA = [
  'Solicitada', 'Em aprovação', 'Em cotação', 'Aprovada', 'Comprada',
  'Aguardando NF', 'Aguardando pagamento', 'Paga', 'Recebida', 'Finalizada', 'Cancelada',
];

/** Transições permitidas: sempre para frente na esteira, ou para Cancelada. */
export function transicaoValida(de, para) {
  if (para === 'Cancelada') return de !== 'Finalizada';
  const iDe = ETAPAS_COMPRA.indexOf(de);
  const iPara = ETAPAS_COMPRA.indexOf(para);
  return iDe >= 0 && iPara >= 0 && iPara > iDe;
}

export async function listarCompras({ etapa = null, pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('compras_itens', {
    filtros: etapa ? [{ coluna: 'status', valor: etapa }] : [],
    busca: busca ? { colunas: ['descricao', 'fornecedor', 'solicitante'], termo: busca } : null,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina, chaveCorrida: 'compras:lista',
  });
}

export async function moverCompra(id, novaEtapa, { usuario = null, observacao = null } = {}) {
  if (!ETAPAS_COMPRA.includes(novaEtapa)) throw new Error(`Etapa inválida: ${novaEtapa}.`);
  const { rows } = await listar('compras_itens', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const anterior = rows?.[0] || null;
  if (anterior && !transicaoValida(anterior.status, novaEtapa)) {
    throw new Error(`Transição de "${anterior.status}" para "${novaEtapa}" não é permitida.`);
  }
  const linhas = await atualizar('compras_itens', [{ coluna: 'id', valor: id }], {
    status: novaEtapa, updated_at: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'compras_itens', registroId: id, acao: 'compra_movida',
    valorAnterior: { status: anterior?.status }, valorNovo: { status: novaEtapa, observacao, usuario },
  });
  return linhas?.[0] || null;
}

// ── 7.2 Compra agrupada ──────────────────────────────────────────────────────
export async function criarGrupo({ tipo = 'grupo_compra', fornecedor, descricao = null, itensIds = [], usuario = null }) {
  if (!['grupo_compra', 'grupo_pagamento', 'grupo_nf'].includes(tipo)) {
    throw new Error(`Tipo de grupo inválido: ${tipo}.`);
  }
  if (!fornecedor) throw new Error('Grupo exige fornecedor vinculado.');
  const total = await totalDosItens(itensIds);
  const linhas = await inserir('compras_grupos', {
    tipo, fornecedor, descricao, itens_ids: itensIds.map(String), total, criado_por: usuario,
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'compras_grupos', registroId: linha?.id,
    acao: 'grupo_criado', valorNovo: { tipo, fornecedor, itensIds, total },
  });
  return linha;
}

export async function alterarItensDoGrupo(grupoId, { adicionar = [], remover = [], usuario = null } = {}) {
  const { rows } = await listar('compras_grupos', { filtros: [{ coluna: 'id', valor: grupoId }], porPagina: 1 });
  const grupo = rows?.[0];
  if (!grupo) throw new Error('Grupo não encontrado.');
  if (grupo.status !== 'Aberto') throw new Error('Só é possível alterar itens de grupos em aberto.');
  const atuais = new Set((grupo.itens_ids || []).map(String));
  adicionar.forEach((id) => atuais.add(String(id)));
  remover.forEach((id) => atuais.delete(String(id)));
  const novosIds = [...atuais];
  const total = await totalDosItens(novosIds);
  const linhas = await atualizar('compras_grupos', [{ coluna: 'id', valor: grupoId }], {
    itens_ids: novosIds, total, atualizado_por: usuario,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'compras_grupos', registroId: grupoId, acao: 'grupo_itens_alterados',
    valorAnterior: { itens: grupo.itens_ids, total: grupo.total },
    valorNovo: { itens: novosIds, total },
  });
  return linhas?.[0] || null;
}

/** Uma única obrigação financeira para o grupo (plano 7.2): itens do grupo
 *  não podem ser pagos separadamente. */
export async function gerarObrigacaoDoGrupo(grupoId, { usuario = null } = {}) {
  const { rows } = await listar('compras_grupos', { filtros: [{ coluna: 'id', valor: grupoId }], porPagina: 1 });
  const grupo = rows?.[0];
  if (!grupo) throw new Error('Grupo não encontrado.');
  if (grupo.pagamento_id) throw new Error('Este grupo já possui obrigação de pagamento gerada.');
  const pagamento = await inserir('financeiro_pagamentos', {
    origem: 'compras_grupo',
    origem_id: grupoId,
    descricao: `Grupo de compra — ${grupo.fornecedor}`,
    fornecedor: grupo.fornecedor,
    valor: grupo.total,
    status: 'Aguardando NF',
    criado_por: usuario,
  });
  const pg = pagamento?.[0] || null;
  await atualizar('compras_grupos', [{ coluna: 'id', valor: grupoId }], {
    pagamento_id: pg?.id ? String(pg.id) : null, status: 'Aguardando NF',
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'compras_grupos', registroId: grupoId,
    acao: 'obrigacao_unica_gerada', valorNovo: { pagamentoId: pg?.id, total: grupo.total },
  });
  return pg;
}

async function totalDosItens(itensIds = []) {
  if (!itensIds.length) return 0;
  const { rows } = await listar('compras_itens', {
    filtros: [{ coluna: 'id', op: 'in', valor: itensIds }],
    porPagina: 1000,
  }).catch(() => ({ rows: [] }));
  return (rows || []).reduce((s, r) => s + Number(r.valor || r.valor_total || 0), 0);
}
