import { supabase } from './supabaseClient.js';

// Programação: a RPC `programacao_colaboradores_supervisao` é a fonte
// principal e já retorna somente a regional solicitada. O módulo
// `programacao-equipe.js`, porém, também executa um fallback em
// `colaboradores_atuais` e aplica um score aproximado por palavras. Esse score
// fazia "MATO GROSSO MT2 - Leste" e "MATO GROSSO MT2 - Campo Verde"
// aparecerem em "MATO GROSSO MT2 - Sul", porque todas compartilham os tokens
// MATO/GROSSO/MT2.
//
// Este patch atua SOMENTE nessa consulta de fallback e mantém apenas a
// supervisão exatamente selecionada. A RPC permanece intacta.

const originalFrom = supabase.from.bind(supabase);

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function selectedSupervisao() {
  const value = clean(document.querySelector('#progSup')?.value);
  const normalized = norm(value);
  if (!value || ['TODAS', 'TODOS', 'GERAL'].includes(normalized)) return '';
  return value;
}

function isRegionalFallbackQuery(columns) {
  const signature = norm(columns).replaceAll(' ', '');
  return [
    'CPF',
    'NOME',
    'CARGO',
    'COORDENACAO',
    'SUPERVISAO',
    'SITUACAO',
    'ATIVO',
    'DESLIGAMENTO',
  ].every((column) => signature.includes(column));
}

function wrapBuilder(builder, context) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => Promise.resolve(target)
          .then((result) => {
            if (
              result?.error
              || !Array.isArray(result?.data)
              || !isRegionalFallbackQuery(context.columns)
            ) {
              return result;
            }

            const supervisao = selectedSupervisao();
            if (!supervisao) return result;

            const targetSupervisao = norm(supervisao);
            const filtered = result.data.filter(
              (row) => norm(row?.supervisao) === targetSupervisao
            );

            console.info('[programacao-regional] fallback exato aplicado', {
              supervisao,
              recebidos: result.data.length,
              liberados: filtered.length,
            });

            return { ...result, data: filtered };
          })
          .then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args) => {
        if (prop === 'select') context.columns = clean(args[0]);
        const next = value.apply(target, args);
        if (next && typeof next === 'object') return wrapBuilder(next, context);
        return next;
      };
    },
  });
}

supabase.from = function regionalExactFrom(table) {
  const builder = originalFrom(table);
  if (String(table) !== 'colaboradores_atuais') return builder;
  return wrapBuilder(builder, { columns: '' });
};

window.programacaoRegionalColaboradores = {
  fonte: 'programacao_colaboradores_supervisao',
  fallback: 'colaboradores_atuais-supervisao-exata',
  versao: '20260802-v5',
  async diagnostico(supervisao) {
    const alvo = clean(
      supervisao || document.querySelector('#progSup')?.value || ''
    );

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
  '[programacao-regional] RPC oficial + fallback por supervisão exata (v5).'
);
