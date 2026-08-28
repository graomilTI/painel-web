#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `    return {
      status: 'REVISAO_MANUAL',
      details: {
        motivo: 'A O.S. não foi localizada em Abertas/Não Faturadas nem em nenhum dos estados financeiros de Finalizadas pesquisados.',
        financial_options: financialOptions,
        financial_statuses_searched: searchedFinancialStatuses,
      },
    };`;

const after = `    let situationOptions = [];
    try {
      situationOptions = await listFilterOptions(page, 'Situação');
      log('INFO', \`Opções do filtro Situação: \${situationOptions.join(' | ') || '(nenhuma)'}\`);
    } catch (error) {
      log('WARN', \`Não foi possível listar opções de Situação: \${error.message}\`);
    }

    const financeSearchOptions = financialOptions.length
      ? financialOptions
      : ['Não Faturadas', 'Faturadas', 'Bonificadas', 'Faturadas e Bonificadas'];
    const situationSearches = [];

    for (const situationStatus of situationOptions) {
      const situationNorm = normText(situationStatus);
      if (situationNorm === 'FINALIZADAS') continue;

      for (const financialStatus of financeSearchOptions) {
        const financialNorm = normText(financialStatus);
        if (situationNorm === 'ABERTAS' && financialNorm === 'NAO FATURADAS') continue;

        try {
          await openServiceOrderPage(page, situationStatus, financialStatus);
          situationSearches.push({ situacao: situationStatus, financeiro: financialStatus });
          const located = await searchOs(page, item.os);
          if (located.found) {
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
          }
        } catch (error) {
          log('WARN', \`Busca em \${situationStatus}/\${financialStatus} não pôde ser concluída: \${error.message}\`);
        }
      }
    }

    return {
      status: 'REVISAO_MANUAL',
      details: {
        motivo: 'A O.S. não foi localizada em nenhuma combinação de Situação/Financeiro pesquisada. Nenhuma nova ação foi executada.',
        financial_options: financialOptions,
        financial_statuses_searched: searchedFinancialStatuses,
        situation_options: situationOptions,
        situation_searches: situationSearches,
      },
    };`;

if (source.includes(after)) {
  console.log('[patch-v4] diagnóstico de todas as Situações: já aplicado.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v4] bloco final de diagnóstico não encontrado em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v4] diagnóstico de todas as Situações: aplicado.');
console.log(`[patch-v4] arquivo atualizado: ${target}`);
