#!/usr/bin/env node
'use strict';

/*
 * Runner V5 para o cleanup de Café retroativo.
 * Corrige de forma controlada a seleção do modal de exclusão do GRM:
 * o V4 contava o role=dialog e elementos filhos (.v-overlay__content/.modal-wrp)
 * como modais distintos. O V5 considera somente o container real role=dialog.
 *
 * O arquivo-base V4 permanece responsável por todas as demais travas:
 * API atual, CPF opcional, descrição exata, categoria Café, precheck,
 * valor, CANCELAR/CONFIRMAR e verificação final pela API.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const sourcePath = path.join(dir, 'grm-cleanup-cafe-retroativo.js');
const runtimePath = path.join(dir, `.grm-cleanup-cafe-retroativo-v5-runtime-${process.pid}.js`);

let source = fs.readFileSync(sourcePath, 'utf8');

if (!source.includes("const VERSION = 'V4-GRM-TYPO-MODAL';")) {
  throw new Error('Versão-base inesperada. Esperado V4-GRM-TYPO-MODAL.');
}

const start = source.indexOf('async function confirmDeleteModal(page, expectedValueKey) {');
const end = source.indexOf('\nasync function deleteFirstTarget(page) {', start);
if (start < 0 || end < 0) throw new Error('Função confirmDeleteModal não localizada.');

let before = source.slice(0, start);
let fn = source.slice(start, end);
let after = source.slice(end);

const oldSelector = "[role=\"dialog\"],.v-overlay__content,.v-dialog,[class*=\"modal\"],[class*=\"dialog\"]";
const newSelector = "[role=\"dialog\"][aria-modal=\"true\"]";
const occurrences = fn.split(oldSelector).length - 1;
if (occurrences !== 2) {
  throw new Error(`Seletores esperados em confirmDeleteModal: 2; encontrados: ${occurrences}.`);
}

fn = fn.split(oldSelector).join(newSelector);
source = before + fn + after;
source = source.replace("const VERSION = 'V4-GRM-TYPO-MODAL';", "const VERSION = 'V5-ROLE-DIALOG-UNIQUE';");

fs.writeFileSync(runtimePath, source, { mode: 0o750 });

try {
  const result = spawnSync(process.execPath, [runtimePath, ...process.argv.slice(2)], {
    cwd: dir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status == null ? 1 : result.status;
} finally {
  try { fs.unlinkSync(runtimePath); } catch (_) {}
}
