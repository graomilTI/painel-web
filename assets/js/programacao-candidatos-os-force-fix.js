// Programação — blindagem definitiva para O.S. sem candidato.
//
// Mantém Supervisor/Coordenador/Auditor fora do embarque, mas garante que a O.S.
// nunca fique travada em "Nenhum candidato disponível" quando existir qualquer
// colaborador elegível no contexto da programação/regional.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoCandidatosOsForceFixV1';
const cache = new Map();

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function isCargoBloqueado(value) {
  const c = norm(value);
  return c.includes('SUPERVISOR')
    || c.includes('AUDITOR')
    || c.includes('COORDENADOR')
    || c.includes('COORDENADORA')
    || c === 'COORDENACAO'
    || c.startsWith('COORDENACAO ');
}

function isInativo(row) {
  if (row?.ativo === false) return true;
  if (String(row?.desligamento || '').trim()) return true;
  const s = norm(row?.situacao || row?.status || row?.disponibilidade);
  return ['INATIVO', 'INATIVA', 'NAO ATIVO', 'NAO ATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA', 'INDISPONIVEL'].some((x) => s.includes(x));
}

function idColab(row) {
  return String(row?.colaborador_id || row?.colaboradorId || cpf(row?.cpf) || row?.id || row?.nome_colaborador || row?.nome || '').trim();
}

function nomeColab(row) {
  return String(row?.nome || row?.nome_colaborador || row?.colaborador_nome || '').trim();
}

function toCandidateSource(row, sup) {
  const id = idColab(row);
  const nome = nomeColab(row);
  if (!id || !nome || isCargoBloqueado(row?.cargo) || isInativo(row)) return null;
  return {
    colaborador_id: id,
    nome,
    cargo: row?.cargo || null,
    coordenacao: row?.coordenacao || null,
    supervisao: row?.supervisao || sup || null,
    veiculo_id: row?.veiculo_id || null,
    veiculo_placa: row?.veiculo_placa || null,
    colab_lat: row?.latitude || row?.lat || row?.colab_lat || null,
    colab_lng: row?.longitude || row?.lng || row?.colab_lng || null,
  };
}

function tokensSupervisao(sup) {
  const n = norm(sup);
  const tokens = n.split(' ').filter((t) => t.length >= 3 && !['REGIONAL', 'SETOR'].includes(t));
  return { full: n, tokens };
}

function scoreEscopo(row, supInfo) {
  const campos = [row.supervisao, row.coordenacao, row.regional, row.unidade, row.cidade].map(norm).filter(Boolean);
  if (!supInfo.full) return 1;
  if (campos.some((c) => c === supInfo.full)) return 100;
  if (campos.some((c) => c.includes(supInfo.full) || supInfo.full.includes(c))) return 80;
  const hits = supInfo.tokens.filter((t) => campos.some((c) => c.includes(t) || t.includes(c))).length;
  return hits;
}

async function latestSnapshotDate() {
  const { data } = await supabase
    .from('colaborador_snapshot')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1);
  return data?.[0]?.data_referencia || null;
}

async function buscarProgramacaoColaboradores(programacaoId, supervisao) {
  if (!programacaoId) return [];
  try {
    const { data, error } = await supabase
      .from('programacao_colaboradores')
      .select('colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,disponibilidade')
      .eq('programacao_id', programacaoId)
      .limit(5000);
    if (error) throw error;
    const supInfo = tokensSupervisao(supervisao);
    return (data || [])
      .filter((r) => !['OK', 'LOGISTICA'].includes(norm(r.disponibilidade)))
      .map((r) => ({ ...r, _escopo: scoreEscopo(r, supInfo) }))
      .filter((r) => r._escopo > 0)
      .sort((a, b) => b._escopo - a._escopo || nomeColab(a).localeCompare(nomeColab(b), 'pt-BR'))
      .map((r) => toCandidateSource(r, supervisao))
      .filter(Boolean);
  } catch (error) {
    console.warn('[programacao] fallback programacao_colaboradores:', error);
    return [];
  }
}

async function buscarSnapshot(supervisao) {
  try {
    const dataRef = await latestSnapshotDate();
    if (!dataRef) return [];
    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('cpf,nome,cargo,coordenacao,supervisao,regional,cidade,situacao,ativo,desligamento,latitude,longitude')
      .eq('data_referencia', dataRef)
      .limit(12000);
    if (error) throw error;

    const supInfo = tokensSupervisao(supervisao);
    return (data || [])
      .map((r) => ({ ...r, _escopo: scoreEscopo(r, supInfo) }))
      .filter((r) => r._escopo > 0)
      .sort((a, b) => b._escopo - a._escopo || nomeColab(a).localeCompare(nomeColab(b), 'pt-BR'))
      .map((r) => toCandidateSource(r, supervisao))
      .filter(Boolean);
  } catch (error) {
    console.warn('[programacao] fallback snapshot:', error);
    return [];
  }
}

