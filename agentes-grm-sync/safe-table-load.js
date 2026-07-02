'use strict';

const DEFAULT_CHUNK_SIZE = 500;

function loggerOf(options) {
  return (options && options.logger) || console;
}

function stagingName(tableName) {
  return tableName + '_staging';
}

function assertRows(rows, tableName) {
  if (!Array.isArray(rows)) {
    throw new Error('rows precisa ser array para ' + tableName);
  }
}

async function rpc(supabase, name, params) {
  const res = await supabase.rpc(name, params || {});
  if (res && res.error) {
    throw new Error(name + ': ' + res.error.message);
  }
  return res ? res.data : null;
}

async function clearStaging(supabase, tableName) {
  return rpc(supabase, 'grm_limpar_staging', { p_table: tableName });
}

async function promoteStaging(supabase, tableName, minRows) {
  return rpc(supabase, 'grm_promover_staging', {
    p_table: tableName,
    p_min_rows: minRows == null ? 1 : minRows
  });
}

async function promoteStagingByPeriod(supabase, tableName, dateColumn, minRows) {
  return rpc(supabase, 'grm_promover_staging_periodo', {
    p_table: tableName,
    p_date_column: dateColumn || 'data',
    p_min_rows: minRows == null ? 1 : minRows
  });
}

async function insertRowsChunked(supabase, tableName, rows, options) {
  const log = loggerOf(options);
  const chunkSize = (options && options.chunkSize) || DEFAULT_CHUNK_SIZE;
  let inserted = 0;

  assertRows(rows, tableName);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await supabase.from(tableName).insert(chunk);

    if (res && res.error) {
      throw new Error('insert ' + tableName + ': ' + res.error.message);
    }

    inserted += chunk.length;

    if (inserted === rows.length || inserted % (chunkSize * 10) === 0) {
      log.log('[safe-load] ' + tableName + ': ' + inserted + '/' + rows.length + ' linhas inseridas');
    }
  }

  return inserted;
}

async function loadToStaging(supabase, tableName, rows, options) {
  const log = loggerOf(options);
  const minRows = options && options.minRows != null ? options.minRows : 1;
  const stagingTable = stagingName(tableName);

  assertRows(rows, tableName);

  if (rows.length < minRows) {
    throw new Error('Carga abortada para ' + tableName + ': ' + rows.length + ' linhas, mínimo ' + minRows);
  }

  log.log('[safe-load] Limpando staging ' + stagingTable);
  await clearStaging(supabase, tableName);

  log.log('[safe-load] Inserindo ' + rows.length + ' linhas em ' + stagingTable);
  await insertRowsChunked(supabase, stagingTable, rows, options || {});

  return { minRows, stagingTable, log };
}

async function replaceTableSafely(supabase, tableName, rows, options) {
  const ctx = await loadToStaging(supabase, tableName, rows, options);

  ctx.log.log('[safe-load] Promovendo staging para ' + tableName);
  const promoted = await promoteStaging(supabase, tableName, ctx.minRows);

  ctx.log.log('[safe-load] Concluído ' + tableName + ': ' + rows.length + ' linhas');
  return promoted;
}

async function replaceTablePeriodSafely(supabase, tableName, rows, options) {
  const ctx = await loadToStaging(supabase, tableName, rows, options);
  const dateColumn = options && options.dateColumn ? options.dateColumn : 'data';

  ctx.log.log('[safe-load] Promovendo período de staging para ' + tableName + ' pela coluna ' + dateColumn);
  const promoted = await promoteStagingByPeriod(supabase, tableName, dateColumn, ctx.minRows);

  ctx.log.log('[safe-load] Concluído período ' + tableName + ': ' + rows.length + ' linhas');
  return promoted;
}

module.exports = {
  clearStaging,
  insertRowsChunked,
  promoteStaging,
  promoteStagingByPeriod,
  replaceTableSafely,
  replaceTablePeriodSafely,
  stagingName
};
