// Programação: correções pontuais carregadas antes do módulo de ajuste do gestor.
//
// 1) Programação → Hospedagem: normaliza o vínculo de colaboradores.
//    O fluxo automático antigo enviava colaborador_nome/colaborador_cpf, mas o
//    módulo de Hospedagem e a view usam nome_colaborador/cpf.
//
// 2) Programação → Embarque: Supervisor, Coordenador e Auditor não podem entrar
//    como sugestão/candidato de O.S. A regra atua em 4 pontos:
//    - filtra a RPC de candidatos antes do auto-preencher;
//    - se o top da RPC ficar vazio após o filtro, injeta colaboradores elegíveis
//      da regional para o gestor sempre conseguir escolher alguém;
//    - filtra a lista completa do dropdown de troca;
//    - limpa, em segundo plano, os vínculos antigos já salvos no banco.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoAjustesPontuaisFixV4';
const colaboradoresElegiveisCache = new Map();

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(row) {
  const cpf = cpfNorm(row?.cpf || row?.colaborador_id || row?.colaboradorId);
  return cpf || String(row?.nome || row?.colaborador_nome || '').trim();
}

function isCargoBloqueadoEmbarque(value) {
  const cargo = normalizeText(value);
  return cargo.includes('SUPERVISOR')
    || cargo.includes('AUDITOR')
    || cargo.includes('COORDENADOR')
    || cargo.includes('COORDENADORA')
    || cargo === 'COORDENACAO'
    || cargo.startsWith('COORDENACAO ');
}

function isSituacaoInativa(value) {
  const s = normalizeText(value);
  return ['NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'].includes(s);
}

function normalizeHospedagemColaboradorRow(row) {
  const out = { ...(row || {}) };

  if (out.colaborador_nome && !out.nome_colaborador) out.nome_colaborador = out.colaborador_nome;
  if (out.colaborador_cpf && !out.cpf) out.cpf = out.colaborador_cpf;

  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = cpfNorm(out.cpf) || null;
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

function unique(values) {
  return [...new Set((values || []).filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))];
}

