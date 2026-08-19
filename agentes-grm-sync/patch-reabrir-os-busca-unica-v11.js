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

// A stack v1-v10 ainda contém a busca inicial em Abertas seguida de todo o
// diagnóstico financeiro/situação. Substituímos esse bloco inteiro pela única
// combinação operacional permitida, preservando toda a lógica de clique e
// confirmação que começa em selectOsRow().
const searchStartNeedle = "  await openServiceOrderPage(page, 'Abertas', 'Não Faturadas');";
const actionStartNeedle = '  await selectOsRow(page, item.os);';
const searchStart = source.indexOf(searchStartNeedle, processIndex);
const actionStart = source.indexOf(actionStartNeedle, processIndex);

if (searchStart < 0 || actionStart < 0 || actionStart <= searchStart) {
  throw new Error(`[patch-v11] bloco de busca anterior não encontrado em ${target}`);
}

const replacement = `  // ${marker}\n  // Pré-validação operacional: consultar SOMENTE Finalizadas / Não Faturadas.\n  // Se a O.S. não estiver nessa combinação, não pesquisar nenhum outro estado\n  // e encerrar este item sem executar clique no GRM.\n  await openServiceOrderPage(page, 'Finalizadas', 'Não Faturadas');\n  const closed = await searchOs(page, item.os);\n  if (!closed.found) {\n    return {\n      status: 'RESOLVIDA_SEM_REABERTURA',\n      details: {\n        motivo: 'O.S. não localizada em Finalizadas/Não Faturadas. Item pulado conforme regra operacional; nenhuma outra combinação foi pesquisada e nenhum clique foi executado.',\n        regra_busca: 'FINALIZADAS_NAO_FATURADAS_EXCLUSIVA',\n      },\n    };\n  }\n\n`;

source = source.slice(0, searchStart) + replacement + source.slice(actionStart);

// Adiciona a observação específica sem depender da indentação exata deixada
// pelos patches financeiros v1-v5. A v5 deixa este ramo antes de REVISAO_MANUAL.
const reviewNeedle = ": result.status === 'REVISAO_MANUAL'";
const reviewIndex = source.indexOf(reviewNeedle);
if (reviewIndex < 0) {
  throw new Error(`[patch-v11] ramo REVISAO_MANUAL de queueObservation não encontrado em ${target}`);
}

const lineStart = source.lastIndexOf('\n', reviewIndex) + 1;
const indent = source.slice(lineStart, reviewIndex);
const resolvedBranch = `${indent}: result.status === 'RESOLVIDA_SEM_REABERTURA'\n${indent}  ? String(result.details?.motivo || 'O.S. não localizada em Finalizadas/Não Faturadas; item pulado sem reabertura.')\n${indent}`;
source = source.slice(0, lineStart) + resolvedBranch + source.slice(reviewIndex);

// Se o encadeamento vier a ser habilitado depois, um item ausente também pode
// liberar o próximo. O deploy continua mantendo ENCADEAR=false por segurança.
const chainNeedle = `    if (!config.dryRun && ENV_CHAIN && result.status === 'REABERTA') {`;
const chainReplacement = `    if (!config.dryRun && ENV_CHAIN && ['REABERTA', 'RESOLVIDA_SEM_REABERTURA'].includes(result.status)) {`;
if (source.includes(chainNeedle)) {
  source = source.replace(chainNeedle, chainReplacement);
} else if (!source.includes(chainReplacement)) {
  throw new Error(`[patch-v11] bloco de encadeamento não encontrado em ${target}`);
}

fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v11] busca exclusiva Finalizadas/Não Faturadas: aplicada.');
console.log('[patch-v11] não encontrado => RESOLVIDA_SEM_REABERTURA, sem buscas adicionais.');
console.log('[patch-v11] encadeamento futuro poderá seguir após REABERTA ou item pulado.');
console.log(`[patch-v11] arquivo atualizado: ${target}`);
