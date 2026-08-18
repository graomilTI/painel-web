#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `    try {
      await openServiceOrderPage(page, 'Finalizadas', 'Faturadas');
      const billed = await searchOs(page, item.os);
      if (billed.found) {
        return {
          status: 'REVISAO_MANUAL',
          details: {
            motivo: 'A O.S. está em Finalizadas/Faturadas. Reabertura automática bloqueada para proteger reflexos financeiros.',
            financeiro: 'Faturadas',
            row: billed.rowText || null,
            financial_options: financialOptions,
          },
        };
      }
    } catch (error) {
      log('WARN', \`Busca em Finalizadas/Faturadas não pôde ser concluída: \${error.message}\`);
    }

    return {
      status: 'REVISAO_MANUAL',
      details: {
        motivo: 'A O.S. não foi localizada em Abertas/Não Faturadas nem em Finalizadas/Não Faturadas e também não foi confirmada em Finalizadas/Faturadas.',
        financial_options: financialOptions,
      },
    };`;

const after = `    const blockedFinancialStatuses = ['Faturadas', 'Bonificadas', 'Faturadas e Bonificadas'];
    const searchedFinancialStatuses = [];

    for (const financialStatus of blockedFinancialStatuses) {
      try {
        await openServiceOrderPage(page, 'Finalizadas', financialStatus);
        searchedFinancialStatuses.push(financialStatus);
        const blocked = await searchOs(page, item.os);
        if (blocked.found) {
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
        }
      } catch (error) {
        log('WARN', \`Busca em Finalizadas/\${financialStatus} não pôde ser concluída: \${error.message}\`);
      }
    }

    return {
      status: 'REVISAO_MANUAL',
      details: {
        motivo: 'A O.S. não foi localizada em Abertas/Não Faturadas nem em nenhum dos estados financeiros de Finalizadas pesquisados.',
        financial_options: financialOptions,
        financial_statuses_searched: searchedFinancialStatuses,
      },
    };`;

if (source.includes(after)) {
  console.log('[patch-v2] diagnóstico de todos os estados financeiros: já aplicado.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v2] bloco financeiro anterior não encontrado em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v2] diagnóstico de todos os estados financeiros: aplicado.');
console.log(`[patch-v2] arquivo atualizado: ${target}`);
