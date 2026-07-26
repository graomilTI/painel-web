// ============================================================================
// tiService — serviço de domínio de TI (plano seção 11)
//
// 11.1 agentes com diagnóstico completo e ações; 11.2 integrações com status
// e teste SEM expor credenciais no frontend (as chaves ficam na VPS);
// 11.3 central de e-mails com fluxo padronizado; 11.4 notificações com
// deduplicação por chave.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'ti';

// ── 11.1 Agentes ─────────────────────────────────────────────────────────────
export async function listarAgentes() {
  // Não há tabela de catálogo: os agentes são derivados dos jobs registrados
  const { rows } = await listar('grm_sync_jobs', {
    ordenar: [{ coluna: 'created_at', asc: false }], porPagina: 500,
  }).catch(() => ({ rows: [] }));
  const mapa = new Map();
  for (const j of rows || []) {
    const id = String(j.agente_id || j.agente || 'desconhecido');
    if (!mapa.has(id)) {
      mapa.set(id, {
        id, nome: j.agente_nome || id, ultimoJob: j,
        totalJobs: 0, comErro: 0,
      });
    }
    const a = mapa.get(id);
    a.totalJobs += 1;
    if (j.erro) a.comErro += 1;
  }
  return { rows: [...mapa.values()], total: mapa.size };
}

export async function listarJobs({ agenteId = null, status = null, pagina = 1, porPagina = 50 } = {}) {
  const filtros = [];
  if (agenteId) filtros.push({ coluna: 'agente_id', valor: String(agenteId) });
  if (status) filtros.push({ coluna: 'status', valor: status });
  return listar('grm_sync_jobs', {
    filtros,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina, chaveCorrida: 'ti:jobs',
  });
}

/** Monta o diagnóstico completo de um job (plano 11.1) pronto para copiar. */
export function diagnosticoDoJob(job) {
  const duracao = job.iniciado_em && job.finalizado_em
    ? `${Math.round((new Date(job.finalizado_em) - new Date(job.iniciado_em)) / 1000)}s`
    : null;
  return [
    `Agente: ${job.agente_nome || job.agente_id || '-'}`,
    `Job: ${job.id}`,
    `Status: ${job.status || '-'}`,
    `Criado em: ${job.created_at || '-'}`,
    `Iniciado em: ${job.iniciado_em || '-'}`,
    `Finalizado em: ${job.finalizado_em || '-'}`,
    `Duração: ${duracao || '-'}`,
    `Progresso: ${job.progresso != null ? `${job.progresso}%` : '-'}`,
    `Tentativas: ${job.tentativas ?? '-'}`,
    `Próximo processamento: ${job.proximo_processamento || '-'}`,
    `Dados processados: ${job.dados_processados ?? job.registros_processados ?? '-'}`,
    `Erro: ${job.erro || '-'}`,
    `stdout: ${job.stdout || '-'}`,
    `stderr: ${job.stderr || '-'}`,
  ].join('\n');
}

export async function solicitarExecucao(agenteId, { usuario = null } = {}) {
  const linhas = await inserir('grm_sync_jobs', {
    agente_id: String(agenteId), status: 'pendente', solicitado_por: usuario,
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'grm_sync_jobs', registroId: linha?.id,
    acao: 'agente_execucao_solicitada', valorNovo: { agenteId, usuario },
  });
  return linha;
}

export async function reprocessarJob(jobId, { usuario = null } = {}) {
  const linhas = await atualizar('grm_sync_jobs', [{ coluna: 'id', valor: jobId }], {
    status: 'pendente', erro: null, tentativas: 0,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'grm_sync_jobs', registroId: jobId,
    acao: 'job_reprocessado', valorNovo: { usuario },
  });
  return linhas?.[0] || null;
}

