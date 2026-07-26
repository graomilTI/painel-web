// ============================================================================
// frotasService — serviço de domínio de Frotas e Patrimônios (plano seção 9)
//
// 9.1 ficha única do veículo; 9.2 tratativas de GPS; 9.3 multas com histórico
// de ações; 9.4 rastreadores conciliados com a frota; 9.5 patrimônios com
// responsável derivado do histórico de movimentações.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';

const MODULO = 'frotas';

// ── 9.1 Ficha única do veículo ───────────────────────────────────────────────
/** Consolida tudo de um veículo pela placa: cadastro, multas, ocorrências GPS,
 *  rastreador e movimentações — uma única fonte por veículo (plano 9.1). */
export async function fichaDoVeiculo(placa) {
  if (!placa) throw new Error('Informe a placa.');
  const p = String(placa).toUpperCase().trim();
  const t0 = performance.now();
  const [veiculos, multas, ocorrencias, rastreadores] = await Promise.all([
    listar('frotas_veiculos', { filtros: [{ coluna: 'placa', valor: p }], porPagina: 1 }).catch(() => ({ rows: [] })),
    listar('frotas_multas', { filtros: [{ coluna: 'placa', valor: p }], ordenar: [{ coluna: 'created_at', asc: false }], porPagina: 200 }).catch(() => ({ rows: [] })),
    listar('frotas_gps_ocorrencias', { filtros: [{ coluna: 'placa', valor: p }], ordenar: [{ coluna: 'detectada_em', asc: false }], porPagina: 200 }).catch(() => ({ rows: [] })),
    listar('frotas_rastreadores', { filtros: [{ coluna: 'placa', valor: p }], porPagina: 10 }).catch(() => ({ rows: [] })),
  ]);
  return {
    veiculo: veiculos.rows?.[0] || null,
    multas: multas.rows || [],
    ocorrenciasGps: ocorrencias.rows || [],
    rastreadores: rastreadores.rows || [],
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase',
    duracaoMs: Math.round(performance.now() - t0),
  };
}

// ── 9.2 GPS — tratativas de ocorrências ─────────────────────────────────────
export const TIPOS_OCORRENCIA_GPS = [
  'excesso_velocidade', 'fora_rota', 'parada_prolongada',
  'sem_programacao', 'fora_horario', 'rodagem_desnecessaria',
];

export async function listarOcorrenciasGps({ status = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('frotas_gps_ocorrencias', {
    filtros: status ? [{ coluna: 'status', valor: status }] : [],
    ordenar: [{ coluna: 'detectada_em', asc: false }],
    pagina, porPagina, chaveCorrida: 'frotas:gps',
  });
}

export async function registrarOcorrenciaGps(payload, { usuario = null } = {}) {
  if (!payload.placa) throw new Error('Ocorrência exige placa.');
  if (!TIPOS_OCORRENCIA_GPS.includes(payload.tipo)) throw new Error(`Tipo de ocorrência inválido: ${payload.tipo}.`);
  const linhas = await inserir('frotas_gps_ocorrencias', { ...payload, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'frotas_gps_ocorrencias', registroId: linha?.id,
    acao: 'ocorrencia_gps_registrada', valorNovo: payload,
  });
  return linha;
}

export async function tratarOcorrenciaGps(id, { responsavel, justificativa = null, conclusao = null, concluir = false, usuario = null } = {}) {
  if (!responsavel) throw new Error('Toda tratativa exige responsável (plano 9.2).');
  if (concluir && !conclusao) throw new Error('Para concluir a tratativa é preciso registrar a conclusão.');
  const { rows } = await listar('frotas_gps_ocorrencias', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const anterior = rows?.[0] || null;
  const linhas = await atualizar('frotas_gps_ocorrencias', [{ coluna: 'id', valor: id }], {
    responsavel, justificativa, conclusao,
    status: concluir ? 'Concluída' : 'Em tratativa',
    atualizado_por: usuario,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'frotas_gps_ocorrencias', registroId: id, acao: 'ocorrencia_gps_tratada',
    valorAnterior: { status: anterior?.status }, valorNovo: { responsavel, justificativa, conclusao, concluir },
  });
  return linhas?.[0] || null;
}

// ── 9.3 Multas — ações sem sumir registros ──────────────────────────────────
export const ACOES_MULTA = ['Motorista', 'Identificar', 'Dobrar', 'OK', 'Arquivar'];

export async function registrarAcaoMulta(multaId, acao, { detalhe = null, usuario } = {}) {
  if (!ACOES_MULTA.includes(acao)) throw new Error(`Ação de multa inválida: ${acao}.`);
  if (!usuario) throw new Error('Registre o usuário responsável pela ação.');
  const linhas = await inserir('frotas_multas_acoes', {
    multa_id: String(multaId), acao, detalhe, usuario,
  });
  // A multa nunca é excluída: a ação vira histórico e o status é atualizado
  await atualizar('frotas_multas', [{ coluna: 'id', valor: multaId }], {
    status_tratativa: acao,
  }).catch(() => { /* tabela legada pode não ter a coluna; histórico já garante rastreio */ });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'frotas_multas_acoes', registroId: String(multaId),
    acao: 'multa_acao', valorNovo: { acao, detalhe, usuario },
  });
  return linhas?.[0] || null;
}

