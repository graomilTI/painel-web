#!/usr/bin/env node

/**
 * Wrapper de sincronização de colaboradores com regra de snapshot completo.
 *
 * Regra:
 * - executa o sincronizador atual grmserver-colaboradores-sync.js;
 * - colaboradores ativos que não apareceram na nova extração são marcados
 *   automaticamente como Inativo;
 * - registra a mudança em colaboradores_status_historico;
 * - interrompe a inativação se a extração parecer incompleta.
 */

require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const BASE_SCRIPT = path.join(__dirname, 'grmserver-colaboradores-sync.js');
const MIN_ACTIVE_FOR_SAFETY_CHECK = 20;
const MIN_PRESENT_RATIO = 0.50;
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

const logger = {
  info: (message) =>
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) =>
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) =>
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
  success: (message) =>
    console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`),
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.SB_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SB_SERVICE_KEY ||
    process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.'
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function isActive(value) {
  return normalizeStatus(value) === 'ATIVO';
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRowMoment(row) {
  return Math.max(
    parseTimestamp(row.sincronizado_em),
    parseTimestamp(row.updated_at),
    parseTimestamp(row.created_at)
  );
}

function dateFromTimestamp(timestamp, fallbackIso) {
  if (!timestamp) return fallbackIso.slice(0, 10);
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function fetchAll(supabase, table, select, maxRows = MAX_ROWS) {
  const rows = [];

  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Falha ao consultar ${table}: ${error.message}`);
    }

    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function latestByCpf(rows) {
  const result = new Map();

  for (const row of rows || []) {
    const cpf = normalizeCpf(row.cpf);
    if (!cpf) continue;

    const previous = result.get(cpf);

    if (!previous || latestRowMoment(row) >= latestRowMoment(previous)) {
      result.set(cpf, row);
    }
  }

  return [...result.values()];
}

function runBaseSync() {
  return new Promise((resolve, reject) => {
    logger.info(`Executando sincronizador base: ${BASE_SCRIPT}`);

    const child = spawn(process.execPath, [BASE_SCRIPT], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      reject(
        new Error(`Não foi possível iniciar o sincronizador base: ${error.message}`)
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`O sincronizador base terminou com código ${code}.`)
      );
    });
  });
}

async function insertHistoryRows(supabase, rows) {
  let inserted = 0;
  let duplicates = 0;

  for (const row of rows) {
    const { error } = await supabase
      .from('colaboradores_status_historico')
      .insert(row);

    if (!error) {
      inserted += 1;
      continue;
    }

    if (error.code === '23505') {
      duplicates += 1;
      continue;
    }

    throw new Error(
      `Falha ao gravar histórico de ${row.nome}: ${error.message}`
    );
  }

  return { inserted, duplicates };
}

async function updateMissingRows(supabase, missingRows, detectedAt) {
  let updated = 0;

  for (const row of missingRows) {
    const lastSeenAt = latestRowMoment(row);
    const effectiveDate = dateFromTimestamp(lastSeenAt, detectedAt);

    const { error } = await supabase
      .from('colaboradores')
      .update({
        situacao: 'Inativo',
        desligamento: row.desligamento || effectiveDate,
      })
      .eq('id', row.id);

    if (error) {
      throw new Error(
        `Falha ao marcar ${row.nome} como Inativo: ${error.message}`
      );
    }

    updated += 1;
  }

  return updated;
}