export async function cancelarJob(jobId, { usuario = null } = {}) {
  const { rows } = await listar('grm_sync_jobs', { filtros: [{ coluna: 'id', valor: jobId }], porPagina: 1 });
  const job = rows?.[0];
  if (!job) throw new Error('Job não encontrado.');
  if (!['pendente', 'executando'].includes(String(job.status || '').toLowerCase())) {
    throw new Error(`Só é possível cancelar jobs pendentes ou em execução (status atual: ${job.status}).`);
  }
  const linhas = await atualizar('grm_sync_jobs', [{ coluna: 'id', valor: jobId }], {
    status: 'cancelado', finalizado_em: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'grm_sync_jobs', registroId: jobId,
    acao: 'job_cancelado', valorAnterior: { status: job.status }, valorNovo: { status: 'cancelado', usuario },
  });
  return linhas?.[0] || null;
}

// ── 11.2 Integrações — status sem expor credenciais ──────────────────────────
/** Catálogo de integrações. As credenciais NÃO ficam aqui: vivem apenas nos
 *  workers da VPS. O frontend exibe somente status e metadados. */
export const INTEGRACOES = [
  {
    id: 'grm', nome: 'GRM Server', descricao: 'Sincronização de colaboradores, OS e operações do GRM.',
    agentePadrao: 'grm-sync', credencialLocal: 'VPS · /home/grao100/painel-scripts/grm-sync/.env',
  },
  {
    id: 'bfleet', nome: 'BFleet (RedGPS)', descricao: 'Rastreamento de veículos da frota via WebService RedGPS.',
    agentePadrao: 'bfleet-sync', credencialLocal: 'VPS · variável BFLEET_API_KEY',
  },
  {
    id: 'botconversa', nome: 'BotConversa', descricao: 'Automação de WhatsApp para notificações e classificadores.',
    agentePadrao: 'botconversa-sync', credencialLocal: 'VPS · variável BOTCONVERSA_API_KEY',
  },
  {
    id: 'email', nome: 'Central de E-mails', descricao: 'Sincronização IMAP das contas de e-mail corporativas.',
    agentePadrao: 'email-worker', credencialLocal: 'VPS · /home/grao100/painel-scripts/email-worker/.env',
  },
  {
    id: 'uber', nome: 'Uber (planilhas)', descricao: 'Importação de corridas corporativas.',
    agentePadrao: null, credencialLocal: 'Importação manual — sem credencial',
  },
];

/** Status de cada integração calculado a partir dos jobs (última/próxima execução, erro). */
export async function statusDasIntegracoes() {
  const t0 = performance.now();
  const { rows: jobs } = await listar('grm_sync_jobs', {
    ordenar: [{ coluna: 'created_at', asc: false }], porPagina: 500,
  }).catch(() => ({ rows: [] }));
  const { rows: statusRows } = await listar('botconversa_jobs', {
    ordenar: [{ coluna: 'created_at', asc: false }], porPagina: 50,
  }).catch(() => ({ rows: [] }));

  return {
    integracoes: INTEGRACOES.map((integ) => {
      const jobsInteg = (jobs || []).filter((j) => String(j.agente_id || j.agente || '').includes(integ.agentePadrao || '§'));
      const ultimo = jobsInteg[0] || null;
      const comErro = jobsInteg.find((j) => j.erro);
      const stBot = integ.id === 'botconversa' ? (statusRows || [])[0] : null;
      return {
        ...integ,
        status: ultimo ? (ultimo.erro ? 'erro' : String(ultimo.status || 'ok'))
          : (stBot ? String(stBot.status || 'ok') : 'sem execuções'),
        ultimaExecucao: ultimo?.finalizado_em || ultimo?.iniciado_em || ultimo?.created_at || stBot?.created_at || null,
        proximaExecucao: ultimo?.proximo_processamento || null,
        erro: comErro?.erro || null,
        credencialConfigurada: integ.agentePadrao != null,
        totalJobs: jobsInteg.length,
      };
    }),
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase · grm_sync_jobs',
    duracaoMs: Math.round(performance.now() - t0),
  };
}

/** Teste de integração: registra a solicitação como job (o worker da VPS executa
 *  o teste real com as credenciais que só existem lá). */
