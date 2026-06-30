'use strict';

/**
 * Helper de carga segura para agentes GRM no cPanel/WHM.
 *
 * Modos:
 *   - replaceTableSafely(...): substitui a tabela final inteira.
 *   - replaceTablePeriodSafely(...): substitui apenas o período presente na staging.
 *
 * Requer migrations:
 *   supabase/migrations/20260630124500_grm_staging_promote_agents.sql
 *   supabase/migrations/20260630131000_grm_staging_promote_by_period.sql
 */

const DEFAULT_CHUNK_SIZE = 500;

function getLogger(logger) {
  return logger || console;
}

function ensureRows(rows, tableName) {
  if (!Array.isArray(rows)) {
    throw new Error('Carga segura abortada: rows precisa ser array para ' + tableName);
  }
}

function stagingName(tableName) {
  return tableName + '_staging';
}

async function runRpc(supabase, rpcName, params) {
  const result = await supabase.rpc(rpcName, params || {});
  if (result && result.error) {
    throw new Error(rpcName + ': ' + result.error.message);
  }
  return result ? result.data : null;
}

async function clearStaging(supabase, tableName) {
  return runRpc(supabase, 'grm_limpar_staging', { p_table: tableName });
}

async function promoteStaging(supabase, tableName, minRows) {
  return runRpc(supabase, 'grm_promover_staging', {
    p_table: tableName,
    p_min_rows: minRows == null ? 1 : minRows,
  });
}

async function promoteStagingByPeriod(supabase, tableName, dateColumn, minRows) {
  return runRpc(supabase, 'grm_promover_staging_periodo', {
    p_table: tableName,
    p_date_column: dateColumn || 'data',
    p_min_rows: minRows == null ? 1 : minRows,
  });
}

async function insertRowsChunked(supabase, tableName, rows, options) {
  const logger = getLogger(options && options.logger);
  const chunkSize = (options && options.chunkSize) || DEFAULT_CHUNK_SIZE;
  let inserted = 0;

  ensureRows(rows, tableName);

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const result = await supabase.from(tableName).insert(chunk);

    if (result && result.error) {
      throw new Error('insert ' + tableName + ': ' + result.error.message);
    }

    inserted += chunk.length;

    if (inserted === rows.length || inserted % (chunkSize * 10) === 0) {
      logger.log('[safe-load] ' + tableName + ': ' + inserted + '/' + rows.length + ' linhas inseridas');
    }
  }

  return inserted;
}

async function replaceTableSafely(supabase, tableName, rows, options) {
  const logger = getLogger(options && options.logger);
  const minRows = options && options.minRows != null ? options.minRows : 1;
  const stagingTable = stagingName(tableName);

  ensureRows(rows, tableName);

  if (rows.length < minRows) {
    throw new Error(
      'Carga segura abortada para ' + tableName + ': ' + rows.length + ' linhas, mínimo exigido ' + minRows
    );
  }

  logger.log('[safe-load] Limpando staging ' + stagingTable);
  await clearStaging(supabase, tableName);

  logger.log('[safe-load] Inserindo ' + rows.length + ' linhas em ' + stagingTable);
  await insertRowsChunked(supabase, stagingTable, rows, options || {});

  logger.log('[safe-load] Promovendo staging para ' + tableName);
  const promoted = await promoteStaging(supabase, tableName, minRows);

  logger.log('[safe-load] Concluído ' + tableName + ': ' + rows.length + ' linhas');
  return promoted;
}

async function replaceTablePeriodSafely(supabase, tableName, rows, options) {
  const logger = getLogger(options && options.logger);
  const minRows = options && options.minRows != null ? options.minRows : 1;
  const dateColumn = options && options.dateColumn ? options.dateColumn : 'data';
  const stagingTable = stagingName(tableName);

  ensureRows(rows, tableName);

  if (rows.length < minRows) {
    throw new Error(
      'Carga segura por período abortada para ' + tableName + ': ' + rows.length + ' linhas, mínimo exigido ' + minRows
    );
  }

  logger.log('[safe-load] Limpando staging ' + stagingTable);
  await clearStaging(supabase, tableName);

  logger.log('[safe-load] Inserindo ' + rows.length + ' linhas em ' + stagingTable);
  await insertRowsChunked(supabase, stagingTable, rows, options || {});

  logger.log('[safe-load] Promovendo período de staging para ' + tableName + ' pela coluna ' + dateColumn);
  const promoted = await promoteStagingByPeriod(supabase, tableName, dateColumn, minRows);

  logger.log('[safe-load] Concluído período ' + tableName + ': ' + rows.length + ' linhas');
  return promoted;
}

module.exports = {
  clearStaging,
  insertRowsChunked,
  promoteStaging,
  promoteStagingByPeriod,
  replaceTableSafely,
  replaceTablePeriodSafely,
  stagingName,
};
