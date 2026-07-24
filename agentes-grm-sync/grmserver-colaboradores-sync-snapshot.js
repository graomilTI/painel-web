#!/usr/bin/env node

/**
 * Sincronização de colaboradores com regra de snapshot completo.
 *
 * Regra operacional:
 * - quem veio no relatório atual mantém/recebe o estado informado pelo GRM;
 * - quem estava Ativo na base anterior e NÃO veio no relatório atual passa
 *   automaticamente para Inativo;
 * - a transição é gravada em colaboradores_status_historico.
 *
 * Este arquivo envolve o sincronizador com histórico já existente. O relatório
 * atual é identificado pelas linhas atualizadas durante a execução corrente.
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { main: runBaseSync } = require('./grmserver-colaboradores-sync-historico');

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
};

function loadSupabase() {
  const url = process.env.SUPABASE_URL || process.env.SB_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SB_SERVICE_KEY ||
    process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function isActive(value) {
  return normalizeStatus(value) === 'ATIVO';
}

function validTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRowMoment(row) {
  return Math.max(
    validTimestamp(row.sincronizado_em),
    validTimestamp(row.updated_at),
    validTimestamp(row.created_at),
  );
}

function dateOnlyFromTimestamp(timestamp, fallbackIso) {
  if (!timestamp) return fallbackIso.slice(0, 10);
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function fetchAll(supabase, table, select, maxRows = 20000) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function currentByCpf(rows) {
  const result = new Map();

  for (const row of rows || []) {
    const cpf = normalizeCpf(row.cpf);
    if (!cpf) continue;

    const previous = result.get(cpf);
    if (!previous || latestRowMoment(row) >= latestRowMoment(previous)) {
      result.set(cpf, row);
    }
  }

  return result;
}

async function insertHistoryRows(supabase, rows) {
  let inserted = 0;

  for (const row of rows) {
    const { error } = await supabase
      .from('colaboradores_status_historico')
      .insert(row);

    if (!error) {
      inserted += 1;
      continue;
    }

    if (error.code === '23505') continue;
    throw error;
  }

  return inserted;
}

async function updateMissingCollaborators(supabase, missingRows, detectedAt) {
  let updated = 0;

  for (const row of missingRows) {
    const lastSeenAt = latestRowMoment(row);
    const effectiveDate = dateOnlyFromTimestamp(lastSeenAt, detectedAt);

    const { error } = await supabase
      .from('colaboradores')
      .update({
        situacao: 'Inativo',
        desligamento: row.desligamento || effectiveDate,
      })
      .eq('id', row.id);

    if (error) throw error;
    updated += 1;
  }

  return updated;
}

async function markAbsentAsInactive(supabase, runStartedAt, detectedAt) {
  const rows = await fetchAll(
    supabase,
    'colaboradores',
    'id,cpf,nome,situacao,admissao,desligamento,sincronizado_em,created_at,updated_at',
    20000,
  );

  const currentRows = [...currentByCpf(rows).values()];
  const runStartedMs = Date.parse(runStartedAt);

  // As linhas presentes no XLS atual foram atualizadas pelo upsert executado
  // depois de runStartedAt. As demais são ausentes do snapshot corrente.
  const activeRows = currentRows.filter((row) => isActive(row.situacao));
  const missingRows = activeRows.filter((row) => latestRowMoment(row) < runStartedMs);
  const presentActive = activeRows.length - missingRows.length;

  if (!currentRows.length) {
    throw new Error('A base de colaboradores ficou vazia após a sincronização. Nenhum status foi alterado.');
  }

  // Proteção contra XLS quebrado/parcial: uma extração que não atualizou nem
  // metade dos ativos não pode desligar a empresa inteira silenciosamente.
  if (activeRows.length >= 20 && presentActive < Math.floor(activeRows.length * 0.5)) {
    throw new Error(
      `Relatório possivelmente incompleto: apenas ${presentActive} de ${activeRows.length} ativos foram encontrados. Ausentes não foram inativados.`,
    );
  }

  if (!missingRows.length) {
    logger.success('Snapshot conferido: nenhum colaborador ativo ficou ausente do relatório atual.');
    return { checkedActive: activeRows.length, presentActive, missing: 0, history: 0, updated: 0 };
  }

  const historyRows = missingRows.map((row) => {
    const lastSeenAt = latestRowMoment(row);
    const effectiveDate = dateOnlyFromTimestamp(lastSeenAt, detectedAt);

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
        ultimo_registro_encontrado_em: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
        execucao_iniciada_em: runStartedAt,
      },
    };
  });

  const history = await insertHistoryRows(supabase, historyRows);
  const updated = await updateMissingCollaborators(supabase, missingRows, detectedAt);

  logger.success(
    `Snapshot conferido: ${missingRows.length} colaborador(es) ausente(s) marcado(s) como Inativo.`,
  );

  return {
    checkedActive: activeRows.length,
    presentActive,
    missing: missingRows.length,
    history,
    updated,
    names: missingRows.map((row) => row.nome),
  };
}

async function main() {
  const runStartedAt = new Date().toISOString();
  logger.info(`Iniciando snapshot completo de colaboradores em ${runStartedAt}`);

  const baseResult = await runBaseSync();
  const detectedAt = new Date().toISOString();
  const supabase = loadSupabase();
  const absentResult = await markAbsentAsInactive(
    supabase,
    runStartedAt,
    detectedAt,
  );

  const result = {
    ...baseResult,
    absentRule: absentResult,
  };

  logger.success('Sincronização de colaboradores com regra de ausência concluída.');
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

  setTimeout(() => process.exit(1), 240000);
}

module.exports = {
  markAbsentAsInactive,
  main,
};
