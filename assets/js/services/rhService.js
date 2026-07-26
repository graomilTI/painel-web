// ============================================================================
// rhService — serviço de domínio de Recursos Humanos (plano seção 10)
//
// 10.1 perfil único do colaborador; 10.2 checklist de admissão e treinamento
// por CPF; 10.3 exames; 10.4 contratos; 10.5 EPI/CAT; 10.6 indisponibilidade
// com bloqueio de conflito e retroativo válido; 10.7 demais janelas usam o
// perfil como referência.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'rh';

// ── 10.1 Perfil único do colaborador ─────────────────────────────────────────
/** Reúne tudo do colaborador em uma única visão (plano 10.1). */
export async function perfilDoColaborador(colaboradorId) {
  if (!colaboradorId) throw new Error('Informe o colaborador.');
  const id = String(colaboradorId);
  const t0 = performance.now();
  const [base, checklist, exames, contratos, epi, cat, indisponibilidades, patrimonios] = await Promise.all([
    listar('operacional_colaborador_base', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 }).catch(() => ({ rows: [] })),
    listar('rh_admissao_checklist', { filtros: [{ coluna: 'colaborador_id', valor: id }], porPagina: 20 }).catch(() => ({ rows: [] })),
    listar('rh_exames', { filtros: [{ coluna: 'colaborador_id', valor: id }], ordenar: [{ coluna: 'data_exame', asc: false }], porPagina: 50 }).catch(() => ({ rows: [] })),
    listar('rh_contratos', { filtros: [{ coluna: 'colaborador_id', valor: id }], ordenar: [{ coluna: 'versao', asc: false }], porPagina: 50 }).catch(() => ({ rows: [] })),
    listar('rh_epi', { filtros: [{ coluna: 'colaborador_id', valor: id }], porPagina: 100 }).catch(() => ({ rows: [] })),
    listar('rh_cat', { filtros: [{ coluna: 'colaborador_id', valor: id }], porPagina: 50 }).catch(() => ({ rows: [] })),
    listarIndisponibilidadesBrutas(id).catch(() => ({ rows: [] })),
    listar('patrimonios_movimentacoes', { filtros: [{ coluna: 'responsavel_novo', valor: id }], porPagina: 100 }).catch(() => ({ rows: [] })),
  ]);
  return {
    colaborador: base.rows?.[0] || null,
    checklist: checklist.rows || [],
    exames: exames.rows || [],
    contratos: contratos.rows || [],
    epi: epi.rows || [],
    cat: cat.rows || [],
    indisponibilidades: indisponibilidades.rows || [],
    patrimonios: patrimonios.rows || [],
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase',
    duracaoMs: Math.round(performance.now() - t0),
  };
}

// ── 10.2 Admissão e treinamento por CPF ──────────────────────────────────────
export const ETAPAS_ADMISSAO = ['documentos', 'exame', 'contrato', 'graint', 'patrimonio', 'treinamento', 'termos'];

export async function criarChecklistAdmissao({ colaboradorId, colaboradorNome, cpf }) {
  if (!colaboradorId) throw new Error('Informe o colaborador para o checklist.');
  const registros = ETAPAS_ADMISSAO.map((etapa) => ({
    colaborador_id: String(colaboradorId), colaborador_nome: colaboradorNome, cpf, etapa,
  }));
  // upsert-like: insere só as etapas que faltam (índice único colaborador+etapa)
  const { rows: existentes } = await listar('rh_admissao_checklist', {
    filtros: [{ coluna: 'colaborador_id', valor: String(colaboradorId) }], porPagina: 20,
  }).catch(() => ({ rows: [] }));
  const jaTem = new Set((existentes || []).map((r) => r.etapa));
  const faltantes = registros.filter((r) => !jaTem.has(r.etapa));
  const linhas = faltantes.length ? await inserir('rh_admissao_checklist', faltantes) : [];
  await registrarAuditoria({
    modulo: MODULO, tabela: 'rh_admissao_checklist', acao: 'checklist_criado',
    valorNovo: { colaboradorId, etapasCriadas: faltantes.map((f) => f.etapa) },
  });
  return linhas;
}

