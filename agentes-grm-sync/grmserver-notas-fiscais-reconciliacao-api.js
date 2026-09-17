#!/usr/bin/env node

/**
 * Reconciliação de Notas Fiscais: re-sincroniza uma janela bem mais larga
 * (padrão 120 dias) do que o agente rápido (grmserver-notas-fiscais-api.js,
 * 30 dias). Achado 17/09 comparando o DRE com o Relatório de Notas Fiscais
 * oficial da GRM: sobravam algumas notas por mês (2 a 7, ~R$4-33 mil) que
 * nunca chegavam a sincronizar - a hipótese mais provável é nota lançada
 * atrasada na GRM (Data N.F. de um dia, mas só cadastrada no sistema semanas
 * depois), que "perde o trem" da janela rolante de 30 dias antes mesmo de
 * existir na GRM. Rodando 1x/dia com uma janela de 120 dias, qualquer nota
 * atrasada tem várias chances de ser pega antes de sair da janela também
 * dessa reconciliação. Reaproveita login/fetch/upsert do agente rápido -
 * mesma tabela, mesmo onConflict (empresa,fatura); só muda o daysBack.
 */

require('dotenv').config();
const { login, fetchReportData, upsertData } = require('./grmserver-notas-fiscais-api');

const DIAS_RECONCILIACAO = Number(process.env.GRM_NOTAS_RECONCILIACAO_DIAS || 120);

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

async function main() {
  log('INFO', `=== Notas Fiscais - Reconciliação (${DIAS_RECONCILIACAO} dias) ===`);
  const token = await login();
  const data = await fetchReportData(token, DIAS_RECONCILIACAO);
  await upsertData(data, DIAS_RECONCILIACAO);
  log('SUCCESS', 'Reconciliação de Notas Fiscais concluída!');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  // Janela maior = mais linhas que o agente rápido; timeout generoso pra não
  // matar o processo no meio de um upsert grande.
  setTimeout(() => process.exit(1), 300000);
}
