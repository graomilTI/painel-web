// Programação: correções pontuais carregadas antes do módulo de ajuste do gestor.
//
// 1) Programação → Hospedagem: normaliza o vínculo de colaboradores.
//    O fluxo automático antigo enviava colaborador_nome/colaborador_cpf, mas o
//    módulo de Hospedagem e a view usam nome_colaborador/cpf.
//
// 2) Programação → Embarque: Supervisor e Auditor não podem entrar como
//    sugestão/candidato de O.S. A regra atua em 3 pontos:
//    - filtra a RPC de candidatos antes do auto-preencher;
//    - filtra a leitura de programacao_equipe para não renderizar confirmados antigos;
//    - limpa, em segundo plano, os vínculos antigos já salvos no banco.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoAjustesPontuaisFixV3';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isCargoBloqueadoEmbarque(value) {
  const cargo = normalizeText(value);
  return cargo.includes('SUPERVISOR') || cargo.includes('AUDITOR');
}

function normalizeHospedagemColaboradorRow(row) {
  const out = { ...(row || {}) };

  if (out.colaborador_nome && !out.nome_colaborador) {
    out.nome_colaborador = out.colaborador_nome;
  }
  if (out.colaborador_cpf && !out.cpf) {
    out.cpf = out.colaborador_cpf;
  }

  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = String(out.cpf).replace(/\D/g, '') || null;
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

function unique(values) {
  return [...new Set((values || []).filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))];
}

async function limparConfirmadosBloqueados(originalFrom, rows) {
  const ids = unique(rows.map((r) => r.id));
  const osIds = unique(rows.map((r) => r.os_id));
  const pares = rows
    .filter((r) => r.programacao_id && r.colaborador_id)
    .map((r) => ({ programacaoId: r.programacao_id, colaboradorId: String(r.colaborador_id) }));

  try {
    if (ids.length) {
      await originalFrom('programacao_equipe').delete().in('id', ids);
    }
    if (osIds.length) {
      await originalFrom('operacional_os_colaboradores').delete().in('os_id', osIds);
    }
    await Promise.all(pares.map((p) => originalFrom('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', p.programacaoId)
      .eq('colaborador_id', p.colaboradorId)
      .in('disponibilidade', ['OK', 'LOGISTICA'])));
  } catch (error) {
    console.warn('[programacao] limpeza supervisor/auditor:', error);
  }
}

function patchProgramacaoEquipeQuery(query, originalFrom) {
  if (!query || query.__progEquipeCargoPatch || typeof query.then !== 'function') return query;

  const originalThen = query.then.bind(query);
  query.then = function patchedThen(resolve, reject) {
    const wrappedResolve = async (payload) => {
      if (!payload || !Array.isArray(payload.data) || !payload.data.length) return payload;

      try {
        const rows = payload.data;
        const programacaoIds = unique(rows.map((r) => r.programacao_id));
        const colaboradorIds = unique(rows.map((r) => r.colaborador_id));
        if (!programacaoIds.length || !colaboradorIds.length) return payload;

        const { data: espelhos, error } = await originalFrom('programacao_colaboradores')
          .select('programacao_id,colaborador_id,nome_colaborador,cargo,disponibilidade')
          .in('programacao_id', programacaoIds)
          .in('colaborador_id', colaboradorIds);

        if (error || !Array.isArray(espelhos)) return payload;

        const cargoPorChave = new Map();
        espelhos.forEach((row) => {
          cargoPorChave.set(`${row.programacao_id}|${String(row.colaborador_id)}`, row.cargo || '');
        });

        const bloqueados = [];
        const filtrados = rows.filter((row) => {
          const cargo = cargoPorChave.get(`${row.programacao_id}|${String(row.colaborador_id)}`) || row.cargo || '';
          const bloqueado = isCargoBloqueadoEmbarque(cargo);
          if (bloqueado) bloqueados.push(row);
          return !bloqueado;
        });

        if (bloqueados.length) {
          limparConfirmadosBloqueados(originalFrom, bloqueados);
        }

        return { ...payload, data: filtrados };
      } catch (error) {
        console.warn('[programacao] filtro supervisor/auditor:', error);
        return payload;
      }
    };

    return originalThen(
      (payload) => Promise.resolve(wrappedResolve(payload)).then(resolve),
      reject,
    );
  };

  query.__progEquipeCargoPatch = true;
  return query;
}

function patchFrom(originalFrom) {
  return function patchedFrom(table) {
    const builder = originalFrom(table);

    if (table === 'hospedagem_solicitacao_colaboradores' && !builder.__hospColabInsertPatched) {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = function patchedInsert(values, options) {
        const normalized = Array.isArray(values)
          ? values.map(normalizeHospedagemColaboradorRow).filter((row) => row.nome_colaborador)
          : normalizeHospedagemColaboradorRow(values);

        if (Array.isArray(normalized) && !normalized.length) {
          throw new Error('A solicitação de hospedagem precisa ter pelo menos um colaborador.');
        }
        if (!Array.isArray(normalized) && !normalized.nome_colaborador) {
          throw new Error('A solicitação de hospedagem precisa ter o nome do colaborador.');
        }

        return originalInsert(normalized, options);
      };
      builder.__hospColabInsertPatched = true;
    }

    if (table === 'programacao_equipe' && !builder.__progEquipeSelectPatched) {
      const originalSelect = builder.select.bind(builder);
      builder.select = function patchedSelect(...args) {
        return patchProgramacaoEquipeQuery(originalSelect(...args), originalFrom);
      };
      builder.__progEquipeSelectPatched = true;
    }

    return builder;
  };
}

function patchRpc(originalRpc) {
  return function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);
    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then((payload) => {
      if (!payload || !Array.isArray(payload.data)) return payload;
      return {
        ...payload,
        data: payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo)),
      };
    });
  };
}

if (!supabase[PATCH_FLAG]) {
  supabase.from = patchFrom(supabase.from.bind(supabase));
  supabase.rpc = patchRpc(supabase.rpc.bind(supabase));
  supabase[PATCH_FLAG] = true;
}
