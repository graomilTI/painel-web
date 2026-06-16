const EXCESSOS_TABLE = 'frotas_excesso_velocidade';
const LEITURAS_TABLE = 'patrimonios_historico_leituras';
const PAGE_SIZE = 1000;

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function plateVariants(value) {
  const plate = normalizePlate(value);
  const variants = new Set(plate ? [plate] : []);
  const digitToLetter = 'ABCDEFGHIJ';

  if (/^[A-Z]{3}\d{4}$/.test(plate)) {
    variants.add(`${plate.slice(0, 4)}${digitToLetter[Number(plate[4])]}${plate.slice(5)}`);
  } else if (/^[A-Z]{3}\d[A-J]\d{2}$/.test(plate)) {
    variants.add(`${plate.slice(0, 4)}${digitToLetter.indexOf(plate[4])}${plate.slice(5)}`);
  }

  return [...variants];
}

function plateSearchValues(value) {
  const values = new Set();
  plateVariants(value).forEach((plate) => {
    values.add(plate);
    values.add(`${plate.slice(0, 3)}-${plate.slice(3)}`);
  });
  return [...values];
}

function dateOnly(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : '';
}

function nextDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function leituraTimestamp(row) {
  return String(row?.data_upload || row?.ultima_leitura || '');
}

function selectLatest(current, candidate) {
  if (!current) return candidate;
  return leituraTimestamp(candidate) >= leituraTimestamp(current) ? candidate : current;
}

