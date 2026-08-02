import { supabase } from './supabaseClient.js';

// Corrige a fonte da aba "Despesas da programação".
// A Conferência deve considerar somente colaboradores confirmados em uma O.S.
// da programação. Registros de disponibilidade criados para toda a regional
// não podem, sozinhos, gerar uma linha de despesa nem o almoço padrão.
const FILTERED_TABLES = new Set([
  'programacao_colaboradores',
  'programacao_estadia',
  'programacao_alimentacao',
  'programacao_deslocamento',
  'programacao_extras',
  'programacao_conferencia_status',
]);

const originalFrom = supabase.from.bind(supabase);
const rosterCache = new Map();
const CACHE_MS = 5000;

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function rosterKey(programacaoId, colaboradorId) {
  return `${clean(programacaoId)}::${clean(colaboradorId)}`;
}

async function loadConfirmedRoster(programacaoIds) {
  const ids = unique(programacaoIds).sort();
  if (!ids.length) return [];

  const cacheKey = ids.join(',');
  const cached = rosterCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;

  const { data, error } = await originalFrom('programacao_equipe')
    .select('programacao_id,colaborador_id,nome_colaborador,confirmado,os_id')
    .in('programacao_id', ids)
    .eq('confirmado', true)
    .not('os_id', 'is', null)
    .limit(10000);

  if (error) {
    console.error('[conferencia-roster-fix] Falha ao validar equipe confirmada:', error);
    // Falha fechada: é mais seguro não exibir despesas do que liberar todos os
    // ativos da regional quando não foi possível comprovar o vínculo com O.S.
    return [];
  }

  const dedup = new Map();
  for (const row of data || []) {
    const key = rosterKey(row.programacao_id, row.colaborador_id);
    if (!row.programacao_id || !row.colaborador_id || dedup.has(key)) continue;
    dedup.set(key, row);
  }

  const rows = [...dedup.values()];
  rosterCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
}

async function filterConferenceResult(table, result, programacaoIds) {
  if (!result || result.error || !Array.isArray(result.data)) return result;

  const roster = await loadConfirmedRoster(programacaoIds);
  const allowed = new Map(
    roster.map((row) => [rosterKey(row.programacao_id, row.colaborador_id), row]),
  );

  const filtered = result.data.filter((row) =>
    allowed.has(rosterKey(row.programacao_id, row.colaborador_id)),
  );

  // A Conferência precisa mostrar todo colaborador confirmado, mesmo quando
  // ainda não existe linha em programacao_colaboradores. Nesse caso criamos
  // apenas uma linha de leitura em memória; nada é gravado no Supabase.
  if (table === 'programacao_colaboradores') {
    const present = new Set(
      filtered.map((row) => rosterKey(row.programacao_id, row.colaborador_id)),
    );

    for (const member of roster) {
      const key = rosterKey(member.programacao_id, member.colaborador_id);
      if (present.has(key)) continue;
      filtered.push({
        programacao_id: member.programacao_id,
        colaborador_id: member.colaborador_id,
        nome_colaborador: member.nome_colaborador || null,
        disponibilidade: 'OK',
        __synthetic_confirmed_roster: true,
      });
    }
  }

  return { ...result, data: filtered };
}

function wrapBuilder(builder, table, context) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => Promise.resolve(target)
          .then((result) => filterConferenceResult(table, result, context.programacaoIds))
          .then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args) => {
        if (prop === 'in' && args[0] === 'programacao_id') {
          context.programacaoIds = unique(args[1]);
        }

        const next = value.apply(target, args);
        if (next && typeof next === 'object') return wrapBuilder(next, table, context);
        return next;
      };
    },
  });
}

supabase.from = function patchedFrom(table) {
  const builder = originalFrom(table);
  if (!FILTERED_TABLES.has(table)) return builder;
  return wrapBuilder(builder, table, { programacaoIds: [] });
};

// Carrega a tela somente depois que o filtro de segurança estiver instalado.
import('./adm-conferencia.js?v=20260801-rosterfix1').catch((error) => {
  console.error('[conferencia-roster-fix] Falha ao carregar ADM Conferência:', error);
});
