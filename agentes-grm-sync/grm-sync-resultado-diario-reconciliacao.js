#!/usr/bin/env node

/**
 * Reconciliação diária do Resultado Diário: re-sincroniza uma janela bem maior
 * (padrão 45 dias) do que o agente rápido (grm-sync-resultado-diario.js, 7 dias).
 * Achado 29/09 comparando o painel com o GRM: jan/abr batiam exatamente, mas os
 * meses recentes acumulavam diferença (jul/ago ~0,3% no embarcado, set -0,4% nas
 * toneladas) porque o GRM corrige lançamentos depois que o dia sai da janela de 7
 * dias e nada os reprocessava. Só afeta volume/indicadores por tonelada do DRE.
 *
 * O GRM recusa intervalos grandes (invalidDateRangeDays; 10 dias já falhou), então
 * a janela é consultada em blocos de 7 dias. Tudo-ou-nada: se qualquer bloco falhar
 * depois das tentativas, nada é gravado. Grava só em relatorio_resultado_diario
 * (via staging + promoção por período, transacional); não mexe na tabela bruta de
 * snapshots (grm_resultado_diario_importacoes), que só o agente rápido alimenta.
 */

require('dotenv').config();
const {
  supabase, login, fetchResultadoDiarioApi, mapApiRowsToFriendlyKeys, mapResultadoDiarioToPainelRows, formatDateBr, log,
} = require('./grm-sync-resultado-diario');
const { replaceTablePeriodSafely } = require('./safe-table-load');

const diasCfg = Number(process.env.GRM_RESULTADO_RECON_DIAS || 45);
const DIAS = Number.isFinite(diasCfg) ? Math.min(120, Math.max(8, Math.floor(diasCfg))) : 45;
const BLOCO_DIAS = 7;
// Piso de sanidade: ~20 linhas/dia (o volume real é ~330/dia). Abaixo disso a resposta é suspeita.
const MIN_ROWS = Math.max(1, Number(process.env.GRM_RESULTADO_RECON_MIN_ROWS || DIAS * 20));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hojeSaoPaulo() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function buildBlocks() {
  const fim = hojeSaoPaulo();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (DIAS - 1));
  const blocks = [];
  let cursor = new Date(inicio);
  while (cursor <= fim) {
    const blocoFim = new Date(cursor);
    blocoFim.setDate(blocoFim.getDate() + BLOCO_DIAS - 1);
    if (blocoFim > fim) blocoFim.setTime(fim.getTime());
    blocks.push({ from: formatDateBr(cursor), to: formatDateBr(blocoFim) });
    cursor = new Date(blocoFim);
    cursor.setDate(cursor.getDate() + 1);
  }
  return blocks;
}

async function fetchBloco(state, block) {
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      return await fetchResultadoDiarioApi(state.token, block);
    } catch (error) {
      if (error.requiresLogin || error.statusCode === 401) {
        log('WARN', 'Token expirado, refazendo login...');
        state.token = await login();
      }
      if (tentativa === 5) throw error;
      log('WARN', `Bloco ${block.from}..${block.to} falhou (${error.message}); tentativa ${tentativa}/5.`);
      await sleep(5000 * tentativa);
    }
  }
  return [];
}

async function main() {
  log('INFO', `=== Resultado Diário - Reconciliação (${DIAS} dias, blocos de ${BLOCO_DIAS}) ===`);
  const state = { token: await login() };
  const blocks = buildBlocks();
  const all = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    log('INFO', `Bloco ${i + 1}/${blocks.length}: ${block.from} até ${block.to}`);
    const apiRows = await fetchBloco(state, block);
    const rows = mapResultadoDiarioToPainelRows(mapApiRowsToFriendlyKeys(apiRows));
    log('INFO', `  ${apiRows.length} linhas da API, ${rows.length} válidas.`);
    all.push(...rows);
  }

  log('INFO', `Total consolidado: ${all.length} linhas válidas (mínimo exigido ${MIN_ROWS}).`);
  await replaceTablePeriodSafely(supabase, 'relatorio_resultado_diario', all, {
    dateColumn: 'data',
    minRows: MIN_ROWS,
    chunkSize: 500,
    logger: console,
  });
  log('SUCCESS', `Reconciliação concluída: ${all.length} linhas em relatorio_resultado_diario.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => { log('ERROR', error.stack || error.message); process.exit(1); });
  setTimeout(() => { log('ERROR', 'Watchdog: reconciliação passou de 14 minutos.'); process.exit(1); }, 14 * 60 * 1000);
}

module.exports = { buildBlocks };
