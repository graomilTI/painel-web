// ============================================================================
// relatoriosService — Relatórios, Diretoria e módulos de apoio (plano seção 12)
//
// 12.1 registro padronizado de importações; 12.2 métricas com definição,
// origem e drill-down; 12.3 propostas comerciais versionadas; 12.4 correios;
// 12.5 auditoria pesquisável com diff anterior/novo.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

// ── 12.1 Importações ─────────────────────────────────────────────────────────
export async function registrarImportacao(payload, { usuario = null } = {}) {
  if (!payload.fonte) throw new Error('Importação exige a fonte.');
  const linhas = await inserir('importacoes_registros', { ...payload, responsavel: payload.responsavel || usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: 'importacoes', tabela: 'importacoes_registros', registroId: linha?.id,
    acao: 'importacao_registrada', valorNovo: payload,
  });
  return linha;
}

export async function historicoImportacoes({ fonte = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('importacoes_registros', {
    filtros: fonte ? [{ coluna: 'fonte', valor: fonte }] : [],
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina,
  });
}

// ── 12.2 Diretoria — métricas documentadas com drill-down ────────────────────
/** Catálogo de métricas: toda métrica tem definição e origem documentadas
 *  (plano 12.2). O campo `consulta` devolve os registros que formam o valor. */
export const METRICAS = [
  {
    id: 'nf_lancadas_mes',
    nome: 'Notas fiscais lançadas no mês',
    definicao: 'Itens de compra com NF lançada (nf_lancado = true) cujo lançamento ocorreu no mês corrente.',
    origem: 'Supabase · compras_itens',
    consulta: () => listar('compras_itens', {
      filtros: [
        { coluna: 'nf_lancado', valor: true },
        { coluna: 'nf_lancado_em', op: 'gte', valor: `${new Date().toISOString().slice(0, 7)}-01` },
      ],
      porPagina: 1000,
    }),
  },
  {
    id: 'pagamentos_pendentes',
    nome: 'Pagamentos pendentes',
    definicao: 'Obrigações financeiras cujo status ainda não é Paga.',
    origem: 'Supabase · financeiro_pagamentos',
    consulta: () => listar('financeiro_pagamentos', {
      filtros: [{ coluna: 'status', op: 'neq', valor: 'Paga' }],
      porPagina: 1000,
    }),
  },
  {
    id: 'reservas_ativas',
    nome: 'Hospedagens em andamento',
    definicao: 'Reservas com status Reservada ou Em andamento.',
    origem: 'Supabase · hospedagem_reservas',
    consulta: () => listar('hospedagem_reservas', {
      filtros: [{ coluna: 'status', op: 'in', valor: ['Reservada', 'Em andamento'] }],
      porPagina: 1000,
    }),
  },
  {
    id: 'ocorrencias_gps_abertas',
    nome: 'Ocorrências de GPS abertas',
    definicao: 'Ocorrências de rastreamento sem tratativa concluída.',
    origem: 'Supabase · frotas_gps_ocorrencias',
    consulta: () => listar('frotas_gps_ocorrencias', {
      filtros: [{ coluna: 'status', op: 'neq', valor: 'Concluída' }],
      porPagina: 1000,
    }),
  },
];

/** Calcula uma métrica e devolve valor + registros (drill-down do plano 12.2). */
export async function calcularMetrica(idMetrica) {
  const metrica = METRICAS.find((m) => m.id === idMetrica);
  if (!metrica) throw new Error(`Métrica não catalogada: ${idMetrica}.`);
  const t0 = performance.now();
  const { rows, total } = await metrica.consulta();
  return {
    id: metrica.id, nome: metrica.nome,
    definicao: metrica.definicao, origem: metrica.origem,
    valor: total ?? (rows || []).length,
    registros: rows || [],
    atualizadoEm: new Date().toISOString(),
    duracaoMs: Math.round(performance.now() - t0),
  };
}

// ── 12.3 Comercial — propostas ───────────────────────────────────────────────
export async function listarPropostas({ status = null, pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('comercial_propostas', {
    filtros: status ? [{ coluna: 'status', valor: status }] : [],
    busca: busca ? { colunas: ['cliente', 'responsavel'], termo: busca } : null,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina,
  });
}

export async function salvarProposta(payload, { usuario = null } = {}) {
  if (!payload.cliente) throw new Error('Proposta exige cliente.');
  let linha;
  if (payload.id) {
    const { rows } = await listar('comercial_propostas', { filtros: [{ coluna: 'id', valor: payload.id }], porPagina: 1 });
    const anterior = rows?.[0];
    const versao = (anterior?.versao || 0) + 1; // toda alteração gera versão (12.3)
    const linhas = await atualizar('comercial_propostas', [{ coluna: 'id', valor: payload.id }], { ...payload, versao });
    linha = linhas?.[0] || null;
    await registrarAuditoria({
      modulo: 'comercial', tabela: 'comercial_propostas', registroId: payload.id, acao: 'proposta_atualizada',
      valorAnterior: anterior, valorNovo: { ...payload, versao },
    });
  } else {
    const linhas = await inserir('comercial_propostas', { ...payload, criado_por: usuario });
    linha = linhas?.[0] || null;
    await registrarAuditoria({
      modulo: 'comercial', tabela: 'comercial_propostas', registroId: linha?.id,
      acao: 'proposta_criada', valorNovo: payload,
    });
  }
  return linha;
}

export async function aprovarProposta(id, { aprovadaPor, arquivoFinalUrl = null } = {}) {
  if (!aprovadaPor) throw new Error('Informe quem aprovou a proposta.');
  const linhas = await atualizar('comercial_propostas', [{ coluna: 'id', valor: id }], {
    aprovada: true, aprovada_por: aprovadaPor, aprovada_em: new Date().toISOString(),
    arquivo_final_url: arquivoFinalUrl, status: 'Aprovada',
  });
  await registrarAuditoria({
    modulo: 'comercial', tabela: 'comercial_propostas', registroId: id,
    acao: 'proposta_aprovada', valorNovo: { aprovadaPor },
  });
  return linhas?.[0] || null;
}

// ── 12.4 Correios ────────────────────────────────────────────────────────────
export async function listarEnvios({ tipo = null, pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('correios_envios', {
    filtros: tipo ? [{ coluna: 'tipo', valor: tipo }] : [],
    busca: busca ? { colunas: ['destinatario', 'codigo_rastreio'], termo: busca } : null,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina,
  });
}

export async function registrarEnvio(payload, { usuario = null } = {}) {
  if (!payload.destinatario) throw new Error('Envio exige destinatário.');
  const historico = [{ status: payload.status || 'Postado', em: new Date().toISOString(), por: usuario }];
  const linhas = await inserir('correios_envios', { ...payload, historico, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: 'correios', tabela: 'correios_envios', registroId: linha?.id,
    acao: 'envio_registrado', valorNovo: payload,
  });
  return linha;
}

export async function atualizarStatusEnvio(id, novoStatus, { usuario = null } = {}) {
  const { rows } = await listar('correios_envios', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const anterior = rows?.[0];
  if (!anterior) throw new Error('Envio não encontrado.');
  const historico = [...(anterior.historico || []), { status: novoStatus, em: new Date().toISOString(), por: usuario }];
  const linhas = await atualizar('correios_envios', [{ coluna: 'id', valor: id }], { status: novoStatus, historico });
  await registrarAuditoria({
    modulo: 'correios', tabela: 'correios_envios', registroId: id, acao: 'envio_status',
    valorAnterior: { status: anterior.status }, valorNovo: { status: novoStatus },
  });
  return linhas?.[0] || null;
}

// ── 12.5 Auditoria pesquisável ───────────────────────────────────────────────
/** Pesquisa unificada de auditoria com todos os filtros do plano 12.5.
 *  Consulta app_auditoria (definitiva) e cai para app_logs_usuarios se a
 *  migration ainda não tiver sido aplicada. */
export async function pesquisarAuditoria({
  usuario = null, modulo = null, acao = null, registro = null,
  inicio = null, fim = null, ip = null, dispositivo = null,
  resultado = null, erro = null, pagina = 1, porPagina = 50,
} = {}) {
  const filtros = [];
  if (usuario) filtros.push({ coluna: 'usuario_email', op: 'ilike', valor: `%${usuario}%` });
  if (modulo) filtros.push({ coluna: 'modulo', valor: modulo });
  if (acao) filtros.push({ coluna: 'acao', op: 'ilike', valor: `%${acao}%` });
  if (registro) filtros.push({ coluna: 'registro_id', op: 'ilike', valor: `%${registro}%` });
  if (inicio) filtros.push({ coluna: 'created_at', op: 'gte', valor: inicio });
  if (fim) filtros.push({ coluna: 'created_at', op: 'lte', valor: `${fim}T23:59:59` });
  if (ip) filtros.push({ coluna: 'ip', op: 'ilike', valor: `%${ip}%` });
  if (dispositivo) filtros.push({ coluna: 'dispositivo', op: 'ilike', valor: `%${dispositivo}%` });
  if (resultado) filtros.push({ coluna: 'resultado', valor: resultado });
  if (erro) filtros.push({ coluna: 'erro', op: 'ilike', valor: `%${erro}%` });

  try {
    return await listar('app_auditoria', {
      filtros, ordenar: [{ coluna: 'created_at', asc: false }], pagina, porPagina,
    });
  } catch {
    // Fallback: app_logs_usuarios (colunas ligeiramente diferentes)
    const filtrosFallback = [];
    if (usuario) filtrosFallback.push({ coluna: 'usuario_email', op: 'ilike', valor: `%${usuario}%` });
    if (modulo) filtrosFallback.push({ coluna: 'modulo', op: 'ilike', valor: `%${modulo}%` });
    if (acao) filtrosFallback.push({ coluna: 'acao', op: 'ilike', valor: `%${acao}%` });
    if (inicio) filtrosFallback.push({ coluna: 'created_at', op: 'gte', valor: inicio });
    if (fim) filtrosFallback.push({ coluna: 'created_at', op: 'lte', valor: `${fim}T23:59:59` });
    return listar('app_logs_usuarios', {
      filtros: filtrosFallback, ordenar: [{ coluna: 'created_at', asc: false }], pagina, porPagina,
    });
  }
}

/** Monta a comparação anterior × novo campo a campo para exibição (12.5). */
export function compararValores(valorAnterior, valorNovo) {
  const antes = valorAnterior || {};
  const depois = valorNovo || {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  return campos.map((campo) => ({
    campo,
    anterior: antes[campo] !== undefined ? JSON.stringify(antes[campo]) : '—',
    novo: depois[campo] !== undefined ? JSON.stringify(depois[campo]) : '—',
    alterado: JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  })).filter((c) => c.alterado || campos.length <= 5 ? true : c.alterado);
}
