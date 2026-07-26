// ============================================================================
// programacaoService — serviço de domínio da Programação (plano 2.4 e seção 3)
//
// Centraliza o acesso a dados da Programação em cima da camada padrão
// (core/supabaseService), tirando as consultas soltas de dentro das funções
// de renderização. As páginas passam a usar este serviço gradualmente,
// sem alterar o comportamento atual do módulo legado.
// ============================================================================

import {
  listar, inserir, excluir, invalidarCache, dataLocalISO,
} from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'programacao';

// ── OS e colaboradores ───────────────────────────────────────────────────────

/** Lista OS para a Programação (linha compacta: nº, cliente, local, cidade,
 *  remanescente e status — plano 3.7). */
export async function listarOs({ pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('operacional_os', {
    busca: busca ? { colunas: ['numero_os', 'cliente', 'local', 'cidade'], termo: busca } : null,
    ordenar: [{ coluna: 'numero_os', asc: false }],
    pagina, porPagina, cacheMs: 30_000, chaveCorrida: 'prog:os',
  });
}

/** Colaboradores associados a uma OS (opcionalmente numa data). */
export async function listarColaboradoresDaOs({ osId, data = null } = {}) {
  const filtros = [{ coluna: 'os_id', valor: osId }];
  if (data) filtros.push({ coluna: 'data', valor: data });
  return listar('programacao_colaboradores', {
    filtros, ordenar: [{ coluna: 'created_at', asc: true }], porPagina: 500,
  });
}

/** Verificações do plano 3.2 antes de associar um colaborador:
 *  duplicidade na mesma função, conflito de horário e indisponibilidade. */
export async function validarAssociacao({ osId, colaboradorId, funcao, data, periodo = null }) {
  const problemas = [];

  const { rows: mesmaOs } = await listar('programacao_colaboradores', {
    filtros: [
      { coluna: 'os_id', valor: osId },
      { coluna: 'colaborador_id', valor: colaboradorId },
      { coluna: 'data', valor: data },
    ],
    porPagina: 10,
  });
  if (mesmaOs.some((r) => (r.funcao || '') === (funcao || ''))) {
    problemas.push('Colaborador já está associado a esta OS na mesma função e data.');
  }

  const { rows: outras } = await listar('programacao_colaboradores', {
    filtros: [
      { coluna: 'colaborador_id', valor: colaboradorId },
      { coluna: 'data', valor: data },
    ],
    porPagina: 20,
  });
  const conflito = outras.find((r) => String(r.os_id) !== String(osId)
    && (!periodo || !r.periodo || r.periodo === periodo));
  if (conflito) {
    problemas.push(`Conflito de horário: colaborador já programado na OS ${conflito.os_numero || conflito.os_id} nesta data.`);
  }

  const indisponibilidade = await verificarIndisponibilidade({ colaboradorId, data });
  if (indisponibilidade) {
    problemas.push(`Colaborador indisponível (${indisponibilidade}). Associação exige autorização e justificativa.`);
  }

  return { valido: problemas.length === 0, problemas, indisponibilidade };
}

/** Plano 3.3: indisponibilidade centralizada (férias, atestado, manual do RH). */
export async function verificarIndisponibilidade({ colaboradorId, data = dataLocalISO() }) {
  const [ferias, atestados] = await Promise.all([
    listar('rh_ferias', {
      filtros: [{ coluna: 'colaborador_id', valor: colaboradorId }], porPagina: 50,
    }).catch(() => ({ rows: [] })),
    listar('rh_atestados', {
      filtros: [{ coluna: 'colaborador_id', valor: colaboradorId }], porPagina: 50,
    }).catch(() => ({ rows: [] })),
  ]);
  const dentro = (ini, fim) => ini && data >= String(ini).slice(0, 10) && (!fim || data <= String(fim).slice(0, 10));
  if ((ferias.rows || []).some((f) => dentro(f.inicio || f.data_inicio, f.fim || f.data_fim))) return 'férias';
  if ((atestados.rows || []).some((a) => dentro(a.inicio || a.data_inicio, a.fim || a.data_fim))) return 'atestado';
  return null;
}

/** Associa colaborador à OS com validação e auditoria (plano 3.2). */
export async function associarColaborador(payload, { justificativa = null, autorizado = false } = {}) {
  const validacao = await validarAssociacao(payload);
  if (!validacao.valido && !(autorizado && justificativa)) {
    const erro = new Error(validacao.problemas.join(' '));
    erro.problemas = validacao.problemas;
    throw erro;
  }
  const linhas = await inserir('programacao_colaboradores', {
    os_id: payload.osId,
    colaborador_id: payload.colaboradorId,
    funcao: payload.funcao || null,
    data: payload.data,
    periodo: payload.periodo || null,
    supervisao: payload.supervisao || null,
    justificativa_indisponibilidade: justificativa,
  });
  const linha = linhas?.[0] || null;
  invalidarCache('programacao_colaboradores');
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_colaboradores', registroId: linha?.id,
    acao: 'colaborador_associado', valorNovo: { ...payload, justificativa, autorizado },
  });
  return linha;
}

