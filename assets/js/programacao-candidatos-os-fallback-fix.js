// Programação — fallback real para O.S. sem candidato.
//
// O ranking da RPC pode voltar vazio quando os primeiros colocados são cargos
// bloqueados (Supervisor/Coordenador/Auditor) ou quando a regional não casa com
// colaborador_snapshot. Este patch garante que a Programação nunca deixe a O.S.
// sem opção: se a RPC de ranking vier vazia, busca a lista completa da regional
// pela RPC programacao_colaboradores_supervisao, filtra cargos bloqueados quando
// houver cargo no snapshot, e injeta opções simples para o gestor escolher.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoCandidatosOsFallbackFixV1';
const listaRegionalCache = new Map();

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

function isCargoBloqueado(value) {
  const cargo = normalizeText(value);
  return cargo.includes('SUPERVISOR')
    || cargo.includes('AUDITOR')
    || cargo.includes('COORDENADOR')
    || cargo.includes('COORDENADORA')
    || cargo.includes('ADMINISTRATIVO')
    || cargo === 'COORDENACAO'
    || cargo.startsWith('COORDENACAO ');
}

// Coordenação "Geral" (ou "... - Geral") é backoffice/HQ, não escala equipe
// de campo — não deve aparecer como candidato de embarque.
function isCoordenacaoBloqueada(value) {
  const c = normalizeText(value);
  return c === 'GERAL' || c.endsWith(' GERAL');
}

function colaboradorId(row) {
  return String(row?.colaborador_id || row?.colaboradorId || cpfNorm(row?.cpf) || row?.id || row?.nome || '').trim();
}

function colaboradorNome(row) {
  return String(row?.nome || row?.nome_colaborador || row?.colaborador_nome || '').trim();
}

function keyNome(nome) {
  return normalizeText(nome);
}

function toColaborador(row, fallbackSupervisao) {
  const id = colaboradorId(row);
  const nome = colaboradorNome(row);
  if (!id || !nome) return null;
  return {
    colaborador_id: id,
    nome,
    cargo: row?.cargo || null,
    coordenacao: row?.coordenacao || null,
    supervisao: row?.supervisao || fallbackSupervisao || null,
  };
}

async function enriquecerEFiltrarPorCargo(rows, supervisao) {
  const base = (rows || []).map((r) => toColaborador(r, supervisao)).filter(Boolean);
  if (!base.length) return [];

  // Se a própria RPC já trouxe cargo, filtra direto.
  if (base.some((r) => r.cargo)) {
    return base.filter((r) => !isCargoBloqueado(r.cargo) && !isCoordenacaoBloqueada(r.coordenacao));
  }

  // Se a RPC não trouxe cargo, tenta enriquecer pelo snapshot mais recente por nome/CPF.
  try {
    const latest = await supabase
      .from('colaborador_snapshot')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);

    const dataRef = latest?.data?.[0]?.data_referencia;
    if (!dataRef) return base;

    const nomes = [...new Set(base.map((r) => r.nome).filter(Boolean))].slice(0, 500);
    const cpfs = [...new Set(base.map((r) => cpfNorm(r.colaborador_id)).filter(Boolean))].slice(0, 500);

    const consultas = [];
    if (nomes.length) {
      consultas.push(supabase
        .from('colaborador_snapshot')
        .select('cpf,nome,cargo,coordenacao,supervisao')
        .eq('data_referencia', dataRef)
        .in('nome', nomes));
    }
    if (cpfs.length) {
      consultas.push(supabase
        .from('colaborador_snapshot')
        .select('cpf,nome,cargo,coordenacao,supervisao')
        .eq('data_referencia', dataRef)
        .in('cpf', cpfs));
    }

    const results = await Promise.all(consultas);
    const snapRows = results.flatMap((r) => Array.isArray(r.data) ? r.data : []);
    const porCpf = new Map();
    const porNome = new Map();
    snapRows.forEach((r) => {
      const cpf = cpfNorm(r.cpf);
      if (cpf) porCpf.set(cpf, r);
      if (r.nome) porNome.set(keyNome(r.nome), r);
    });

    return base
      .map((r) => {
        const snap = porCpf.get(cpfNorm(r.colaborador_id)) || porNome.get(keyNome(r.nome));
        return snap ? {
          ...r,
          cargo: snap.cargo || r.cargo || null,
          coordenacao: snap.coordenacao || r.coordenacao || null,
          supervisao: snap.supervisao || r.supervisao || supervisao || null,
        } : r;
      })
      .filter((r) => !isCargoBloqueado(r.cargo) && !isCoordenacaoBloqueada(r.coordenacao));
  } catch (error) {
    console.warn('[programacao] fallback candidatos: não foi possível enriquecer cargo.', error);
    return base;
  }
}