async function applyAbsenceRule(supabase, runStartedAt, detectedAt) {
  const runStartedMs = Date.parse(runStartedAt);

  const rows = await fetchAll(
    supabase,
    'colaboradores',
    [
      'id',
      'cpf',
      'nome',
      'situacao',
      'admissao',
      'desligamento',
      'sincronizado_em',
      'created_at',
      'updated_at',
    ].join(',')
  );

  const currentRows = latestByCpf(rows);

  if (!currentRows.length) {
    throw new Error(
      'A tabela colaboradores ficou vazia. Nenhum colaborador foi inativado.'
    );
  }

  const activeRows = currentRows.filter((row) => isActive(row.situacao));

  // Quem veio no XLS atual foi atualizado pelo upsert depois de runStartedAt.
  const presentActiveRows = activeRows.filter(
    (row) => latestRowMoment(row) >= runStartedMs
  );

  // Quem continua Ativo, mas não foi atualizado nesta execução, não veio no XLS.
  const missingRows = activeRows.filter(
    (row) => latestRowMoment(row) < runStartedMs
  );

  const presentRatio =
    activeRows.length > 0 ? presentActiveRows.length / activeRows.length : 1;

  logger.info(
    `Conferência do snapshot: ${activeRows.length} ativo(s) na base, ` +
      `${presentActiveRows.length} presente(s), ${missingRows.length} ausente(s).`
  );

  // Evita inativação em massa se o arquivo tiver vindo parcial ou quebrado.
  if (
    activeRows.length >= MIN_ACTIVE_FOR_SAFETY_CHECK &&
    presentRatio < MIN_PRESENT_RATIO
  ) {
    throw new Error(
      `Relatório possivelmente incompleto: somente ` +
        `${presentActiveRows.length} de ${activeRows.length} ativos foram encontrados ` +
        `(${(presentRatio * 100).toFixed(1)}%). Nenhum ausente foi inativado.`
    );
  }

  if (!missingRows.length) {
    logger.success(
      'Snapshot conferido: nenhum colaborador ativo ficou ausente do relatório.'
    );

    return {
      checkedActive: activeRows.length,
      presentActive: presentActiveRows.length,
      missing: 0,
      historyInserted: 0,
      updated: 0,
    };
  }

  const historyRows = missingRows.map((row) => {
    const lastSeenAt = latestRowMoment(row);
    const effectiveDate = dateFromTimestamp(lastSeenAt, detectedAt);

    return {
      colaborador_id: row.id || null,
      cpf: normalizeCpf(row.cpf),
      nome: row.nome || '',
      situacao_anterior: row.situacao || 'Ativo',
      situacao_nova: 'Inativo',
      ativo_anterior: true,
      ativo_novo: false,
      data_efetiva: effectiveDate,
      detectado_em: detectedAt,
      relatorio_referencia: detectedAt,
      fonte: 'grmserver_relatorio_colaboradores_ausente',
      metadata: {
        regra: 'ausente_do_relatorio_atual_equivale_a_inativo',
        ultimo_registro_encontrado_em: lastSeenAt
          ? new Date(lastSeenAt).toISOString()
          : null,
        execucao_iniciada_em: runStartedAt,
        detectado_em: detectedAt,
      },
    };
  });

  // Primeiro registra o histórico; só depois altera a tabela atual.
  const history = await insertHistoryRows(supabase, historyRows);
  const updated = await updateMissingRows(
    supabase,
    missingRows,
    detectedAt
  );

  logger.success(
    `Snapshot conferido: ${missingRows.length} colaborador(es) ausente(s) ` +
      `marcado(s) como Inativo.`
  );

  logger.info(
    `Ausentes: ${missingRows.map((row) => row.nome).join(' | ')}`
  );

  return {
    checkedActive: activeRows.length,
    presentActive: presentActiveRows.length,
    missing: missingRows.length,
    historyInserted: history.inserted,
    historyDuplicates: history.duplicates,
    updated,
    names: missingRows.map((row) => row.nome),
  };
}

async function main() {
  const runStartedAt = new Date().toISOString();

  logger.info(
    `=== Iniciando sincronização de colaboradores com snapshot completo ===`
  );
  logger.info(`Execução iniciada em: ${runStartedAt}`);

  await runBaseSync();

  const detectedAt = new Date().toISOString();
  const supabase = getSupabase();

  const absenceResult = await applyAbsenceRule(
    supabase,
    runStartedAt,
    detectedAt
  );

  const result = {
    script: 'grmserver-colaboradores-sync-snapshot.js',
    runStartedAt,
    detectedAt,
    absenceRule: absenceResult,
  };

  logger.success(
    '=== Sincronização de colaboradores com snapshot concluída ==='
  );
  logger.info(JSON.stringify(result, null, 2));

  return result;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(`Erro fatal: ${error.message}`);
      logger.error(error.stack || '');
      process.exit(1);
    });

  // Proteção para processo preso.
  setTimeout(() => {
    logger.error('Timeout máximo de 4 minutos atingido.');
    process.exit(1);
  }, 240000);
}

module.exports = {
  applyAbsenceRule,
  main,
};
