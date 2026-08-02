import { supabase } from './supabaseClient.js';

// A lista regional da Programação já vem pronta da RPC
// `programacao_colaboradores_supervisao` e é processada por
// `loadColaboradoresRegional` em programacao-equipe.js.
//
// Este arquivo existia como um interceptor global de `supabase.from()` para
// filtrar novamente `colaboradores_atuais`. Essa segunda filtragem reduzia a
// lista correta retornada pela RPC (19 colaboradores em MT2 - Sul) para apenas
// 1 nome em algumas sessões. Mantemos o módulo apenas como marcador de versão,
// sem alterar o cliente Supabase ou interceptar consultas.

window.programacaoRegionalColaboradores = {
  fonte: 'programacao_colaboradores_supervisao',
  modo: 'rpc-sem-interceptor',
  versao: '20260802-v4',
  async diagnostico(supervisao) {
    const alvo = String(
      supervisao || document.querySelector('#progSup')?.value || ''
    ).trim();

    if (!alvo) {
      return {
        supervisao: '',
        quantidade: 0,
        erro: 'Selecione uma supervisão.',
      };
    }

    const { data, error } = await supabase.rpc(
      'programacao_colaboradores_supervisao',
      { p_supervisao: alvo }
    );

    return {
      supervisao: alvo,
      quantidade: Array.isArray(data) ? data.length : 0,
      erro: error?.message || null,
      colaboradores: data || [],
    };
  },
};

console.info(
  '[programacao-regional] RPC oficial ativa; interceptor regional removido.'
);
