import { supabase } from './supabaseClient.js';

const SOURCE_TABLE = 'grm_despesas_importacoes';
const LEGACY_TABLE = 'dre_despesas_mensal';
const EXCLUDED = new Set(['', 'NULL', 'AGROTRADER', 'LOG1000', 'PARAGUAI']);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function monthBounds(year, month) {
  const y = Number(year);
  const m = Number(month);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  };
}

function latestRowsByCoord(rows) {
  const byCoord = new Map();
  for (const row of rows || []) {
    const key = normalize(row.coordenacao);
    if (!key) continue;
    const current = byCoord.get(key);
    const stamp = new Date(row.data_sincronizacao || row.sincronizado_em || 0).getTime();
    const currentStamp = current
      ? new Date(current.data_sincronizacao || current.sincronizado_em || 0).getTime()
      : -1;
    if (!current || stamp >= currentStamp) byCoord.set(key, row);
  }
  return Array.from(byCoord.values());
}

function buildDreRows(rows, year, month) {
  const latest = latestRowsByCoord(rows);
  let totalGeral = 0;
  const operacionais = [];

  for (const row of latest) {
    const key = normalize(row.coordenacao);
    const value = Number(row.valor ?? row.dados_json?.Total ?? 0) || 0;
    if (key === 'GERAL') {
      totalGeral += value;
      continue;
    }
    if (EXCLUDED.has(key)) continue;
    operacionais.push({ coordenacao: row.coordenacao || key, total_coordenacao: value });
  }

  const totalRegionais = operacionais.reduce((sum, row) => sum + row.total_coordenacao, 0);

  return operacionais
    .map((row) => {
      const rateio = totalRegionais > 0
        ? totalGeral * (row.total_coordenacao / totalRegionais)
        : 0;
      return {
        coordenacao: row.coordenacao,
        total_coordenacao: row.total_coordenacao,
        rateio,
        total_com_rateio: row.total_coordenacao + rateio,
        total_geral: totalGeral,
        total_todas_regionais: totalRegionais,
        ano: Number(year),
        mes: Number(month),
        origem: 'agente_grm_despesas'
      };
    })
    .sort((a, b) => String(a.coordenacao).localeCompare(String(b.coordenacao), 'pt-BR'));
}

function createAgentQueryBuilder(selectColumns) {
  const filters = new Map();
  let from = 0;
  let to = 999;

  const execute = async () => {
    const year = Number(filters.get('ano'));
    const month = Number(filters.get('mes'));
    if (!year || !month) return { data: [], error: null };

    const bounds = monthBounds(year, month);
    const { data, error } = await supabase
      .from(SOURCE_TABLE)
      .select('coordenacao,valor,dados_json,data_conta_de,data_conta_ate,data_sincronizacao,sincronizado_em')
      .eq('data_conta_de', bounds.start)
      .eq('data_conta_ate', bounds.end)
      .order('data_sincronizacao', { ascending: false })
      .limit(5000);

    if (error) return { data: null, error };

    const transformed = buildDreRows(data || [], year, month);
    const requested = String(selectColumns || '').split(',').map(v => v.trim()).filter(Boolean);
    const projected = requested.length
      ? transformed.map(row => Object.fromEntries(requested.map(key => [key, row[key]])))
      : transformed;

    return { data: projected.slice(from, to + 1), error: null };
  };

  const builder = {
    select(columns) {
      selectColumns = columns;
      return builder;
    },
    eq(column, value) {
      filters.set(column, value);
      return builder;
    },
    order() {
      return builder;
    },
    range(start, end) {
      from = Number(start) || 0;
      to = Number(end) || 999;
      return builder;
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
    catch(reject) {
      return execute().catch(reject);
    }
  };

  return builder;
}

if (!supabase.__metasDespesasAgentePatched) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    if (table === LEGACY_TABLE) return createAgentQueryBuilder('*');
    return originalFrom(table);
  };
  supabase.__metasDespesasAgentePatched = true;
}