async function carregarListaRegional(originalRpc, supervisao) {
  const sup = String(supervisao || '').trim();
  if (!sup) return [];
  if (listaRegionalCache.has(sup)) return listaRegionalCache.get(sup);

  const promise = Promise.resolve(originalRpc('programacao_colaboradores_supervisao', { p_supervisao: sup }))
    .then(async (payload) => {
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const filtrados = await enriquecerEFiltrarPorCargo(rows, sup);
      const seen = new Set();
      return filtrados.filter((c) => {
        const key = String(c.colaborador_id || c.nome);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .catch((error) => {
      console.warn('[programacao] fallback candidatos: lista regional indisponível.', error);
      return [];
    });

  listaRegionalCache.set(sup, promise);
  return promise;
}

function scoreFallback(index) {
  return Math.max(0.001, 0.02 - index * 0.0002);
}

function temCandidatoPorOs(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const osId = String(r.os_id || '');
    if (!map.has(osId)) map.set(osId, 0);
    map.set(osId, map.get(osId) + 1);
  });
  return map;
}

function montarFallbackPorOs(osPayload, listaRegional, excluirIds, rowsAtuais) {
  const out = [...(rowsAtuais || [])];
  const qtdPorOs = temCandidatoPorOs(out);
  const excluidos = new Set((excluirIds || []).map(String));
  const usadosNoFallback = new Set();

  (osPayload || []).forEach((osItem) => {
    const osId = String(osItem?.os_id || '');
    const qtdAtual = qtdPorOs.get(osId) || 0;
    if (!osId || qtdAtual > 0) return;

    const candidatos = listaRegional
      .filter((c) => !excluidos.has(String(c.colaborador_id)))
      .filter((c) => !usadosNoFallback.has(String(c.colaborador_id)))
      .slice(0, 8);

    candidatos.forEach((c, idx) => {
      usadosNoFallback.add(String(c.colaborador_id));
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
        score: scoreFallback(idx),
        score_contrato: 0,
        score_distancia: 0,
        score_auditoria: 0,
      });
    });
  });

  return out;
}

function patchRpc() {
  if (supabase[PATCH_FLAG]) return;

  const originalRpc = supabase.rpc.bind(supabase);

  supabase.rpc = function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);

    if (fn === 'programacao_colaboradores_supervisao') {
      return Promise.resolve(result).then(async (payload) => {
        if (!payload || !Array.isArray(payload.data)) return payload;
        const lista = await enriquecerEFiltrarPorCargo(payload.data, params?.p_supervisao);
        listaRegionalCache.set(String(params?.p_supervisao || '').trim(), Promise.resolve(lista));
        return { ...payload, data: lista };
      });
    }

    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then(async (payload) => {
      if (!payload || !Array.isArray(payload.data)) return payload;

      const filtrados = payload.data.filter((row) => !isCargoBloqueado(row?.cargo) && !isCoordenacaoBloqueada(row?.coordenacao));
      const qtdPorOs = temCandidatoPorOs(filtrados);
      const faltaAlgumaOs = (params?.p_os || []).some((osItem) => !qtdPorOs.get(String(osItem?.os_id || '')));
      if (!faltaAlgumaOs) return { ...payload, data: filtrados };

      const listaRegional = await carregarListaRegional(originalRpc, params?.p_supervisao);
      const comFallback = montarFallbackPorOs(
        params?.p_os || [],
        listaRegional,
        params?.p_excluir_colaborador_ids || [],
        filtrados,
      );

      return { ...payload, data: comFallback };
    });
  };

  supabase[PATCH_FLAG] = true;
}

patchRpc();
