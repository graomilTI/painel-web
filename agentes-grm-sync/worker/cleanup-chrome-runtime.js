#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const ROOTS = [
  '/home/grao100/chrome-runtime/tmp',
  '/home/grao100/chrome-runtime/fixed-a/tmp',
  '/home/grao100/chrome-runtime/fixed-b/tmp',
  '/home/grao100/chrome-runtime/alteracoes/tmp',
];
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function activeCommandLines() {
  return fs.readdirSync('/proc', { withFileTypes: true })
    .filter((entry) => /^\d+$/.test(entry.name))
    .map((entry) => {
      try { return fs.readFileSync(`/proc/${entry.name}/cmdline`, 'utf8').replace(/\0/g, ' '); }
      catch { return ''; }
    })
    .join('\n');
}

const active = activeCommandLines();
let removed = 0;
let reclaimed = 0;

for (const configuredRoot of ROOTS) {
  const root = path.resolve(configuredRoot);
  if (!root.startsWith('/home/grao100/chrome-runtime/')) throw new Error(`Raiz insegura: ${root}`);
  if (!fs.existsSync(root)) continue;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('puppeteer_dev_profile-')) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) !== root || !target.startsWith(`${root}${path.sep}`)) continue;
    if (active.includes(target)) continue;
    const stat = fs.statSync(target);
    if (Date.now() - stat.mtimeMs < MAX_AGE_MS) continue;

    const before = stat.blocks ? stat.blocks * 512 : 0;
    fs.rmSync(target, { recursive: true, force: false });
    removed += 1;
    reclaimed += before;
  }
}

console.log(`[CLEANUP] ${removed} perfil(is) órfão(s) removido(s); estimativa mínima recuperada: ${(reclaimed / 1024 / 1024).toFixed(1)} MiB.`);