export async function testarIntegracao(integracaoId, { usuario = null } = {}) {
  const integ = INTEGRACOES.find((i) => i.id === integracaoId);
  if (!integ) throw new Error(`Integração desconhecida: ${integracaoId}.`);
  if (!integ.agentePadrao) throw new Error(`${integ.nome} não possui agente automático para teste.`);
  return solicitarExecucao(integ.agentePadrao, { usuario });
}

// ── 11.3 Central de E-mails — fluxo padronizado ──────────────────────────────
export const FLUXO_EMAIL = ['Recebido', 'Sincronizado', 'Interpretado', 'Classificado', 'Direcionado', 'Concluído'];

export async function moverEmailNoFluxo(emailId, novoEstado, { usuario = null, detalhe = null } = {}) {
  if (!FLUXO_EMAIL.includes(novoEstado) && novoEstado !== 'Respondido') {
    throw new Error(`Estado inválido no fluxo de e-mails: ${novoEstado}.`);
  }
  const { rows } = await listar('email_messages', { filtros: [{ coluna: 'id', valor: emailId }], porPagina: 1 });
  const anterior = rows?.[0] || null;
  const linhas = await atualizar('email_messages', [{ coluna: 'id', valor: emailId }], {
    status_fluxo: novoEstado,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'email_messages', registroId: emailId, acao: 'email_fluxo',
    valorAnterior: { status: anterior?.status_fluxo }, valorNovo: { status: novoEstado, detalhe, usuario },
  });
  return linhas?.[0] || null;
}

/** Sanitiza texto de e-mail removendo caracteres Unicode inválidos (11.3). */
export function sanitizarTextoEmail(texto) {
  if (!texto) return '';
  return String(texto)
    // remove surrogates órfãos e caracteres de controle (mantém \n e \t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/\uFFFD/g, '')
    .normalize('NFC');
}

/** Chave de deduplicação de e-mails: message-id ou conta+assunto+data. */
export function chaveDedupEmail(email) {
  return email.message_id
    || [email.conta_origem || '', email.assunto || '', email.recebido_em || email.data || ''].join('|');
}

// ── 11.4 Notificações padronizadas com deduplicação ──────────────────────────
export const MODULOS_NOTIFICACAO = [
  'Compras', 'Financeiro', 'Programação', 'OS', 'RH', 'Logística', 'Frotas',
  'Conferência', 'Patrimônio', 'Hospedagem', 'Notas Fiscais', 'Termos', 'Diretoria',
];

export async function notificar({ modulo, evento, destinatario = null, titulo, mensagem = null, chave = null }) {
  if (!MODULOS_NOTIFICACAO.includes(modulo)) throw new Error(`Módulo de notificação inválido: ${modulo}.`);
  if (!titulo) throw new Error('Notificação exige título.');
  const chaveDedup = chave || `${modulo}|${evento}|${destinatario || 'todos'}|${new Date().toISOString().slice(0, 10)}`;
  try {
    const linhas = await inserir('app_notificacoes', {
      modulo, evento, destinatario, titulo, mensagem, chave_dedup: chaveDedup,
    });
    return linhas?.[0] || null;
  } catch (erro) {
    // Violação do índice único = notificação duplicada; ignora silenciosamente (11.4)
    if (String(erro?.message || '').includes('uq_notif_dedup') || String(erro?.code) === '23505') return null;
    throw erro;
  }
}

export async function listarNotificacoes({ destinatario = null, somenteNaoLidas = false, pagina = 1, porPagina = 50 } = {}) {
  const filtros = [];
  if (destinatario) filtros.push({ coluna: 'destinatario', valor: destinatario });
  if (somenteNaoLidas) filtros.push({ coluna: 'lida', valor: false });
  return listar('app_notificacoes', {
    filtros, ordenar: [{ coluna: 'created_at', asc: false }], pagina, porPagina,
  });
}

export async function marcarNotificacaoLida(id) {
  const linhas = await atualizar('app_notificacoes', [{ coluna: 'id', valor: id }], {
    lida: true, lida_em: new Date().toISOString(),
  });
  return linhas?.[0] || null;
}
