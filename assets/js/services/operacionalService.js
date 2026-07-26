// ============================================================================
// operacionalService — serviço de domínio da Conferência e Operacional
// (plano seção 5: conferência, deslocamento, Uber, distribuição de OS,
//  termos e mapa de direcionamento)
// ============================================================================

import {
  listar, inserir, atualizar,
} from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'operacional';

// ── 5.2 Deslocamento — cruzamento e decisão ─────────────────────────────────
export async function listarDeslocamentosParaConferencia({ pagina = 1, porPagina = 50, filtros = [] } = {}) {
  return listar('programacao_deslocamento', {
    filtros,
    ordenar: [{ coluna: 'created_at', asc: false }],
    pagina, porPagina, chaveCorrida: 'oper:deslocamentos',
  });
}

export async function decidirDeslocamento(id, decisao, { justificativa = null, usuario = null } = {}) {
  const permitidas = ['Aprovado', 'Devolvido', 'Corrigido', 'Justificado'];
  if (!permitidas.includes(decisao)) throw new Error(`Decisão inválida: ${decisao}.`);
  if ((decisao === 'Devolvido' || decisao === 'Justificado') && !justificativa) {
    throw new Error(`${decisao} exige justificativa.`);
  }
  const linhas = await atualizar('programacao_deslocamento', [{ coluna: 'id', valor: id }], {
    status_conferencia: decisao, justificativa_conferencia: justificativa,
    conferido_por: usuario, conferido_em: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'programacao_deslocamento', registroId: id,
    acao: 'deslocamento_conferido', valorNovo: { decisao, justificativa },
  });
  return linhas?.[0] || null;
}

// ── 5.3 Uber — detecção de inconsistências ──────────────────────────────────
/** Analisa corridas Uber e marca problemas objetivos do plano 5.3. */
export function analisarCorridasUber(corridas = [], { programacoes = [] } = {}) {
  const porChave = new Map();
  const resultados = [];
  for (const corrida of corridas) {
    const problemas = [];
    const chave = corrida.external_id
      || `${corrida.colaborador_id || ''}|${corrida.data || ''}|${corrida.valor || ''}|${corrida.origem || ''}`;
    if (porChave.has(chave)) problemas.push('corrida duplicada');
    porChave.set(chave, true);

    if (!corrida.colaborador_id && !corrida.colaborador_nome) problemas.push('corrida sem colaborador');
    const temProgramacao = corrida.programacao_id || programacoes.some((p) => (
      String(p.colaborador_id) === String(corrida.colaborador_id)
      && String(p.data).slice(0, 10) === String(corrida.data).slice(0, 10)
    ));
    if (!temProgramacao) problemas.push('corrida sem programação');
    if (corrida.rota_esperada && corrida.rota_realizada
      && String(corrida.rota_esperada) !== String(corrida.rota_realizada)) {
      problemas.push('corrida fora da rota');
    }
    if (corrida.valor_esperado != null && corrida.valor != null
      && Math.abs(Number(corrida.valor) - Number(corrida.valor_esperado)) > 0.01) {
      problemas.push('valor divergente');
    }
    resultados.push({ ...corrida, problemas, valido: problemas.length === 0 });
  }
  return resultados;
}

// ── 5.4 Distribuição de OS — histórico e ação em lote ───────────────────────
export async function distribuirOs(osIds = [], { responsavel, distribuidoPor, motivo = null } = {}) {
  if (!osIds.length) throw new Error('Selecione ao menos uma OS para distribuir.');
  if (!responsavel) throw new Error('Informe o responsável que receberá as OS.');
  const existentes = await listar('operacional_os_distribuicao', {
    filtros: [{ coluna: 'os_id', op: 'in', valor: osIds }],
    porPagina: 1000,
  }).catch(() => ({ rows: [] }));
  const jaDistribuidas = new Set((existentes.rows || []).map((r) => String(r.os_id)));
  const registros = osIds.map((osId) => ({
    os_id: String(osId),
    responsavel_atual: responsavel,
    distribuido_por: distribuidoPor,
    motivo,
    redistribuicao: jaDistribuidas.has(String(osId)),
  }));
  const linhas = await inserir('operacional_os_distribuicao', registros);
  await registrarAuditoria({
    modulo: MODULO, tabela: 'operacional_os_distribuicao', acao: 'os_distribuidas',
    valorNovo: { osIds, responsavel, motivo, lote: osIds.length > 1 },
  });
  return linhas;
}

export async function responsavelAtualDaOs(osId) {
  const { rows } = await listar('operacional_os_distribuicao', {
    filtros: [{ coluna: 'os_id', valor: String(osId) }],
    ordenar: [{ coluna: 'created_at', asc: false }],
    porPagina: 1,
  });
  return rows?.[0] || null;
}

// ── 5.5 Termos versionados ───────────────────────────────────────────────────
export const TIPOS_TERMO = ['celular', 'veiculo', 'patrimonio', 'equipamento'];

export async function registrarTermo(payload) {
  if (!TIPOS_TERMO.includes(payload.tipo)) throw new Error(`Tipo de termo inválido: ${payload.tipo}.`);
  const { rows: anteriores } = await listar('termos_documentos', {
    filtros: [
      { coluna: 'tipo', valor: payload.tipo },
      { coluna: 'colaborador_id', valor: payload.colaborador_id || '' },
    ],
    ordenar: [{ coluna: 'versao', asc: false }], porPagina: 1,
  }).catch(() => ({ rows: [] }));
  const versao = (anteriores?.[0]?.versao || 0) + 1;
  const linhas = await inserir('termos_documentos', { ...payload, versao });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'termos_documentos', registroId: linha?.id,
    acao: 'termo_registrado', valorNovo: { ...payload, versao },
  });
  return linha;
}

export async function assinarTermo(id, { assinadoPor = null } = {}) {
  const linhas = await atualizar('termos_documentos', [{ coluna: 'id', valor: id }], {
    assinado: true, assinado_em: new Date().toISOString(),
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'termos_documentos', registroId: id,
    acao: 'termo_assinado', valorNovo: { assinadoPor },
  });
  return linhas?.[0] || null;
}

// ── 5.6 Mapa de Direcionamento — dados cruzados com origem/atualização ──────
export async function dadosMapaDirecionamento() {
  const inicio = performance.now();
  const [os, colaboradores, frota] = await Promise.all([
    listar('operacional_os', { porPagina: 500 }).catch(() => ({ rows: [] })),
    listar('operacional_colaborador_base', { porPagina: 2000 }).catch(() => ({ rows: [] })),
    listar('patrimonios_snapshot', { porPagina: 1000 }).catch(() => ({ rows: [] })),
  ]);
  return {
    os: os.rows || [],
    colaboradores: colaboradores.rows || [],
    frota: frota.rows || [],
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase',
    duracaoMs: Math.round(performance.now() - inicio),
  };
}
