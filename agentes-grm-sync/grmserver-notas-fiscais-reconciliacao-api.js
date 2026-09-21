#!/usr/bin/env node

/**
 * Reconciliação de Notas Fiscais: re-sincroniza uma janela bem mais larga
 * (padrão mínimo de 400 dias) do que o agente rápido (grmserver-notas-fiscais-api.js,
 * 30 dias). Achado 17/09 comparando o DRE com o Relatório de Notas Fiscais
 * oficial da GRM: sobravam algumas notas por mês (2 a 7, ~R$4-33 mil) que
 * nunca chegavam a sincronizar - a hipótese mais provável é nota lançada
 * atrasada na GRM (Data N.F. de um dia, mas só cadastrada no sistema semanas
 * depois), que "perde o trem" da janela rolante de 30 dias antes mesmo de
 * existir na GRM. Rodando 1x/dia com uma janela mínima de 400 dias, qualquer nota
 * atrasada tem várias chances de ser pega antes de sair da janela também
 * dessa reconciliação. Reaproveita login/fetch/upsert do agente rápido -
 * mesma tabela, mesmo onConflict (empresa,fatura); só muda o daysBack.
 */

require('dotenv').config();
const { login, fetchReportDataRange, upsertDataRange } = require('./grmserver-notas-fiscais-api');

const diasConfigurados = Number(process.env.GRM_NOTAS_RECONCILIACAO_DIAS || 400);
const DIAS_RECONCILIACAO = Number.isFinite(diasConfigurados) ? Math.max(400, diasConfigurados) : 400;

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function formatBrDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function buildYearRanges(daysBack) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);

  const ranges = [];
  let cursor = new Date(start);

  while (cursor <= today) {
    const end = new Date(cursor.getFullYear(), 11, 31, 12, 0, 0, 0);
    if (end > today) end.setTime(today.getTime());

    ranges.push({
      from: formatBrDate(cursor),
      to: formatBrDate(end),
    });

    cursor = new Date(end.getFullYear() + 1, 0, 1, 12, 0, 0, 0);
  }

  return ranges;
}

async function main() {
  log('INFO', `=== Notas Fiscais - Reconciliação (${DIAS_RECONCILIACAO} dias, por ano) ===`);
  const token = await login();
  const ranges = buildYearRanges(DIAS_RECONCILIACAO);

  for (let i = 0; i < ranges.length; i += 1) {
    const dateRange = ranges[i];
    log('INFO', `Faixa ${i + 1}/${ranges.length}: ${dateRange.from} até ${dateRange.to}`);
    const data = await fetchReportDataRange(token, dateRange);
    await upsertDataRange(data, dateRange);
  }

  log('SUCCESS', `Reconciliação de Notas Fiscais concluída em ${ranges.length} faixa(s)!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  // A API do GRM rejeita intervalos que atravessam muitos meses. A reconciliação
  // divide a janela por ano, e o timeout cobre todas as faixas sequenciais.
  setTimeout(() => process.exit(1), 600000);
}
