// Programação: força a reutilização da programação mais recente do dia/supervisão.
// Evita que alterações sucessivas caiam em programações antigas e dupliquem despesas.
import { supabase } from './supabaseClient.js';

const PATCH_KEY = '__progUltimaProgramacaoFixApplied';

if (!supabase[PATCH_KEY] && typeof supabase.from === 'function') {
  const originalFrom = supabase.from.bind(supabase);

  function patchBuilder(builder) {
    if (!builder || typeof builder !== 'object' || builder.__progUltimaPatched) return builder;

    Object.defineProperty(builder, '__progUltimaPatched', { value: true });

    [
      'select', 'eq', 'neq', 'is', 'in', 'or', 'match', 'filter',
      'limit', 'range', 'order', 'not', 'contains', 'containedBy',
    ].forEach((method) => {
      const original = builder[method];
      if (typeof original !== 'function') return;
      builder[method] = function patchedMethod(...args) {
        return patchBuilder(original.apply(this, args));
      };
    });

    if (typeof builder.maybeSingle === 'function') {
      const originalMaybeSingle = builder.maybeSingle.bind(builder);
      Object.defineProperty(builder, '__progOriginalMaybeSingle', { value: originalMaybeSingle });

      builder.maybeSingle = function patchedMaybeSingle(...args) {
        let target = builder;

        // O núcleo faz: programacao_dia -> data + supervisão -> limit(1) -> maybeSingle().
        // Sem ORDER BY o Supabase pode devolver uma programação antiga do mesmo dia.
        // Aqui garantimos que a tela sempre usa a última edição realizada.
        if (!target.__progUltimaOrdenada && typeof target.order === 'function') {
          try {
            target = target.order('updated_at', { ascending: false });
            target = target.order('created_at', { ascending: false });
            Object.defineProperty(target, '__progUltimaOrdenada', { value: true });
          } catch (error) {
            console.warn('[programacao] não foi possível ordenar última programação', error);
          }
        }

        const maybeSingle = target.__progOriginalMaybeSingle || originalMaybeSingle;
        return maybeSingle.apply(target, args);
      };
    }

    return builder;
  }

  supabase.from = function patchedFrom(table, ...args) {
    const builder = originalFrom(table, ...args);
    return String(table) === 'programacao_dia' ? patchBuilder(builder) : builder;
  };

  Object.defineProperty(supabase, PATCH_KEY, { value: true });
}
