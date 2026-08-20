import { supabase } from './supabaseClient.js';

// Guarda final de escopo para leituras de operacional_os na Programacao.
// Regra funcional:
// - supervisao especifica => somente aquela supervisao;
// - Todas => somente supervisoes atualmente liberadas/visiveis no seletor;
// - Todas sem nenhuma supervisao liberada => nenhuma O.S.
//
// A trava fica na camada de leitura para impedir que um programacaoIdMap antigo
// ou uma lista intermediaria ampla faca O.S. de outra supervisao chegar ao
// frontend. Mutacoes nao sao alteradas: apenas SELECTs iniciados diretamente
// em operacional_os recebem o filtro adicional.

const TODAS = '__TODAS__';
const SEM_ACESSO = '__SEM_SUPERVISAO_AUTORIZADA__';

function supervisoesLiberadasNoSeletor() {
  const select = document.getElementById('progSup');
  if (!select) return { modo: 'sem-contexto', supervisoes: [] };

  const selecionada = String(select.value || '').trim();
  if (!selecionada) return { modo: 'sem-contexto', supervisoes: [] };

  if (selecionada !== TODAS) {
    return { modo: 'especifica', supervisoes: [selecionada] };
  }

  const supervisoes = [...select.options]
    .filter((opt) => {
      const value = String(opt.value || '').trim();
      return value
        && value !== TODAS
        && !opt.disabled
        && !opt.hidden;
    })
    .map((opt) => String(opt.value || '').trim())
    .filter(Boolean);

  return {
    modo: 'todas',
    supervisoes: [...new Set(supervisoes)],
  };
}

if (!window.__programacaoOsSupervisaoScopeInstalled) {
  const fromAnterior = supabase.from.bind(supabase);

  supabase.from = function fromComEscopo(table) {
    const builder = fromAnterior(table);
    if (String(table) !== 'operacional_os' || !builder?.select) return builder;

    const selectAnterior = builder.select.bind(builder);
    builder.select = (...args) => {
      let query = selectAnterior(...args);
      const escopo = supervisoesLiberadasNoSeletor();

      // Antes de o contexto existir, nao interfere em leituras auxiliares de
      // boot. Assim que uma supervisao estiver selecionada, o escopo passa a
      // ser obrigatorio para toda leitura direta de operacional_os.
      if (escopo.modo === 'especifica') {
        query = query.eq('supervisao', escopo.supervisoes[0]);
      } else if (escopo.modo === 'todas') {
        query = escopo.supervisoes.length
          ? query.in('supervisao', escopo.supervisoes)
          : query.eq('supervisao', SEM_ACESSO);
      }

      return query;
    };

    return builder;
  };

  window.__programacaoOsSupervisaoScopeInstalled = true;
  window.__programacaoOsSupervisoesLiberadas = supervisoesLiberadasNoSeletor;
}
