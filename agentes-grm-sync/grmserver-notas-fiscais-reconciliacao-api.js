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

function buildMonthRanges(daysBack) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);
  start.setDate(1);

  const ranges = [];
  let cursor = new Date(start);

  while (cursor <= today) {
    const noteStart = new Date(cursor);
    const noteEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12, 0, 0, 0);
    if (noteEnd > today) noteEnd.setTime(today.getTime());

    // A tela/API aplica Data N.F. e Data da Fatura ao mesmo tempo. Para não
    // perder NFs cujo faturamento é anterior à emissão da nota, mantemos a
    // competência da NF exata e abrimos uma janela de 9 meses para a Fatura.
    // Nove meses já é um intervalo aceito pela API (a consulta Jan-Set funciona)
    // e cobre faturamentos bem anteriores sem cair em invalidDateRangeMonths.
    const invoiceStart = new Date(noteStart.getFullYear(), noteStart.getMonth() - 8, 1, 12, 0, 0, 0);

    ranges.push({
      note: { from: formatBrDate(noteStart), to: formatBrDate(noteEnd) },
      invoice: { from: formatBrDate(invoiceStart), to: formatBrDate(noteEnd) },
    });

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  return ranges;
}

async function main() {
  log('INFO', `=== Notas Fiscais - Reconciliação (${DIAS_RECONCILIACAO} dias, por mês de Data N.F.) ===`);
  const token = await login();
  const ranges = buildMonthRanges(DIAS_RECONCILIACAO);

  for (let i = 0; i < ranges.length; i += 1) {
    const { note, invoice } = ranges[i];
    log('INFO', `Faixa ${i + 1}/${ranges.length}: NF ${note.from} até ${note.to} | Fatura ${invoice.from} até ${invoice.to}`);
    const data = await fetchReportDataRange(token, note, invoice);
    // Cleanup fica desligado nesta rodada de correção: primeiro reidratamos
    // registros que a consulta anual anterior pode ter excluído. Depois da
    // conferência com o XLS oficial, a limpeza pode ser reativada com segurança.
    await upsertDataRange(data, note, invoice, { cleanup: false });
  }

  log('SUCCESS', `Reconciliação de Notas Fiscais concluída em ${ranges.length} faixa(s) mensais!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  // A reconciliação consulta competência por competência de Data N.F.; o timeout
  // cobre todas as faixas mensais sequenciais.
  setTimeout(() => process.exit(1), 600000);
}
