import { supabase } from './supabaseClient.js';

// Ajuste temporário e seguro para os KPIs de Ordens de Serviço do Dashboard.
// O dashboard antigo contava todas as linhas de operacional_os e também misturava
// AGUARDAR dentro de PENDENTES. A base correta agora é somente situacao='Aberta':
// - Pendentes: status_gestor IS NULL
// - Conferência: status_gestor = 'ATENDER'
// - Total: todas as OS abertas
// Este patch atua apenas nas consultas head/count do dashboard, sem alterar dados.

const PATCH_FLAG = '__grao1000_dashboard_os_counts_fix__';

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);

  function patchBuilder(builder, meta = {}) {
    if (!builder || builder.__dashboardOsCountsPatched) return builder;

    Object.defineProperty(builder, '__dashboardOsCountsPatched', {
      value: true,
      configurable: true,
    });

    const originalSelect = builder.select?.bind(builder);
    const originalOr = builder.or?.bind(builder);
    const originalIs = builder.is?.bind(builder);

    if (originalSelect) {
      builder.select = function patchedSelect(columns, options = {}) {
        const selected = originalSelect(columns, options);
        if (
          meta.table === 'operacional_os'
          && options?.head === true
          && options?.count === 'exact'
          && typeof selected?.eq === 'function'
        ) {
          patchBuilder(selected, { ...meta, headCount: true });
          return selected.eq('situacao', 'Aberta');
        }
        return patchBuilder(selected, meta);
      };
    }

    if (originalOr) {
      builder.or = function patchedOr(filters, options) {
        if (
          meta.table === 'operacional_os'
          && meta.headCount
          && String(filters || '') === 'status_gestor.is.null,status_gestor.eq.AGUARDAR'
          && typeof builder.is === 'function'
        ) {
          builder.__dashboardOsPendentesQuery = true;
          return builder.is('status_gestor', null);
        }
        return patchBuilder(originalOr(filters, options), meta);
      };
    }

    if (originalIs) {
      builder.is = function patchedIs(column, value) {
        if (
          meta.table === 'operacional_os'
          && meta.headCount
          && builder.__dashboardOsPendentesQuery
          && column === 'configurada_em'
          && value === null
        ) {
          return builder;
        }
        return patchBuilder(originalIs(column, value), meta);
      };
    }

    return builder;
  }

  supabase.from = function patchedFrom(table) {
    return patchBuilder(originalFrom(table), { table });
  };

  Object.defineProperty(supabase, PATCH_FLAG, {
    value: true,
    configurable: false,
  });
}
