// ============================================================================
// logisticaApoioService — informativos/NHE, classificadores e exportações
// (plano 4.7, 4.8 e 4.9)
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'logistica';

// ── 4.7 Informativos e NHE — parâmetros registrados por geração ─────────────
export async function registrarGeracaoInformativo({
  tipo, periodoInicio, periodoFim, minimoCargas = null,
  origem = 'manual', parametros = {}, arquivoUrl = null, geradoPor = null,
}) {
  if (!['Volume de Embarques', 'NHE'].includes(tipo)) {
    throw new Error(`Tipo de informativo inválido: ${tipo}.`);
  }
  const linhas = await inserir('logistica_informativos_geracoes', {
    tipo,
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
    minimo_cargas: minimoCargas,
    origem,
    parametros,
    arquivo_url: arquivoUrl,
    gerado_por: geradoPor,
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_informativos_geracoes', registroId: linha?.id,
    acao: 'informativo_gerado', valorNovo: { tipo, periodoInicio, periodoFim, minimoCargas, origem },
  });
  return linha;
}

export async function historicoInformativos({ tipo = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('logistica_informativos_geracoes', {
    filtros: tipo ? [{ coluna: 'tipo', valor: tipo }] : [],
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina,
  });
}

// ── 4.8 Classificadores — monitoramento com escalonamento ────────────────────
export const RESPOSTAS_CLASSIFICADOR = ['ativo', 'finalizado', 'embarque suspenso'];

export async function listarMonitorClassificadores({ situacao = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('logistica_classificadores_monitor', {
    filtros: situacao ? [{ coluna: 'situacao', valor: situacao }] : [],
    ordenar: [{ coluna: 'updated_at', asc: false }],
    pagina, porPagina,
  });
}

export async function registrarRespostaClassificador(id, resposta, { usuario = null } = {}) {
  const normalizada = String(resposta || '').trim().toLowerCase();
  if (!RESPOSTAS_CLASSIFICADOR.includes(normalizada)) {
    throw new Error(`Resposta não reconhecida: "${resposta}". Aceitas: ${RESPOSTAS_CLASSIFICADOR.join(', ')}.`);
  }
  const situacao = normalizada === 'ativo' ? 'Ativa'
    : normalizada === 'finalizado' ? 'Finalizada' : 'Embarque suspenso';
  const linhas = await atualizar('logistica_classificadores_monitor', [{ coluna: 'id', valor: id }], {
    resposta: normalizada, resposta_em: new Date().toISOString(), situacao,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_classificadores_monitor', registroId: id,
    acao: 'resposta_classificador', valorNovo: { resposta: normalizada, situacao, usuario },
  });
  return linhas?.[0] || null;
}

export async function escalonarMonitor(id, { para, usuario = null } = {}) {
  if (!para) throw new Error('Informe para quem escalonar.');
  const linhas = await atualizar('logistica_classificadores_monitor', [{ coluna: 'id', valor: id }], {
    escalonado: true, escalonado_para: para, situacao: 'Escalonada',
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_classificadores_monitor', registroId: id,
    acao: 'monitor_escalonado', valorNovo: { para, usuario },
  });
  return linhas?.[0] || null;
}

// ── 4.9 Exportações — fluxo padronizado com histórico ────────────────────────
export async function registrarExportacao({
  tipo, parametros = {}, arquivoUrl = null, destinatarios = [],
  enviadoEmail = false, geradoPor = null,
}) {
  const { rows: anteriores } = await listar('logistica_exportacoes_historico', {
    filtros: [{ coluna: 'tipo', valor: tipo }],
    ordenar: [{ coluna: 'versao', asc: false }], porPagina: 1,
  }).catch(() => ({ rows: [] }));
  const versao = (anteriores?.[0]?.versao || 0) + 1;
  const linhas = await inserir('logistica_exportacoes_historico', {
    tipo, parametros, versao,
    arquivo_url: arquivoUrl,
    destinatarios,
    enviado_email: enviadoEmail,
    enviado_em: enviadoEmail ? new Date().toISOString() : null,
    gerado_por: geradoPor,
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'logistica_exportacoes_historico', registroId: linha?.id,
    acao: 'exportacao_registrada', valorNovo: { tipo, versao, destinatarios, enviadoEmail },
  });
  return linha;
}

export async function historicoExportacoes({ tipo = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('logistica_exportacoes_historico', {
    filtros: tipo ? [{ coluna: 'tipo', valor: tipo }] : [],
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina,
  });
}
