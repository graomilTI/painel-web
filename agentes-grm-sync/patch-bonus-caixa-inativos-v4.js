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
const v4Marker = Buffer.from('async function setStaffSituationExplicitV4(page, targetSituation) {', 'utf8');

if (original.indexOf(v4Marker) >= 0) {
  console.log('[OK] Patch v4 de inativos ja aplicado em ' + target);
  process.exit(0);
}

function replaceRange(buffer, startAnchor, endAnchor, replacement, label) {
  const start = buffer.indexOf(Buffer.from(startAnchor, 'utf8'));
  if (start < 0) {
    throw new Error('Ancora inicial nao encontrada para ' + label + '. Patch abortado sem alterar o arquivo.');
  }
  const end = buffer.indexOf(Buffer.from(endAnchor, 'utf8'), start);
  if (end < 0) {
    throw new Error('Ancora final nao encontrada para ' + label + '. Patch abortado sem alterar o arquivo.');
  }
  return Buffer.concat([
    buffer.subarray(0, start),
    Buffer.from(replacement, 'utf8'),
    buffer.subarray(end),
  ]);
}

const replacement = [
  'async function setStaffSituationExplicitV4(page, targetSituation) {',
  "  const target = String(targetSituation || '').normalize('NFD')",
  "    .replace(/[\\u0300-\\u036f]/g, '')",
  '    .toUpperCase()',
  '    .trim();',
  "  const targetPrefix = target.startsWith('INATIV') ? 'INATIV' : target;",
  '',
  "  const filterButton = await page.$('.staff-act-filter button') || await page.$('.staff-act-filter');",
  '  if (!filterButton) {',
  "    throw new Error('Botao Filtros nao localizado na tela de Funcionarios do GRM.');",
  '  }',
  '  await page.evaluate((btn) => btn.click(), filterButton);',
  '  await sleep(650);',
  '',
  '  const prepared = await page.evaluate(() => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "    document.querySelectorAll('[data-grm-bonus-situation-combo]').forEach((el) => delete el.dataset.grmBonusSituationCombo);",
  "    document.querySelectorAll('[data-grm-bonus-situation-root]').forEach((el) => delete el.dataset.grmBonusSituationRoot);",
  "    const roots = [...document.querySelectorAll('.v-input,.v-select,.v-autocomplete,.v-field,[class*=\"field\"]')]",
  "      .filter(visible)",
  "      .filter((el) => normalize(el.textContent).includes('SITUACAO'));",
  '    let chosenRoot = null;',
  '    let combo = null;',
  '    for (const root of roots) {',
  "      const candidate = [...root.querySelectorAll('input[role=\"combobox\"],input')].find(visible);",
  '      if (candidate) { chosenRoot = root; combo = candidate; break; }',
  '    }',
  '    if (!combo) {',
  "      combo = [...document.querySelectorAll('input[role=\"combobox\"]')].filter(visible).find((el) => {",
  "        const host = el.closest('.v-input,.v-select,.v-autocomplete,.v-field') || el.parentElement;",
  "        return normalize(host?.textContent).includes('SITUACAO');",
  '      }) || null;',
  "      chosenRoot = combo ? (combo.closest('.v-input,.v-select,.v-autocomplete,.v-field') || combo.parentElement) : null;",
  '    }',
  "    if (!combo) return { ok: false, reason: 'SITUATION_COMBOBOX_NOT_FOUND', roots: roots.map((el) => normalize(el.textContent).slice(0, 120)).slice(0, 8) };",
  "    combo.dataset.grmBonusSituationCombo = '1';",
  "    if (chosenRoot) chosenRoot.dataset.grmBonusSituationRoot = '1';",
  '    return {',
  '      ok: true,',
  "      value: combo.value || '',",
  "      ariaExpanded: combo.getAttribute('aria-expanded'),",
  "      ariaControls: combo.getAttribute('aria-controls'),",
  "      role: combo.getAttribute('role'),",
  "      readonly: combo.hasAttribute('readonly'),",
  "      rootText: normalize(chosenRoot?.textContent).slice(0, 180),",
  '    };',
  '  });',
  '',
  '  if (!prepared.ok) {',
  "    throw new Error('Campo Situacao nao localizado: ' + JSON.stringify(prepared));",
  '  }',
  '',
  "  const comboSelector = '[data-grm-bonus-situation-combo=\"1\"]';",
  '  await page.evaluate((selector) => {',
  '    const el = document.querySelector(selector);',
  '    if (!el) return;',
  "    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));",
  "    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));",
  '    el.click();',
  '    el.focus();',
  '  }, comboSelector);',
  '  await sleep(350);',
  '',
  '  const optionsVisible = async () => page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "    const nodes = [...document.querySelectorAll('[role=\"option\"],.v-list-item,.v-list-item-title,.v-overlay__content .v-list-item')].filter(visible);",
  '    return nodes.some((el) => normalize(el.textContent).startsWith(prefix));',
  '  }, targetPrefix);',
  '',
  '  let opened = await optionsVisible();',
  '  if (!opened) {',
  '    await page.focus(comboSelector);',
  "    await page.keyboard.press('ArrowDown');",
  '    await sleep(350);',
  '    opened = await optionsVisible();',
  '  }',
  '  if (!opened) {',
  '    await page.focus(comboSelector);',
  "    await page.keyboard.press('Enter');",
  '    await sleep(350);',
  '    opened = await optionsVisible();',
  '  }',
  '  if (!opened) {',
  '    await page.evaluate(() => {',
  "      const root = document.querySelector('[data-grm-bonus-situation-root=\"1\"]');",
  "      const trigger = root?.querySelector('.v-field__append-inner,.v-field__input,.v-select__selection') || null;",
  '      if (trigger) trigger.click();',
  '    });',
  '    await sleep(450);',
  '    opened = await optionsVisible();',
  '  }',
  '',
  '  if (!opened) {',
  '    const diag = await page.evaluate(() => {',
  "      const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "      const root = document.querySelector('[data-grm-bonus-situation-root=\"1\"]');",
  "      const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "      const listTexts = [...document.querySelectorAll('[role=\"option\"],.v-list-item,.v-list-item-title')].filter(visible).map((el) => String(el.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 20);",
  '      return {',
  "        value: combo?.value || '',",
  "        ariaExpanded: combo?.getAttribute('aria-expanded'),",
  "        ariaControls: combo?.getAttribute('aria-controls'),",
  "        rootText: String(root?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 220),",
  '        listTexts,',
  '      };',
  '    });',
  "    throw new Error('Combobox Situacao nao abriu opcoes para ' + targetSituation + ': ' + JSON.stringify(diag));",
  '  }',
  '',
  '  const selected = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "    const nodes = [...document.querySelectorAll('[role=\"option\"],.v-list-item,.v-list-item-title')].filter(visible);",
  '    const raw = nodes.find((el) => normalize(el.textContent).startsWith(prefix));',
  '    if (!raw) return { ok: false, matches: 0 };',
  "    const clickable = raw.closest('[role=\"option\"],.v-list-item') || raw;",
  '    clickable.click();',
  '    return { ok: true, text: normalize(raw.textContent) };',
  '  }, targetPrefix);',
  '',
  '  if (!selected.ok) {',
  "    throw new Error('Opcao ' + targetSituation + ' nao localizada no combobox Situacao.');",
  '  }',
  '',
  '  await sleep(550);',
  '  await clickStaffSearch(page);',
  '',
  '  const confirmed = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "    const root = document.querySelector('[data-grm-bonus-situation-root=\"1\"]');",
  "    const combined = normalize((combo?.value || '') + ' ' + (root?.textContent || ''));",
  '    return { ok: combined.includes(prefix), combined: combined.slice(0, 220) };',
  '  }, targetPrefix);',
  '',
  '  if (!confirmed.ok) {',
  "    throw new Error('Filtro Situacao nao confirmou ' + targetSituation + ': ' + JSON.stringify(confirmed));",
  '  }',
  '',
  "  log('INFO', 'Filtro Situacao alterado para ' + targetSituation + ' pelo combobox.', selected);",
  '}',
  '',
].join('\n');

let patched = replaceRange(
  original,
  'async function setStaffSituationExplicit(page, targetSituation) {',
  '\nasync function waitStaffCpfRow(page, cpf, timeout = 5000) {',
  replacement,
  'funcao de filtro Situacao v3'
);

const callOld = Buffer.from("await setStaffSituationExplicit(page, 'Inativos');", 'utf8');
const callNew = Buffer.from("await setStaffSituationExplicitV4(page, 'Inativos');", 'utf8');
const callPos = patched.indexOf(callOld);
if (callPos < 0) {
  throw new Error('Chamada setStaffSituationExplicit nao encontrada. Patch abortado.');
}
patched = Buffer.concat([
  patched.subarray(0, callPos),
  callNew,
  patched.subarray(callPos + callOld.length),
]);

const backup = target + '.bak-inativos-v4';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
fs.writeFileSync(target, patched);
console.log('[OK] Patch v4 aplicado em ' + target);
console.log('[OK] Backup preservado em ' + backup);