/** Remove associação mantendo histórico via auditoria (plano 3.2). */
export async function removerAssociacao(id, { motivo = null } = {}) {
  const { rows } = await listar('programacao_colaboradores', {
    filtros: [{ coluna: 'id', valor: id }], porPagina: 1,
  });
  const anterior = rows?.[0] || null;
  await excluir('programacao_colaboradores', [{ coluna: 'id', valor: id }]);
  invalidarCache('programacao_colaboradores');
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_colaboradores', registroId: id,
    acao: 'colaborador_removido', valorAnterior: anterior, valorNovo: { motivo },
  });
}

// ── Estadia (plano 3.4) ──────────────────────────────────────────────────────
export const TIPOS_ESTADIA = ['Casa', 'Pernoite', 'Alojamento', 'Hotel'];

export async function registrarEstadia(payload) {
  const tipo = payload.tipo;
  if (!TIPOS_ESTADIA.includes(tipo)) throw new Error(`Tipo de estadia inválido: ${tipo}.`);
  if ((tipo === 'Hotel' || tipo === 'Alojamento') && !payload.local) {
    throw new Error(`Estadia em ${tipo} exige o local vinculado (hotel/alojamento, cidade e reserva).`);
  }
  const linhas = await inserir('programacao_estadia', payload);
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_estadia', registroId: linha?.id,
    acao: 'estadia_registrada', valorNovo: payload,
  });
  return linha;
}

// ── Deslocamento (plano 3.5) ─────────────────────────────────────────────────
export const TIPOS_DESLOCAMENTO = ['Frota', 'Reembolso Km', 'Uber', 'Carona'];

export function validarDeslocamento(payload) {
  const problemas = [];
  const tipo = payload.tipo;
  if (!TIPOS_DESLOCAMENTO.includes(tipo)) problemas.push(`Tipo de deslocamento inválido: ${tipo}.`);
  if (tipo === 'Frota' && !payload.placa) problemas.push('Placa é obrigatória para deslocamento com Frota.');
  if (tipo === 'Reembolso Km') {
    for (const campo of ['origem', 'destino', 'distancia_km', 'valor']) {
      if (payload[campo] == null || payload[campo] === '') problemas.push(`Reembolso Km exige ${campo.replace('_', ' ')}.`);
    }
  }
  if (tipo === 'Carona' && !payload.condutor) problemas.push('Carona exige identificar quem conduziu.');
  return { valido: problemas.length === 0, problemas };
}

export async function registrarDeslocamento(payload) {
  const validacao = validarDeslocamento(payload);
  if (!validacao.valido) throw new Error(validacao.problemas.join(' '));
  if (payload.tipo !== 'Frota') payload.placa = null; // placa só para Frota (plano 3.5)
  const linhas = await inserir('programacao_deslocamento', payload);
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_deslocamento', registroId: linha?.id,
    acao: 'deslocamento_registrado', valorNovo: payload,
  });
  return linha;
}

// ── Alimentação e extras (plano 3.6) ─────────────────────────────────────────
export const TIPOS_EXTRA = ['café', 'almoço', 'janta', 'diária', 'adiantamento', 'outros'];

export async function registrarExtra(payload) {
  for (const campo of ['os_id', 'colaborador_id', 'data', 'tipo']) {
    if (!payload[campo]) throw new Error(`Lançamento de extra exige ${campo.replace('_', ' ')} (vínculo obrigatório do plano 3.6).`);
  }
  const linhas = await inserir('programacao_extras', payload);
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_extras', registroId: linha?.id,
    acao: 'extra_registrado', valorNovo: payload,
  });
  return linha;
}