async function buscarRpcRegional(originalRpc, supervisao) {
  try {
    const payload = await originalRpc('programacao_colaboradores_supervisao', { p_supervisao: supervisao });
    return (payload?.data || []).map((r) => toCandidateSource(r, supervisao)).filter(Boolean);
  } catch (error) {
    console.warn('[programacao] fallback rpc regional:', error);
    return [];
  }
}

async function candidatosFallback(originalRpc, supervisao) {
  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const key = `${programacaoId || ''}|${supervisao || ''}`;
  if (cache.has(key)) return cache.get(key);

  const promise = (async () => {
    const fontes = [
      ...(await buscarProgramacaoColaboradores(programacaoId, supervisao)),
      ...(await buscarRpcRegional(originalRpc, supervisao)),
      ...(await buscarSnapshot(supervisao)),
    ];
    const seen = new Set();
    return fontes.filter((c) => {
      const id = String(c.colaborador_id || c.nome);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  })();

  cache.set(key, promise);
  return promise;
}

function qtdPorOs(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const osId = String(r.os_id || '');
    if (!osId) return;
    m.set(osId, (m.get(osId) || 0) + 1);
  });
  return m;
}

function montarLinha(osItem, cand, idx) {
  return {
    os_id: osItem.os_id,
    colaborador_id: cand.colaborador_id,
    nome: cand.nome,
    cargo: cand.cargo || null,
    coordenacao: cand.coordenacao || null,
    supervisao: cand.supervisao || null,
    tipo_contrato: null,
    km: null,
    auditorias_qtd: null,
    auditorias_peso: null,
    veiculo_id: cand.veiculo_id || null,
    veiculo_placa: cand.veiculo_placa || null,
    colab_lat: cand.colab_lat || null,
    colab_lng: cand.colab_lng || null,
    custo_total: null,
    score: Math.max(0.001, 0.05 - idx * 0.0005),
    score_contrato: 0,
    score_distancia: 0,
    score_auditoria: 0,
  };
}

function preencherOsVazias(rows, osPayload, candidatos, excluirIds) {
  const out = [...(rows || [])];
  const porOs = qtdPorOs(out);
  const excluidos = new Set((excluirIds || []).map(String));
  const usados = new Set(out.map((r) => String(r.colaborador_id)).filter(Boolean));

  (osPayload || []).forEach((osItem) => {
    const osId = String(osItem?.os_id || '');
    if (!osId || (porOs.get(osId) || 0) > 0) return;

    const lista = candidatos
      .filter((c) => !excluidos.has(String(c.colaborador_id)))
      .filter((c) => !usados.has(String(c.colaborador_id)))
      .slice(0, 8);

    lista.forEach((c, idx) => {
      usados.add(String(c.colaborador_id));
      out.push(montarLinha(osItem, c, idx));
    });
  });
  return out;
}

function patch() {
  if (supabase[PATCH_FLAG]) return;
  const originalRpc = supabase.rpc.bind(supabase);

  supabase.rpc = function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);

    if (fn === 'programacao_colaboradores_supervisao') {
      return Promise.resolve(result).then(async (payload) => {
        const filtrado = (payload?.data || []).map((r) => toCandidateSource(r, params?.p_supervisao)).filter(Boolean);
        if (filtrado.length) return { ...payload, data: filtrado };
        const fallback = await candidatosFallback(originalRpc, params?.p_supervisao);
        return { ...(payload || {}), data: fallback };
      });
    }

    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then(async (payload) => {
      const base = Array.isArray(payload?.data) ? payload.data : [];
      const filtrados = base.filter((r) => !isCargoBloqueado(r?.cargo));
      const porOs = qtdPorOs(filtrados);
      const falta = (params?.p_os || []).some((osItem) => !porOs.get(String(osItem?.os_id || '')));
      if (!falta) return { ...(payload || {}), data: filtrados };

      const fallback = await candidatosFallback(originalRpc, params?.p_supervisao);
      const data = preencherOsVazias(filtrados, params?.p_os || [], fallback, params?.p_excluir_colaborador_ids || []);
      return { ...(payload || {}), data };
    });
  };

  supabase[PATCH_FLAG] = true;
}

patch();