export async function concluirEtapaAdmissao(colaboradorId, etapa, { responsavel, observacao = null } = {}) {
  if (!ETAPAS_ADMISSAO.includes(etapa)) throw new Error(`Etapa inválida: ${etapa}.`);
  if (!responsavel) throw new Error('Cada etapa exige responsável (plano 10.2).');
  const linhas = await atualizar('rh_admissao_checklist', [
    { coluna: 'colaborador_id', valor: String(colaboradorId) },
    { coluna: 'etapa', valor: etapa },
  ], {
    status: 'Concluída', responsavel, observacao, concluido_em: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'rh_admissao_checklist', registroId: `${colaboradorId}/${etapa}`,
    acao: 'etapa_admissao_concluida', valorNovo: { etapa, responsavel, observacao },
  });
  return linhas?.[0] || null;
}

/** Acesso ao treinamento somente pelo CPF (plano 10.2). */
export async function registrarAcessoTreinamento({ cpf, colaboradorNome = null, material, tipoMaterial = 'video', dispositivo = null }) {
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) throw new Error('CPF inválido: o acesso ao treinamento é feito somente pelo CPF.');
  const linhas = await inserir('rh_treinamento_acessos', {
    cpf: cpfLimpo, colaborador_nome: colaboradorNome, material,
    tipo_material: tipoMaterial, dispositivo,
  });
  return linhas?.[0] || null;
}

export async function atualizarProgressoTreinamento(id, { progresso, concluido = false } = {}) {
  const pct = Math.max(0, Math.min(100, Number(progresso || 0)));
  const linhas = await atualizar('rh_treinamento_acessos', [{ coluna: 'id', valor: id }], {
    progresso: pct,
    concluido: concluido || pct >= 100,
    concluido_em: (concluido || pct >= 100) ? new Date().toISOString() : null,
  });
  return linhas?.[0] || null;
}

// ── 10.3 Exames ──────────────────────────────────────────────────────────────
export async function registrarExame(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_id', 'tipo']) {
    if (!payload[campo]) throw new Error(`Exame exige ${campo}.`);
  }
  const linhas = await inserir('rh_exames', { ...payload, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'rh_exames', registroId: linha?.id,
    acao: 'exame_registrado', valorNovo: payload,
  });
  return linha;
}

export async function examesVencendo({ dias = 30 } = {}) {
  const limite = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  return listar('rh_exames', {
    filtros: [
      { coluna: 'validade', op: 'gte', valor: hoje },
      { coluna: 'validade', op: 'lte', valor: limite },
    ],
    ordenar: [{ coluna: 'validade', asc: true }],
    porPagina: 200,
  });
}

// ── 10.4 Contratos ───────────────────────────────────────────────────────────
export async function registrarContrato(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_id', 'tipo']) {
    if (!payload[campo]) throw new Error(`Contrato exige ${campo}.`);
  }
  const { rows: anteriores } = await listar('rh_contratos', {
    filtros: [
      { coluna: 'colaborador_id', valor: String(payload.colaborador_id) },
      { coluna: 'tipo', valor: payload.tipo },
    ],
    ordenar: [{ coluna: 'versao', asc: false }], porPagina: 1,
  }).catch(() => ({ rows: [] }));
  const versao = (anteriores?.[0]?.versao || 0) + 1;
  const linhas = await inserir('rh_contratos', { ...payload, versao, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'rh_contratos', registroId: linha?.id,
    acao: 'contrato_registrado', valorNovo: { ...payload, versao },
  });
  return linha;
}