async function carregarColaboradoresElegiveis(originalFrom, supervisao) {
  const sup = String(supervisao || '').trim();
  if (!sup) return [];
  if (colaboradoresElegiveisCache.has(sup)) return colaboradoresElegiveisCache.get(sup);

  try {
    const latest = await originalFrom('colaborador_snapshot')
      .select('data_referencia')
      .eq('supervisao', sup)
      .order('data_referencia', { ascending: false })
      .limit(1);

    const dataRef = latest?.data?.[0]?.data_referencia;
    if (!dataRef) {
      colaboradoresElegiveisCache.set(sup, []);
      return [];
    }

    const { data, error } = await originalFrom('colaborador_snapshot')
      .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
      .eq('data_referencia', dataRef)
      .eq('supervisao', sup)
      .limit(5000);

    if (error) throw error;

    const seen = new Set();
    const rows = (data || [])
      .filter((r) => r?.nome)
      .filter((r) => r.ativo !== false)
      .filter((r) => !r.desligamento)
      .filter((r) => !isSituacaoInativa(r.situacao))
      .filter((r) => !isCargoBloqueadoEmbarque(r.cargo))
      .map((r) => ({
        colaborador_id: colaboradorKey(r),
        nome: r.nome,
        cargo: r.cargo || null,
        coordenacao: r.coordenacao || null,
        supervisao: r.supervisao || sup,
      }))
      .filter((r) => {
        const key = String(r.colaborador_id || r.nome || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    colaboradoresElegiveisCache.set(sup, rows);
    return rows;
  } catch (error) {
    console.warn('[programacao] colaboradores elegíveis:', error);
    colaboradoresElegiveisCache.set(sup, []);
    return [];
  }
}

async function limparConfirmadosBloqueados(originalFrom, rows) {
  const ids = unique(rows.map((r) => r.id));
  const osIds = unique(rows.map((r) => r.os_id));
  const pares = rows
    .filter((r) => r.programacao_id && r.colaborador_id)
    .map((r) => ({ programacaoId: r.programacao_id, colaboradorId: String(r.colaborador_id) }));

  try {
    if (ids.length) await originalFrom('programacao_equipe').delete().in('id', ids);
    if (osIds.length) await originalFrom('operacional_os_colaboradores').delete().in('os_id', osIds);
    await Promise.all(pares.map((p) => originalFrom('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', p.programacaoId)
      .eq('colaborador_id', p.colaboradorId)
      .in('disponibilidade', ['OK', 'LOGISTICA'])));
  } catch (error) {
    console.warn('[programacao] limpeza supervisor/coordenador/auditor:', error);
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

        if (bloqueados.length) limparConfirmadosBloqueados(originalFrom, bloqueados);
        return { ...payload, data: filtrados };
      } catch (error) {
        console.warn('[programacao] filtro supervisor/coordenador/auditor:', error);
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

function fallbackCandidatosRows(osPayload, colaboradores, excluirIds, dataFiltrada) {
  const porOs = new Map();
  (dataFiltrada || []).forEach((row) => {
    const key = String(row.os_id || '');
    if (!porOs.has(key)) porOs.set(key, []);
    porOs.get(key).push(row);
  });

  const excluidos = new Set(unique(excluirIds));
  const disponiveis = (colaboradores || []).filter((c) => !excluidos.has(String(c.colaborador_id))).slice(0, 20);
  if (!disponiveis.length) return dataFiltrada || [];

  const out = [...(dataFiltrada || [])];
  (osPayload || []).forEach((osItem) => {
    const osId = String(osItem?.os_id || '');
    const atuais = porOs.get(osId) || [];
    if (atuais.length >= 8) return;

    const jaNaOs = new Set(atuais.map((r) => String(r.colaborador_id)));
    disponiveis
      .filter((c) => !jaNaOs.has(String(c.colaborador_id)))
      .slice(0, 8 - atuais.length)
      .forEach((c, idx) => {
        out.push({
          os_id: osItem.os_id,
          colaborador_id: c.colaborador_id,
          nome: c.nome,
          cargo: c.cargo || null,
          coordenacao: c.coordenacao || null,
          supervisao: c.supervisao || null,
          tipo_contrato: null,
          km: null,
          auditorias_qtd: null,
          auditorias_peso: null,
          veiculo_id: null,
          veiculo_placa: null,
          colab_lat: null,
          colab_lng: null,
          custo_total: null,
          score: 0.01 - idx * 0.0001,
          score_contrato: 0,
          score_distancia: 0,
          score_auditoria: 0,
        });
      });
  });
  return out;
}

function patchRpc(originalRpc, originalFrom) {
  return function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);

    if (fn === 'programacao_colaboradores_supervisao') {
      return Promise.resolve(result).then(async (payload) => {
        if (!payload || !Array.isArray(payload.data)) return payload;
        const sup = params?.p_supervisao;
        const elegiveis = await carregarColaboradoresElegiveis(originalFrom, sup);
        if (elegiveis.length) return { ...payload, data: elegiveis };
        return { ...payload, data: payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo)) };
      });
    }

    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then(async (payload) => {
      if (!payload || !Array.isArray(payload.data)) return payload;
      const filtrada = payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo));
      const elegiveis = await carregarColaboradoresElegiveis(originalFrom, params?.p_supervisao);
      return {
        ...payload,
        data: fallbackCandidatosRows(params?.p_os || [], elegiveis, params?.p_excluir_colaborador_ids || [], filtrada),
      };
    });
  };
}

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = patchFrom(originalFrom);
  supabase.rpc = patchRpc(supabase.rpc.bind(supabase), originalFrom);
  supabase[PATCH_FLAG] = true;
}
