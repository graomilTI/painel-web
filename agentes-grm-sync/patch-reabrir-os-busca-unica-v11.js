#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const marker = 'SOMENTE_FINALIZADAS_NAO_FATURADAS_V11';
if (source.includes(marker)) {
  console.log('[patch-v11] busca única Finalizadas/Não Faturadas: já aplicada.');
  process.exit(0);
}

const processIndex = source.indexOf('async function processItem(page, item, config) {');
if (processIndex < 0) throw new Error(`[patch-v11] processItem não encontrado em ${target}`);

const searchStartNeedle = "  await openServiceOrderPage(page, 'Abertas', 'Não Faturadas');";
const actionStartNeedle = '  await selectOsRow(page, item.os);';
const searchStart = source.indexOf(searchStartNeedle, processIndex);
const actionStart = source.indexOf(actionStartNeedle, processIndex);

if (searchStart < 0 || actionStart < 0 || actionStart <= searchStart) {
  throw new Error(`[patch-v11] bloco de busca anterior não encontrado em ${target}`);
}

const replacement = `  // ${marker}\n  // Pré-validação operacional: consultar SOMENTE Finalizadas / Não Faturadas.\n  // Se a O.S. não estiver nessa combinação, não procurar em nenhum outro estado\n  // e seguir a fila sem executar qualquer clique no GRM.\n  await openServiceOrderPage(page, 'Finalizadas', 'Não Faturadas');\n  const closed = await searchOs(page, item.os);\n  if (!closed.found) {\n    return {\n      status: 'RESOLVIDA_SEM_REABERTURA',\n      details: {\n        motivo: 'O.S. não localizada em Finalizadas/Não Faturadas. Item pulado conforme regra operacional; nenhuma outra combinação foi pesquisada e nenhum clique foi executado.',\n        regra_busca: 'FINALIZADAS_NAO_FATURADAS_EXCLUSIVA',\n      },\n    };\n  }\n\n`;

source = source.slice(0, searchStart) + replacement + source.slice(actionStart);

const observationNeedle = `      : result.status === 'REVISAO_MANUAL'\n        ? String(result.details?.motivo || 'O.S. separada para revisão manual; nenhuma reabertura foi executada.')`;
const observationReplacement = `      : result.status === 'RESOLVIDA_SEM_REABERTURA'\n        ? String(result.details?.motivo || 'O.S. não localizada em Finalizadas/Não Faturadas; item pulado sem reabertura.')\n      : result.status === 'REVISAO_MANUAL'\n        ? String(result.details?.motivo || 'O.S. separada para revisão manual; nenhuma reabertura foi executada.')`;

if (!source.includes(observationNeedle)) {
  throw new Error(`[patch-v11] bloco de observação da fila não encontrado em ${target}`);
}
source = source.replace(observationNeedle, observationReplacement);

const chainNeedle = `    if (!config.dryRun && ENV_CHAIN && result.status === 'REABERTA') {`;
const chainReplacement = `    if (!config.dryRun && ENV_CHAIN && ['REABERTA', 'RESOLVIDA_SEM_REABERTURA'].includes(result.status)) {`;
if (!source.includes(chainNeedle)) {
  throw new Error(`[patch-v11] bloco de encadeamento não encontrado em ${target}`);
}
source = source.replace(chainNeedle, chainReplacement);

fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v11] busca exclusiva Finalizadas/Não Faturadas: aplicada.');
console.log('[patch-v11] não encontrado => RESOLVIDA_SEM_REABERTURA, sem buscas adicionais.');
console.log('[patch-v11] encadeamento futuro poderá seguir após REABERTA ou item pulado.');
console.log(`[patch-v11] arquivo atualizado: ${target}`);
