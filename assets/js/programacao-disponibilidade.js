// Programação — regras de disponibilidade/indisponibilidade dos colaboradores e leitura das indisponibilidades do RH.
// Extraído de programacao.js em 15/10/2026 (declarações do topo do arquivo e funções de renderContent que não
// dependem do estado da tela). Código movido sem alteração. Ao editar, troque o ?v= deste módulo em TODOS os
// imports (programacao.js e demais módulos programacao-*): o teste tests/programacao-modulos-versao.test.mjs confere.
import { supabase } from './supabaseClient.js';
import { DISPONIBILIDADES_LIBERADAS, INDISPONIBILIDADE_MOTIVOS } from './programacao-constantes.js?v=20261015-nucleo1';
import { normalizeCpf, normalizeText } from './programacao-util.js?v=20261015-nucleo1';

function disponibilidadeNorm(value) {
  return normalizeText(value).replace('INDISPONIVEL', 'INDISPONIVEL').replace('FERIAS', 'FERIAS');
}

function disponibilidadeCategoria(value) {
  const norm = disponibilidadeNorm(value);
  if (INDISPONIBILIDADE_MOTIVOS.includes(norm) || norm === 'INDISPONIVEL') return 'INDISPONIVEL';
  if (norm === 'SEM EMBARQUE') return 'SEM EMBARQUE';
  if (norm === 'LOGISTICA') return 'LOGISTICA';
  if (norm === 'DESLOCAMENTO') return 'DESLOCAMENTO';
  return 'OK';
}

function disponibilidadeMotivo(value) {
  const norm = disponibilidadeNorm(value);
  return INDISPONIBILIDADE_MOTIVOS.includes(norm) ? norm : '';
}

function disponibilidadeLabel(value) {
  const norm = disponibilidadeNorm(value);
  const labels = {
    OK: 'OK',
    LOGISTICA: 'Logística',
    DESLOCAMENTO: 'Deslocamento',
    'SEM EMBARQUE': 'Sem Embarque',
    INDISPONIVEL: 'Indisponível',
    ATESTADO: 'Atestado',
    FALTA: 'Falta',
    FERIAS: 'Férias',
    FOLGA: 'Folga',
  };
  return labels[norm] || String(value || 'OK');
}

  // Une a tabela legada `indisponibilidades` (importada, chaveada por CPF) com
  // os lançamentos novos do RH (rh_ferias/rh_atestados, chaveados por uuid de
  // `colaboradores` — resolvido pra CPF aqui). Sem a parte do RH, férias e
  // atestado lançados em RH > Indisponibilidade não pré-marcavam o colaborador
  // como INDISPONÍVEL no roster da programação.
  async function loadIndisponibilidades(dataReferencia) {
    try {
      const [legado, ferias, atestados] = await Promise.all([
        supabase
          .from('indisponibilidades')
          .select('colaborador_cpf, colaborador_nome, data_inicio, data_fim, motivo')
          .lte('data_inicio', dataReferencia)
          .or(`data_fim.is.null,data_fim.gte.${dataReferencia}`),
        supabase
          .from('rh_ferias')
          .select('colaborador_id, colaborador_nome, data_inicio, data_fim')
          .in('status', ['programada', 'em_gozo'])
          .eq('permite_escala', false)
          .lte('data_inicio', dataReferencia)
          .gte('data_fim', dataReferencia),
        supabase
          .from('rh_atestados')
          .select('colaborador_id, colaborador_nome, data_inicio, data_fim')
          .in('status', ['lancado', 'aprovado'])
          .lte('data_inicio', dataReferencia)
          .gte('data_fim', dataReferencia),
      ]);
      const map = new Map((legado.data || []).map((r) => [normalizeCpf(r.colaborador_cpf), r]));

      const rhRows = [
        ...(ferias.data || []).map((r) => ({ ...r, motivo: 'FERIAS' })),
        ...(atestados.data || []).map((r) => ({ ...r, motivo: 'ATESTADO' })),
      ];
      const ids = [...new Set(rhRows.map((r) => r.colaborador_id).filter(Boolean))];
      const cpfPorId = new Map();
      if (ids.length) {
        const { data: cads } = await supabase.from('colaboradores').select('id,cpf').in('id', ids);
        (cads || []).forEach((c) => cpfPorId.set(String(c.id), normalizeCpf(c.cpf)));
      }
      rhRows.forEach((r) => {
        const cpf = r.colaborador_id ? cpfPorId.get(String(r.colaborador_id)) : '';
        if (!cpf || map.has(cpf)) return;
        map.set(cpf, {
          colaborador_cpf: cpf,
          colaborador_nome: r.colaborador_nome,
          data_inicio: r.data_inicio,
          data_fim: r.data_fim,
          motivo: r.motivo,
        });
      });
      return map;
    } catch (_) {
      return new Map();
    }
  }

  function isDisponibilidadeBloqueada(value) {
    const normalized = disponibilidadeNorm(value);
    return !DISPONIBILIDADES_LIBERADAS.has(normalized);
  }

export { disponibilidadeNorm, disponibilidadeCategoria, disponibilidadeMotivo, disponibilidadeLabel, loadIndisponibilidades, isDisponibilidadeBloqueada };
