#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const marker = `async function processItem(page, item, config) {\n`;
const guarded = `async function processItem(page, item, config) {\n  // Regra oficial de reabertura do lote:\n  // Situação = Finalizadas e Financeiro = Não Faturadas são validados ao vivo no GRM.\n  // Estes dois critérios abaixo são travas locais e também existem no claim do Supabase.\n  const remanescenteRegra = Number(item.remanescente);\n  const diasSemEmbarqueRegra = Number(item.dias_sem_embarque);\n  const elegivelRegra = Number.isFinite(remanescenteRegra) && remanescenteRegra > 30\n    && Number.isFinite(diasSemEmbarqueRegra) && diasSemEmbarqueRegra < 10;\n\n  if (!elegivelRegra) {\n    return {\n      status: 'REVISAO_MANUAL',\n      details: {\n        motivo: \`Fora da regra oficial de reabertura: exige Remanescente > 30,00 e Dias sem embarque < 10. Valores atuais: remanescente=\${item.remanescente ?? 'null'}, dias_sem_embarque=\${item.dias_sem_embarque ?? 'null'}. Nenhum clique foi executado.\`,\n        regra: 'FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10',\n        remanescente: item.remanescente ?? null,\n        dias_sem_embarque: item.dias_sem_embarque ?? null,\n      },\n    };\n  }\n`;

if (source.includes(guarded)) {
  console.log('[patch-v10] regra oficial de reabertura: já aplicada.');
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error(`[patch-v10] função processItem não encontrada em ${target}`);
}

source = source.replace(marker, guarded);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v10] regra Remanescente > 30 e Dias sem embarque < 10: aplicada.');
console.log('[patch-v10] Situação Finalizadas / Financeiro Não Faturadas continuam validados ao vivo no GRM antes do clique.');
console.log(`[patch-v10] arquivo atualizado: ${target}`);