export async function historicoDaMulta(multaId) {
  const { rows } = await listar('frotas_multas_acoes', {
    filtros: [{ coluna: 'multa_id', valor: String(multaId) }],
    ordenar: [{ coluna: 'created_at', asc: false }],
    porPagina: 100,
  });
  return rows || [];
}

// ── 9.4 Rastreadores — conciliação com a frota ──────────────────────────────
/** Cruza rastreadores e veículos e devolve as divergências (plano 9.4):
 *  rastreador sem veículo, veículo sem rastreador e duplicidades. */
export async function conciliarRastreadores() {
  const t0 = performance.now();
  const [rastreadores, veiculos] = await Promise.all([
    listar('frotas_rastreadores', { porPagina: 2000 }).catch(() => ({ rows: [] })),
    listar('frotas_veiculos', { porPagina: 2000 }).catch(() => ({ rows: [] })),
  ]);
  const placasFrota = new Set((veiculos.rows || []).map((v) => String(v.placa || '').toUpperCase()));
  const vistos = new Map();
  const semVeiculo = [];
  const duplicados = [];
  for (const r of rastreadores.rows || []) {
    const placa = String(r.placa || '').toUpperCase();
    if (!placa || !placasFrota.has(placa)) semVeiculo.push(r);
    if (placa) {
      if (vistos.has(placa)) duplicados.push(r);
      vistos.set(placa, true);
    }
  }
  const semRastreador = (veiculos.rows || []).filter((v) => !vistos.has(String(v.placa || '').toUpperCase()));
  return {
    total: (rastreadores.rows || []).length,
    semVeiculo, semRastreador, duplicados,
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase · frotas_rastreadores × frotas_veiculos',
    duracaoMs: Math.round(performance.now() - t0),
  };
}

// ── 9.5 Patrimônios — movimentações e responsável atual ─────────────────────
export async function movimentarPatrimonio(payload, { usuario } = {}) {
  for (const campo of ['patrimonio_id', 'tipo']) {
    if (!payload[campo]) throw new Error(`Movimentação exige ${campo}.`);
  }
  if (!['entrega', 'devolucao', 'transferencia', 'leitura'].includes(payload.tipo)) {
    throw new Error(`Tipo de movimentação inválido: ${payload.tipo}.`);
  }
  if (['entrega', 'transferencia'].includes(payload.tipo) && !payload.responsavel_novo) {
    throw new Error('Entrega/transferência exige o novo responsável.');
  }
  const atual = await responsavelAtualDoPatrimonio(payload.patrimonio_id);
  const linhas = await inserir('patrimonios_movimentacoes', {
    ...payload,
    responsavel_anterior: atual?.responsavel_atual || null,
    usuario: usuario || 'sistema',
  });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: 'patrimonios', tabela: 'patrimonios_movimentacoes', registroId: linha?.id,
    acao: `patrimonio_${payload.tipo}`,
    valorAnterior: { responsavel: atual?.responsavel_atual || null },
    valorNovo: { responsavel: payload.responsavel_novo || null, tipo: payload.tipo },
  });
  return linha;
}

export async function responsavelAtualDoPatrimonio(patrimonioId) {
  const { rows } = await listar('vw_patrimonios_responsavel_atual', {
    filtros: [{ coluna: 'patrimonio_id', valor: String(patrimonioId) }],
    porPagina: 1,
  }).catch(() => ({ rows: [] }));
  return rows?.[0] || null;
}

export async function historicoDoPatrimonio(patrimonioId) {
  const { rows } = await listar('patrimonios_movimentacoes', {
    filtros: [{ coluna: 'patrimonio_id', valor: String(patrimonioId) }],
    ordenar: [{ coluna: 'created_at', asc: false }],
    porPagina: 200,
  });
  return rows || [];
}
