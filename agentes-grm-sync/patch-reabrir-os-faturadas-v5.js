#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) {
    console.log(`[patch-v5] ${label}: já aplicado.`);
    return;
  }
  if (!source.includes(before)) {
    throw new Error(`[patch-v5] ${label}: bloco original não encontrado em ${target}`);
  }
  source = source.replace(before, after);
  console.log(`[patch-v5] ${label}: aplicado.`);
}

replaceOnce(
`        if (blocked.found) {
          return {
            status: 'REVISAO_MANUAL',
            details: {
              motivo: \`A O.S. está em Finalizadas/\${financialStatus}. Reabertura automática bloqueada para proteger reflexos financeiros.\`,
              financeiro: financialStatus,
              row: blocked.rowText || null,
              financial_options: financialOptions,
              financial_statuses_searched: searchedFinancialStatuses,
            },
          };
        }`,
`        if (blocked.found) {
          const faturada = ['FATURADAS', 'FATURADAS E BONIFICADAS'].includes(normText(financialStatus));
          return {
            status: faturada ? 'IGNORADA' : 'REVISAO_MANUAL',
            details: {
              motivo: faturada
                ? \`A O.S. está em Finalizadas/\${financialStatus}. O GRM não permite reabertura de O.S. faturada; item ignorado permanentemente pela automação.\`
                : \`A O.S. está em Finalizadas/\${financialStatus}. Reabertura automática bloqueada para revisão.\`,
              financeiro: financialStatus,
              row: blocked.rowText || null,
              financial_options: financialOptions,
              financial_statuses_searched: searchedFinancialStatuses,
            },
          };
        }`,
'Faturadas em Finalizadas => IGNORADA',
);

replaceOnce(
`          if (located.found) {
            return {
              status: 'REVISAO_MANUAL',
              details: {
                motivo: \`A O.S. foi localizada em \${situationStatus}/\${financialStatus}. Nenhuma nova ação foi executada; situação requer diagnóstico manual antes de qualquer novo clique.\`,
                situacao: situationStatus,
                financeiro: financialStatus,
                row: located.rowText || null,
                financial_options: financialOptions,
                financial_statuses_searched: searchedFinancialStatuses,
                situation_options: situationOptions,
                situation_searches: situationSearches,
              },
            };
          }`,
`          if (located.found) {
            const faturada = ['FATURADAS', 'FATURADAS E BONIFICADAS'].includes(normText(financialStatus));
            return {
              status: faturada ? 'IGNORADA' : 'REVISAO_MANUAL',
              details: {
                motivo: faturada
                  ? \`A O.S. foi localizada em \${situationStatus}/\${financialStatus}. O GRM não permite reabertura de O.S. faturada; item ignorado permanentemente pela automação.\`
                  : \`A O.S. foi localizada em \${situationStatus}/\${financialStatus}. Nenhuma nova ação foi executada; situação requer diagnóstico manual antes de qualquer novo clique.\`,
                situacao: situationStatus,
                financeiro: financialStatus,
                row: located.rowText || null,
                financial_options: financialOptions,
                financial_statuses_searched: searchedFinancialStatuses,
                situation_options: situationOptions,
                situation_searches: situationSearches,
              },
            };
          }`,
'Faturadas em qualquer Situação => IGNORADA',
);

replaceOnce(
`    const queueObservation = result.status === 'JA_REABERTA'
      ? 'O.S. já estava aberta no GRM no momento da execução.'
      : result.status === 'REVISAO_MANUAL'
        ? String(result.details?.motivo || 'O.S. separada para revisão manual; nenhuma reabertura foi executada.')
        : 'Reaberta automaticamente para corrigir finalização indevida do agente.';`,
`    const queueObservation = result.status === 'JA_REABERTA'
      ? 'O.S. já estava aberta no GRM no momento da execução.'
      : result.status === 'IGNORADA'
        ? String(result.details?.motivo || 'O.S. faturada; não possui possibilidade de reabertura no GRM e foi ignorada pela automação.')
        : result.status === 'REVISAO_MANUAL'
          ? String(result.details?.motivo || 'O.S. separada para revisão manual; nenhuma reabertura foi executada.')
          : 'Reaberta automaticamente para corrigir finalização indevida do agente.';`,
'observação de fila para IGNORADA',
);

fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v5] regra permanente aplicada: Faturadas/Faturadas e Bonificadas => IGNORADA.');
console.log(`[patch-v5] arquivo atualizado: ${target}`);