async function loadDailyReadings(originalFrom, dates) {
  const byDateAndPlate = new Map();
  const byDateAndAsset = new Map();

  for (const date of dates) {
    let offset = 0;
    while (offset < 50000) {
      const { data, error } = await originalFrom(LEITURAS_TABLE)
        .select('patrimonio_codigo,funcionario,identificacao,coordenacao,supervisao,data_upload,ultima_leitura')
        .gte('data_upload', `${date}T00:00:00`)
        .lt('data_upload', `${nextDate(date)}T00:00:00`)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];

      rows.forEach((row) => {
        if (!cleanText(row.funcionario)) return;

        const asset = String(row.patrimonio_codigo || '').trim().toUpperCase();
        if (asset) {
          const key = `${date}|${asset}`;
          byDateAndAsset.set(key, selectLatest(byDateAndAsset.get(key), row));
        }

        plateVariants(row.identificacao).forEach((plate) => {
          const key = `${date}|${plate}`;
          byDateAndPlate.set(key, selectLatest(byDateAndPlate.get(key), row));
        });
      });

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return { byDateAndPlate, byDateAndAsset };
}

function findReading(row, indexes) {
  const date = dateOnly(row?.data_evento);
  if (!date) return null;

  const asset = String(row?.patrimonio_codigo || '').trim().toUpperCase();
  if (asset) {
    const byAsset = indexes.byDateAndAsset.get(`${date}|${asset}`);
    if (byAsset) return byAsset;
  }

  for (const plate of plateVariants(row?.placa)) {
    const byPlate = indexes.byDateAndPlate.get(`${date}|${plate}`);
    if (byPlate) return byPlate;
  }

  return null;
}

async function findLastReading(originalFrom, row) {
  const date = dateOnly(row?.data_evento);
  if (!date) return null;

  const plateValues = plateSearchValues(row?.placa);
  if (!plateValues.length) return null;
  const plateFilter = plateValues.map((plate) => `identificacao.ilike.%${plate}%`).join(',');

  const { data, error } = await originalFrom(LEITURAS_TABLE)
    .select('patrimonio_codigo,funcionario,identificacao,coordenacao,supervisao,data_upload,ultima_leitura')
    .or(plateFilter)
    .lt('data_upload', `${nextDate(date)}T00:00:00`)
    .not('funcionario', 'is', null)
    .order('data_upload', { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data || []).find((reading) => {
    const readingPlates = new Set(plateVariants(reading.identificacao));
    return plateVariants(row.placa).some((plate) => readingPlates.has(plate));
  }) || null;
}

async function resolveFallbackReadings(originalFrom, rows) {
  const cache = new Map();
  const resolved = new Map();

  for (const row of rows) {
    const key = `${dateOnly(row?.data_evento)}|${String(row?.patrimonio_codigo || '').trim().toUpperCase()}|${normalizePlate(row?.placa)}`;
    if (!cache.has(key)) cache.set(key, findLastReading(originalFrom, row));
    resolved.set(row, await cache.get(key));
  }

  return resolved;
}

async function persistMatches(originalFrom, matches) {
  const groups = new Map();

  matches.forEach(({ row, reading }) => {
    if (!row?.id || !reading?.funcionario) return;
    const payload = {
      patrimonio_funcionario: cleanText(reading.funcionario),
      patrimonio_codigo: cleanText(reading.patrimonio_codigo),
      coordenacao: cleanText(reading.coordenacao),
      supervisao: cleanText(reading.supervisao),
      status_cruzamento: 'MOTORISTA_IDENTIFICADO'
    };
    const key = JSON.stringify(payload);
    if (!groups.has(key)) groups.set(key, { payload, ids: [] });
    groups.get(key).ids.push(row.id);
  });

  for (const { payload, ids } of groups.values()) {
    const { error } = await originalFrom(EXCESSOS_TABLE).update(payload).in('id', ids);
    if (error) console.warn('[FROTAS] Falha ao persistir motorista da leitura diária:', error);
  }
}

async function persistUnmatched(originalFrom, rows) {
  const ids = rows
    .filter((row) => row?.id && (row.patrimonio_funcionario || row.status_cruzamento === 'MOTORISTA_IDENTIFICADO'))
    .map((row) => row.id);
  if (!ids.length) return;

  const { error } = await originalFrom(EXCESSOS_TABLE)
    .update({
      patrimonio_funcionario: null,
      status_cruzamento: 'PENDENTE_CONFERENCIA'
    })
    .in('id', ids);
  if (error) console.warn('[FROTAS] Falha ao remover associação sem leitura diária:', error);
}

async function enrichExcessos(originalFrom, rows) {
  const openRows = rows.filter((row) => ['PENDENTE', 'GERADA'].includes(String(row?.status_notificacao || '').toUpperCase()));
  const dates = [...new Set(openRows.map((row) => dateOnly(row?.data_evento)).filter(Boolean))];
  if (!dates.length) return rows;

  const indexes = await loadDailyReadings(originalFrom, dates);
  const matches = [];
  const exactUnmatched = [];

  const enriched = rows.map((row) => {
    if (!openRows.includes(row)) return row;
    const reading = findReading(row, indexes);
    if (!reading) {
      exactUnmatched.push(row);
      return row;
    }

    matches.push({ row, reading });
    return {
      ...row,
      patrimonio_funcionario: cleanText(reading.funcionario),
      patrimonio_codigo: cleanText(reading.patrimonio_codigo) || row.patrimonio_codigo,
      coordenacao: cleanText(reading.coordenacao) || row.coordenacao,
      supervisao: cleanText(reading.supervisao) || row.supervisao,
      status_cruzamento: 'MOTORISTA_IDENTIFICADO'
    };
  });

  const fallbackReadings = await resolveFallbackReadings(originalFrom, exactUnmatched);
  const finalRows = enriched.map((row) => {
    if (!exactUnmatched.includes(row)) return row;
    const reading = fallbackReadings.get(row);
    if (!reading) {
      return {
        ...row,
        patrimonio_funcionario: '',
        motorista_planilha: '',
        status_cruzamento: 'PENDENTE_CONFERENCIA'
      };
    }

    matches.push({ row, reading });
    return {
      ...row,
      patrimonio_funcionario: cleanText(reading.funcionario),
      patrimonio_codigo: cleanText(reading.patrimonio_codigo) || row.patrimonio_codigo,
      coordenacao: cleanText(reading.coordenacao) || row.coordenacao,
      supervisao: cleanText(reading.supervisao) || row.supervisao,
      status_cruzamento: 'MOTORISTA_IDENTIFICADO'
    };
  });

  const unmatched = exactUnmatched.filter((row) => !fallbackReadings.get(row));
  await persistMatches(originalFrom, matches);
  await persistUnmatched(originalFrom, unmatched);
  return finalRows;
}

export function installDailyDriverResolution(supabase) {
  if (!supabase?.from || supabase.__dailyDriverResolutionInstalled) return;

  const originalFrom = supabase.from.bind(supabase);
  supabase.from = function patchedFrom(table) {
    const builder = originalFrom(table);
    if (table !== EXCESSOS_TABLE || !builder?.select) return builder;

    const originalSelect = builder.select.bind(builder);
    builder.select = function patchedSelect(...args) {
      const query = originalSelect(...args);
      if (!query?.then) return query;

      const originalThen = query.then.bind(query);
      query.then = (onFulfilled, onRejected) => originalThen(async (result) => {
        if (result?.error || !Array.isArray(result?.data) || !result.data.length) return result;
        try {
          return { ...result, data: await enrichExcessos(originalFrom, result.data) };
        } catch (error) {
          console.warn('[FROTAS] Não foi possível cruzar motorista pela leitura diária:', error);
          return result;
        }
      }).then(onFulfilled, onRejected);

      return query;
    };

    return builder;
  };

  Object.defineProperty(supabase, '__dailyDriverResolutionInstalled', {
    value: true,
    configurable: false,
    enumerable: false
  });
}
