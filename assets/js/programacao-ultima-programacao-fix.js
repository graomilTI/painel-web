// Programação: força a reutilização da programação mais recente do dia/supervisão
// e evita que trocas de equipe deixem linhas antigas duplicando despesas.
import { supabase } from './supabaseClient.js';

const PATCH_KEY = '__progUltimaProgramacaoFixApplied';

if (!supabase[PATCH_KEY] && typeof supabase.from === 'function') {
  const originalFrom = supabase.from.bind(supabase);

  function patchProgramacaoDiaBuilder(builder) {
    if (!builder || typeof builder !== 'object' || builder.__progUltimaPatched) return builder;

    Object.defineProperty(builder, '__progUltimaPatched', { value: true });

    [
      'select', 'eq', 'neq', 'is', 'in', 'or', 'match', 'filter',
      'limit', 'range', 'order', 'not', 'contains', 'containedBy',
    ].forEach((method) => {
      const original = builder[method];
      if (typeof original !== 'function') return;
      builder[method] = function patchedMethod(...args) {
        return patchProgramacaoDiaBuilder(original.apply(this, args));
      };
    });

    if (typeof builder.maybeSingle === 'function') {
      const originalMaybeSingle = builder.maybeSingle.bind(builder);
      Object.defineProperty(builder, '__progOriginalMaybeSingle', { value: originalMaybeSingle });

      builder.maybeSingle = function patchedMaybeSingle(...args) {
        let target = builder;

        // O núcleo faz: programacao_dia -> data + supervisão -> limit(1) -> maybeSingle().
        // Sem ORDER BY o Supabase pode devolver uma programação antiga do mesmo dia.
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

  async function limparEquipeAntiga(payload) {
    const rows = (Array.isArray(payload) ? payload : [payload])
      .filter((row) => row?.programacao_id && row?.os_id && row?.colaborador_id && row.confirmado === true);

    if (!rows.length) return;

    const grupos = new Map();
    rows.forEach((row) => {
      const key = `${row.programacao_id}::${row.os_id}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          programacaoId: row.programacao_id,
          osId: row.os_id,
          manter: new Set(),
        });
      }
      grupos.get(key).manter.add(String(row.colaborador_id));
    });

    for (const grupo of grupos.values()) {
      const { data, error } = await originalFrom('programacao_equipe')
        .select('id,colaborador_id')
        .eq('programacao_id', grupo.programacaoId)
        .eq('os_id', grupo.osId)
        .eq('confirmado', true);

      if (error) throw error;

      const idsParaExcluir = (data || [])
        .filter((row) => !grupo.manter.has(String(row.colaborador_id)))
        .map((row) => row.id)
        .filter(Boolean);

      if (idsParaExcluir.length) {
        const { error: delError } = await originalFrom('programacao_equipe')
          .delete()
          .in('id', idsParaExcluir);
        if (delError) throw delError;
      }
    }
  }

  function patchEquipeUpsertResult(builder, payload, meta = { skipCleanup: false, cleaned: false }) {
    if (!builder || typeof builder !== 'object' || builder.__progEquipeUpsertPatched) return builder;
    Object.defineProperty(builder, '__progEquipeUpsertPatched', { value: true });

    ['select', 'single', 'maybeSingle', 'limit', 'order'].forEach((method) => {
      const original = builder[method];
      if (typeof original !== 'function') return;
      builder[method] = function patchedEquipeMethod(...args) {
        if (method === 'select') meta.skipCleanup = true;
        return patchEquipeUpsertResult(original.apply(this, args), payload, meta);
      };
    });

    if (typeof builder.then === 'function') {
      const originalThen = builder.then.bind(builder);
      builder.then = async function patchedEquipeThen(onFulfilled, onRejected) {
        try {
          if (!meta.skipCleanup && !meta.cleaned) {
            meta.cleaned = true;
            await limparEquipeAntiga(payload);
          }
          return originalThen(onFulfilled, onRejected);
        } catch (error) {
          console.warn('[programacao] não foi possível limpar equipe antiga', error);
          if (typeof onRejected === 'function') return onRejected(error);
          throw error;
        }
      };
    }

    return builder;
  }

  function patchProgramacaoEquipeBuilder(builder) {
    if (!builder || typeof builder !== 'object' || builder.__progEquipePatched) return builder;
    Object.defineProperty(builder, '__progEquipePatched', { value: true });

    const originalUpsert = builder.upsert;
    if (typeof originalUpsert === 'function') {
      builder.upsert = function patchedEquipeUpsert(payload, ...args) {
        return patchEquipeUpsertResult(originalUpsert.apply(this, [payload, ...args]), payload);
      };
    }

    return builder;
  }

  supabase.from = function patchedFrom(table, ...args) {
    const builder = originalFrom(table, ...args);
    const tableName = String(table);
    if (tableName === 'programacao_dia') return patchProgramacaoDiaBuilder(builder);
    if (tableName === 'programacao_equipe') return patchProgramacaoEquipeBuilder(builder);
    return builder;
  };

  Object.defineProperty(supabase, PATCH_KEY, { value: true });
}
