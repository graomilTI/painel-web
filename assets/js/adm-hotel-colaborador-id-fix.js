import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__admHotelColaboradorIdFixV1';
const TARGET_TABLE = 'hospedagem_solicitacao_colaboradores';
const TARGET_SELECT = 'solicitacao_id,nome_colaborador,supervisao,regional,coordenacao,empresa,tipo_colaborador';

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);

  supabase.from = function patchedFrom(relation) {
    const builder = originalFrom(relation);

    if (relation === TARGET_TABLE && builder && typeof builder.select === 'function') {
      const originalSelect = builder.select.bind(builder);

      builder.select = function patchedSelect(columns = '*', options) {
        let nextColumns = columns;

        if (typeof columns === 'string') {
          const compact = columns.replace(/\s+/g, '');
          const target = TARGET_SELECT.replace(/\s+/g, '');
          const hasId = /(^|,)id(,|$)/.test(compact);
          const hasColaboradorId = /(^|,)colaborador_id(,|$)/.test(compact);

          if (compact.includes(target) && (!hasId || !hasColaboradorId)) {
            const prefix = [!hasId ? 'id' : '', !hasColaboradorId ? 'colaborador_id' : '']
              .filter(Boolean)
              .join(',');
            nextColumns = `${prefix},${columns}`;
          }
        }

        return originalSelect(nextColumns, options);
      };
    }

    return builder;
  };

  Object.defineProperty(supabase, PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
