// ============================================================================
// logisticaService — serviço de domínio da Logística (plano 2.4 e seção 4)
//
// Centraliza consultas e regras de OS (abertura, conferência, ajuste,
// finalização) em cima da camada padrão. Regras objetivas do plano:
//   4.2 fluxo da solicitação: Solicitada → Em análise → Dados incompletos →
//       OS aberta → Recusada, mantendo o vínculo com a solicitação original;
//   4.4 ajuste de saldo com anexo obrigatório por cliente configurado em
//       banco (não em código);
//   4.5 OS finalizada sai das contagens de abertas;
//   4.6 FOB é descrição de serviço, não cliente.
// ============================================================================

import {
  listar, inserir, atualizar, invalidarCache,
} from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'logistica';

// ── Abertura de OS (plano 4.2) ───────────────────────────────────────────────
export const STATUS_SOLICITACAO = ['Solicitada', 'Em análise', 'Dados incompletos', 'OS aberta', 'Recusada'];

export const CAMPOS_ABERTURA = [
  'cliente', 'filial', 'produtor', 'armazem', 'cidade_embarque', 'cidade_destino',
  'local_destino', 'numero_contrato', 'produto', 'tipo_produto', 'volume_inicial',
  'solicitante', 'data',
];

export function validarAbertura(payload) {
  const faltando = CAMPOS_ABERTURA.filter((campo) => {
    const v = payload[campo];
    return v == null || v === '';
  });
  return { valido: faltando.length === 0, faltando };
}

export async function listarSolicitacoes({ status = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('logistica_abertura_os', {
    filtros: status ? [{ coluna: 'status', valor: status }] : [],
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina, chaveCorrida: 'log:solicitacoes',
  });
}

export async function moverSolicitacao(id, novoStatus, { observacao = null } = {}) {
  if (!STATUS_SOLICITACAO.includes(novoStatus)) throw new Error(`Status inválido: ${novoStatus}.`);
  const { rows } = await listar('logistica_abertura_os', {
    filtros: [{ coluna: 'id', valor: id }], porPagina: 1,
  });
  const anterior = rows?.[0] || null;
  const linhas = await atualizar('logistica_abertura_os', [{ coluna: 'id', valor: id }], {
    status: novoStatus, observacao_status: observacao, updated_at: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_abertura_os', registroId: id, acao: 'solicitacao_movida',
    valorAnterior: { status: anterior?.status }, valorNovo: { status: novoStatus, observacao },
  });
  return linhas?.[0] || null;
}

// ── OS (contagens e finalização — plano 4.5) ────────────────────────────────
/** Lista OS. Por padrão exclui finalizadas das contagens de abertas. */
export async function listarOs({ incluirFinalizadas = false, pagina = 1, porPagina = 50, busca = '' } = {}) {
  const filtros = [];
  if (!incluirFinalizadas) {
    filtros.push({ coluna: 'status', op: 'not', op2: 'ilike', valor: 'finalizada%' });
  }
  return listar('operacional_os', {
    filtros,
    busca: busca ? { colunas: ['numero_os', 'cliente', 'cidade', 'local'], termo: busca } : null,
    ordenar: [{ coluna: 'numero_os', asc: false }],
    pagina, porPagina, chaveCorrida: 'log:os',
  });
}

export async function finalizarOs(id, {
  volumeInicial = null, volumeRealizado = null, statusExterno = null,
  motivo = null, observacao = null,
} = {}) {
  const { rows } = await listar('operacional_os', {
    filtros: [{ coluna: 'id', valor: id }], porPagina: 1,
  });
  const anterior = rows?.[0] || null;
  const payload = {
    status: 'FINALIZADA',
    finalizada_em: new Date().toISOString(),
    volume_realizado: volumeRealizado,
    status_externo: statusExterno,
    motivo_finalizacao: motivo,
    observacao_finalizacao: observacao,
  };
  if (volumeInicial != null && volumeRealizado != null) {
    payload.remanescente = Math.max(0, Number(volumeInicial) - Number(volumeRealizado));
  }
  const linhas = await atualizar('operacional_os', [{ coluna: 'id', valor: id }], payload);
  await registrarAuditoria({
    modulo: MODULO, tabela: 'operacional_os', registroId: id, acao: 'os_finalizada',
    valorAnterior: { status: anterior?.status }, valorNovo: payload,
  });
  return linhas?.[0] || null;
}

// ── Ajuste de saldo (plano 4.4) ─────────────────────────────────────────────
/** Clientes com anexo obrigatório ficam no banco (tabela de configuração),
 *  nunca em listas dentro do código. */
export async function clientesComAnexoObrigatorio() {
  try {
    const { rows } = await listar('logistica_ajuste_config', {
      filtros: [{ coluna: 'anexo_obrigatorio', valor: true }],
      porPagina: 500, cacheMs: 300_000,
    });
    return (rows || []).map((r) => String(r.cliente || '').trim().toUpperCase());
  } catch {
    return []; // tabela de configuração ainda não criada — nenhum cliente obrigatório
  }
}

export async function solicitarAjusteSaldo(payload) {
  const obrigatorios = await clientesComAnexoObrigatorio();
  const cliente = String(payload.cliente || '').trim().toUpperCase();
  if (obrigatorios.includes(cliente) && !payload.anexo_url) {
    throw new Error(`O cliente ${payload.cliente} exige anexo no ajuste de saldo.`);
  }
  for (const campo of ['os_id', 'saldo_anterior', 'saldo_solicitado', 'motivo', 'solicitante']) {
    if (payload[campo] == null || payload[campo] === '') {
      throw new Error(`Ajuste de saldo exige ${campo.replace(/_/g, ' ')}.`);
    }
  }
  const linhas = await inserir('logistica_ajustes_saldo', { ...payload, status: payload.status || 'Solicitado' });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_ajustes_saldo', registroId: linha?.id,
    acao: 'ajuste_saldo_solicitado', valorNovo: payload,
  });
  return linha;
}

