#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'grm-sync-bonus-caixa.js');

if (!fs.existsSync(target)) {
  throw new Error('Arquivo alvo nao encontrado: ' + target);
}

const original = fs.readFileSync(target);
const oldCall = Buffer.from("await setStaffSituationExplicitV5(page, 'Inativos');", 'utf8');
const newCall = Buffer.from("await setStaffSituationExplicitV5(page, 'Não Ativos');", 'utf8');

if (original.indexOf(newCall) >= 0) {
  console.log('[OK] Patch v6 ja aplicado em ' + target);
  process.exit(0);
}

const pos = original.indexOf(oldCall);
if (pos < 0) {
  throw new Error('Chamada v5 para Inativos nao encontrada. Patch abortado sem alterar o arquivo.');
}

const patched = Buffer.concat([
  original.subarray(0, pos),
  newCall,
  original.subarray(pos + oldCall.length),
]);

const backup = target + '.bak-inativos-v6';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
fs.writeFileSync(target, patched);

console.log('[OK] Patch v6 aplicado em ' + target);
console.log('[OK] Situacao ajustada para o valor real exibido pelo GRM: Não Ativos.');
console.log('[OK] Backup preservado em ' + backup);