// ── 10.5 EPI e CAT ───────────────────────────────────────────────────────────
export async function entregarEpi(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_id', 'equipamento']) {
    if (!payload[campo]) throw new Error(`EPI exige ${campo}.`);
  }
  const linhas = await inserir('rh_epi', { ...payload, entrega: payload.entrega || new Date().toISOString().slice(0, 10), criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({ modulo: MODULO, tabela: 'rh_epi', registroId: linha?.id, acao: 'epi_entregue', valorNovo: payload });
  return linha;
}

export async function devolverEpi(id, { usuario = null } = {}) {
  const linhas = await atualizar('rh_epi', [{ coluna: 'id', valor: id }], {
    devolucao: new Date().toISOString().slice(0, 10), status: 'Devolvido',
  });
  await registrarAuditoria({ modulo: MODULO, tabela: 'rh_epi', registroId: id, acao: 'epi_devolvido', valorNovo: { usuario } });
  return linhas?.[0] || null;
}

export async function registrarCat(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_id', 'data_ocorrencia']) {
    if (!payload[campo]) throw new Error(`CAT exige ${campo}.`);
  }
  const linhas = await inserir('rh_cat', { ...payload, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({ modulo: MODULO, tabela: 'rh_cat', registroId: linha?.id, acao: 'cat_registrada', valorNovo: payload });
  return linha;
}

// ── 10.6 Indisponibilidade (férias/atestados) ────────────────────────────────
/** Lê da tabela nova rh_indisponibilidades e cai para a legada `indisponibilidades`. */
async function listarIndisponibilidadesBrutas(colaboradorId, opcoes = {}) {
  const params = {
    filtros: [{ coluna: 'colaborador_id', valor: String(colaboradorId) }],
    ordenar: [{ coluna: 'inicio', asc: false }],
    porPagina: opcoes.porPagina || 100,
    pagina: opcoes.pagina || 1,
  };
  try {
    return await listar('rh_indisponibilidades', params);
  } catch {
    return listar('indisponibilidades', params);
  }
}

/** Registra indisponibilidade com bloqueio de conflito de período e
 *  aceitando retroativo válido, inclusive de um único dia (plano 10.6). */
export async function registrarIndisponibilidade(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_id', 'tipo', 'inicio']) {
    if (!payload[campo]) throw new Error(`Indisponibilidade exige ${campo}.`);
  }
  const inicio = String(payload.inicio).slice(0, 10);
  const fim = String(payload.fim || payload.inicio).slice(0, 10); // 1 dia é válido
  if (fim < inicio) throw new Error('A data final não pode ser anterior à inicial.');

  // Bloqueio de conflitos: sobreposição com registros existentes do colaborador
  const { rows: existentes } = await listarIndisponibilidadesBrutas(payload.colaborador_id, { porPagina: 500 })
    .catch(() => ({ rows: [] }));
  const conflito = (existentes || []).find((r) => {
    const rIni = String(r.inicio).slice(0, 10);
    const rFim = String(r.fim || r.inicio).slice(0, 10);
    return inicio <= rFim && fim >= rIni && String(r.status || '') !== 'Cancelada';
  });
  if (conflito) {
    throw new Error(`Conflito de período: já existe ${conflito.tipo} de ${conflito.inicio} a ${conflito.fim || conflito.inicio}.`);
  }
  let linhas;
  const registro = {
    ...payload, inicio, fim,
    retroativo: inicio < new Date().toISOString().slice(0, 10),
    criado_por: usuario,
  };
  try {
    linhas = await inserir('rh_indisponibilidades', registro);
  } catch {
    // tabela nova ainda não migrada: usa a legada sem os campos extras
    const { retroativo, criado_por, ...legado } = registro;
    linhas = await inserir('indisponibilidades', legado);
  }
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'rh_indisponibilidades', registroId: linha?.id,
    acao: 'indisponibilidade_registrada', valorNovo: { ...payload, inicio, fim },
  });
  return linha;
}

export async function historicoIndisponibilidades(colaboradorId, { pagina = 1, porPagina = 50 } = {}) {
  return listarIndisponibilidadesBrutas(colaboradorId, { pagina, porPagina });
}
