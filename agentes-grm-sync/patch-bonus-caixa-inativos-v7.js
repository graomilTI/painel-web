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
const marker = Buffer.from('confirmacao pre-pesquisa v7', 'utf8');
if (original.indexOf(marker) >= 0) {
  console.log('[OK] Patch v7 de inativos ja aplicado em ' + target);
  process.exit(0);
}

const oldBlock = Buffer.from([
  '  await sleep(650);',
  '  await clickStaffSearch(page);',
  '',
  '  const confirmed = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/\\s+/g, ' ').trim();",
  "    const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "    const root = document.querySelector('[data-grm-bonus-situation-root=\"1\"]');",
  '    const combined = normalize((combo?.value || "") + " " + (root?.textContent || ""));',
  '    return { ok: combined.includes(prefix), combined: combined.slice(0, 220) };',
  '  }, targetPrefix);',
  "  if (!confirmed.ok) throw new Error('Filtro Situacao nao confirmou ' + targetSituation + ': ' + JSON.stringify(confirmed));",
  "  log('INFO', 'Filtro Situacao alterado para ' + targetSituation + ' via aria-controls.', selected);",
].join('\n'), 'utf8');

const newBlock = Buffer.from([
  '  // confirmacao pre-pesquisa v7',
  '  // O GRM re-renderiza os filtros ao clicar em Pesquisar e remove os data-*',
  '  // usados para localizar o combobox. Por isso a confirmacao precisa ocorrer',
  '  // antes da pesquisa, enquanto o valor selecionado ainda esta no campo.',
  '  await sleep(650);',
  '',
  '  const confirmed = await page.evaluate((expected) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/\\s+/g, ' ').trim();",
  "    const markedCombo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "    const markedRoot = document.querySelector('[data-grm-bonus-situation-root=\"1\"]');",
  "    const marked = normalize((markedCombo?.value || '') + ' ' + (markedRoot?.textContent || ''));",
  '    if (marked.includes(expected)) {',
  '      return { ok: true, method: "marked", combined: marked.slice(0, 220) };',
  '    }',
  '',
  "    const roots = [...document.querySelectorAll('.v-input,.v-select,.v-autocomplete,.v-field,[class*=\"field\"]')];",
  '    const snapshots = [];',
  '    for (const root of roots) {',
  "      const text = normalize(root.textContent || '');",
  "      const inputs = [...root.querySelectorAll('input[role=\"combobox\"],input')];",
  "      const values = inputs.map((el) => normalize(el.value || '')).filter(Boolean);",
  '      const combined = normalize(text + " " + values.join(" "));',
  "      if (text.includes('SITUACAO') || values.some((v) => v.includes(expected))) {",
  '        snapshots.push({ text: text.slice(0, 180), values: values.slice(0, 6), combined: combined.slice(0, 220) });',
  '      }',
  '      if (combined.includes(expected)) {',
  '        return { ok: true, method: "rediscovered", combined: combined.slice(0, 220), snapshots: snapshots.slice(0, 6) };',
  '      }',
  '    }',
  '',
  "    const allCombos = [...document.querySelectorAll('input[role=\"combobox\"]')].map((el) => ({",
  "      value: normalize(el.value || ''),",
  "      ariaExpanded: el.getAttribute('aria-expanded'),",
  "      ariaControls: el.getAttribute('aria-controls'),",
  "      hostText: normalize((el.closest('.v-input,.v-select,.v-autocomplete,.v-field') || el.parentElement)?.textContent || '').slice(0, 180),",
  '    }));',
  '    const direct = allCombos.find((item) => item.value.includes(expected) || item.hostText.includes(expected));',
  '    if (direct) return { ok: true, method: "all-combos", direct };',
  '',
  '    return { ok: false, expected, marked: marked.slice(0, 220), snapshots: snapshots.slice(0, 8), allCombos: allCombos.slice(0, 12) };',
  '  }, targetPrefix);',
  '',
  "  if (!confirmed.ok) throw new Error('Filtro Situacao nao confirmou ' + targetSituation + ' antes da pesquisa: ' + JSON.stringify(confirmed));",
  "  log('INFO', 'Filtro Situacao confirmado como ' + targetSituation + ' antes da pesquisa.', { selected, confirmed });",
  '',
  '  await clickStaffSearch(page);',
].join('\n'), 'utf8');

const pos = original.indexOf(oldBlock);
if (pos < 0) {
  throw new Error('Bloco de confirmacao v5/v6 nao encontrado. Patch v7 abortado sem alterar o arquivo.');
}

const patched = Buffer.concat([
  original.subarray(0, pos),
  newBlock,
  original.subarray(pos + oldBlock.length),
]);

const backup = target + '.bak-inativos-v7';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
fs.writeFileSync(target, patched);

console.log('[OK] Patch v7 aplicado em ' + target);
console.log('[OK] Confirmacao de Situacao ocorre antes do clique em Pesquisar.');
console.log('[OK] Backup preservado em ' + backup);
