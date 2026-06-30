// Programação: correções pontuais carregadas depois do módulo principal.
//
// 1) Programação → Hospedagem: normaliza o vínculo de colaboradores.
//    O fluxo automático antigo enviava colaborador_nome/colaborador_cpf, mas o
//    módulo de Hospedagem e a view usam nome_colaborador/cpf.
//
// 2) Programação → Embarque: Supervisor e Auditor não podem entrar como
//    sugestão/candidato de O.S. O filtro abaixo blinda a resposta da RPC de
//    candidatos antes do auto-preenchimento usar os nomes.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoAjustesPontuaisFix';

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

  // Remove os nomes antigos para não gerar PGRST204 quando a coluna não existe.
  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = String(out.cpf).replace(/\D/g, '') || null;

  // Compatibilidade com o formulário manual de Hospedagem.
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

function patchHospedagemColaboradoresInsert(originalFrom) {
  return function patchedFrom(table) {
    const builder = originalFrom(table);
    if (table !== 'hospedagem_solicitacao_colaboradores' || builder.__hospColabInsertPatched) {
      return builder;
    }

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
    return builder;
  };
}

function patchCandidatosRpc(originalRpc) {
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
  supabase.from = patchHospedagemColaboradoresInsert(supabase.from.bind(supabase));
  supabase.rpc = patchCandidatosRpc(supabase.rpc.bind(supabase));
  supabase[PATCH_FLAG] = true;
}