// ── FOB (plano 4.6) ──────────────────────────────────────────────────────────
/** FOB é serviço, não cliente: helper único para filtros e relatórios. */
export function ehFob(registro = {}) {
  const servico = String(registro.servico || registro.descricao_servico || registro.tipo_servico || '').toUpperCase();
  return servico.includes('FOB');
}

/** Remove interpretações de FOB como cliente em listas de clientes. */
export function filtrarClientesReais(clientes = []) {
  return clientes.filter((c) => String(c || '').trim().toUpperCase() !== 'FOB');
}

// ── Conferência (plano 4.3) ──────────────────────────────────────────────────
export async function registrarConferencia(payload) {
  for (const campo of ['os_id', 'arquivo_url', 'usuario']) {
    if (!payload[campo]) throw new Error(`Conferência exige ${campo.replace(/_/g, ' ')}.`);
  }
  const linhas = await inserir('logistica_conferencias', {
    ...payload,
    status: payload.status || 'Enviado',
    data_envio: payload.data_envio || new Date().toISOString(),
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_conferencias', registroId: linha?.id,
    acao: 'laudo_recebido', valorNovo: payload,
  });
  return linha;
}

export async function decidirConferencia(id, decisao, { observacao = null, responsavel = null } = {}) {
  const permitidas = ['Aprovado', 'Devolvido', 'Correção solicitada'];
  if (!permitidas.includes(decisao)) throw new Error(`Decisão inválida: ${decisao}.`);
  const linhas = await atualizar('logistica_conferencias', [{ coluna: 'id', valor: id }], {
    status: decisao, observacao, responsavel,
    data_conferencia: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_conferencias', registroId: id, acao: 'conferencia_decidida',
    valorNovo: { status: decisao, observacao, responsavel },
  });
  return linhas?.[0] || null;
}
