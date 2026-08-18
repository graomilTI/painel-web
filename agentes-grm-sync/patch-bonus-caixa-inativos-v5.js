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
const v5Marker = Buffer.from('async function setStaffSituationExplicitV5(page, targetSituation) {', 'utf8');
if (original.indexOf(v5Marker) >= 0) {
  console.log('[OK] Patch v5 de inativos ja aplicado em ' + target);
  process.exit(0);
}

function replaceRange(buffer, startAnchor, endAnchor, replacement, label) {
  const start = buffer.indexOf(Buffer.from(startAnchor, 'utf8'));
  if (start < 0) throw new Error('Ancora inicial nao encontrada para ' + label + '.');
  const end = buffer.indexOf(Buffer.from(endAnchor, 'utf8'), start);
  if (end < 0) throw new Error('Ancora final nao encontrada para ' + label + '.');
  return Buffer.concat([
    buffer.subarray(0, start),
    Buffer.from(replacement, 'utf8'),
    buffer.subarray(end),
  ]);
}

const replacement = [
  'async function setStaffSituationExplicitV5(page, targetSituation) {',
  "  const target = String(targetSituation || '').normalize('NFD')",
  "    .replace(/[\\u0300-\\u036f]/g, '')",
  '    .toUpperCase()',
  '    .trim();',
  "  const targetPrefix = target.startsWith('INATIV') ? 'INATIV' : target;",
  '',
  "  const filterButton = await page.$('.staff-act-filter button') || await page.$('.staff-act-filter');",
  "  if (!filterButton) throw new Error('Botao Filtros nao localizado na tela de Funcionarios do GRM.');",
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
  "    const roots = [...document.querySelectorAll('.v-input,.v-select,.v-autocomplete,.v-field,[class*=\"field\"]')].filter(visible).filter((el) => normalize(el.textContent).includes('SITUACAO'));",
  '    let chosenRoot = null;',
  '    let combo = null;',
  '    for (const root of roots) {',
  "      const candidate = [...root.querySelectorAll('input[role=\"combobox\"],input')].find(visible);",
  '      if (candidate) { chosenRoot = root; combo = candidate; break; }',
  '    }',
  "    if (!combo) return { ok: false, reason: 'SITUATION_COMBOBOX_NOT_FOUND' };",
  "    combo.dataset.grmBonusSituationCombo = '1';",
  "    if (chosenRoot) chosenRoot.dataset.grmBonusSituationRoot = '1';",
  '    return { ok: true, value: combo.value || "", ariaExpanded: combo.getAttribute("aria-expanded"), ariaControls: combo.getAttribute("aria-controls"), rootText: normalize(chosenRoot?.textContent).slice(0, 180) };',
  '  });',
  '',
  "  if (!prepared.ok) throw new Error('Campo Situacao nao localizado: ' + JSON.stringify(prepared));",
  "  const comboSelector = '[data-grm-bonus-situation-combo=\"1\"]';",
  '',
  '  await page.evaluate((selector) => {',
  '    const el = document.querySelector(selector);',
  '    if (!el) return;',
  "    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));",
  "    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));",
  '    el.click();',
  '    el.focus();',
  '  }, comboSelector);',
  '  await sleep(500);',
  '',
  '  let menuInfo = await page.evaluate(() => {',
  "    const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "    const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';",
  '    const menu = id ? document.getElementById(id) : null;',
  '    return { id, exists: !!menu, text: String(menu?.innerText || menu?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 500) };',
  '  });',
  '',
  '  if (!menuInfo.exists) {',
  '    await page.focus(comboSelector);',
  "    await page.keyboard.press('ArrowDown');",
  '    await sleep(500);',
  '    menuInfo = await page.evaluate(() => {',
  "      const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "      const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';",
  '      const menu = id ? document.getElementById(id) : null;',
  '      return { id, exists: !!menu, text: String(menu?.innerText || menu?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 500) };',
  '    });',
  '  }',
  '',
  '  const selected = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/\\s+/g, ' ').trim();",
  "    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "    const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "    const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';",
  '    const menu = id ? document.getElementById(id) : null;',
  '    if (!menu) return { ok: false, reason: "MENU_NOT_FOUND", id };',
  '    const all = [menu, ...menu.querySelectorAll("*")].filter(visible);',
  '    const exact = all.filter((el) => normalize(el.textContent) === prefix || normalize(el.textContent) === "INATIVOS");',
  '    const starts = all.filter((el) => normalize(el.textContent).startsWith(prefix));',
  '    const raw = exact[0] || starts.sort((a, b) => String(a.textContent || "").length - String(b.textContent || "").length)[0];',
  '    if (!raw) {',
  '      return { ok: false, reason: "OPTION_NOT_FOUND", id, menuText: normalize(menu.textContent).slice(0, 500), childTexts: all.map((el) => normalize(el.textContent)).filter(Boolean).slice(0, 40) };',
  '    }',
  "    const clickable = raw.closest('[role=\"option\"],.v-list-item,button,[tabindex]') || raw;",
  '    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));',
  '    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));',
  '    clickable.click();',
  '    return { ok: true, id, text: normalize(raw.textContent), tag: clickable.tagName, cls: clickable.className };',
  '  }, targetPrefix);',
  '',
  '  if (!selected.ok) {',
  '    const diag = await page.evaluate(() => {',
  "      const combo = document.querySelector('[data-grm-bonus-situation-combo=\"1\"]');",
  "      const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';",
  '      const menu = id ? document.getElementById(id) : null;',
  '      return { value: combo?.value || "", ariaExpanded: combo?.getAttribute("aria-expanded"), ariaControls: id, menuExists: !!menu, menuText: String(menu?.innerText || menu?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 800), menuHtml: String(menu?.innerHTML || "").slice(0, 1600) };',
  '    });',
  "    throw new Error('Nao foi possivel selecionar ' + targetSituation + ' pelo menu controlado: ' + JSON.stringify({ selected, diag, menuInfo }));",
  '  }',
  '',
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
  '}',
  '',
].join('\n');

let patched = replaceRange(
  original,
  'async function setStaffSituationExplicitV4(page, targetSituation) {',
  '\nasync function waitStaffCpfRow(page, cpf, timeout = 5000) {',
  replacement,
  'funcao de filtro Situacao v4'
);

const callOld = Buffer.from("await setStaffSituationExplicitV4(page, 'Inativos');", 'utf8');
const callNew = Buffer.from("await setStaffSituationExplicitV5(page, 'Inativos');", 'utf8');
const callPos = patched.indexOf(callOld);
if (callPos < 0) throw new Error('Chamada v4 nao encontrada. Patch abortado.');
patched = Buffer.concat([patched.subarray(0, callPos), callNew, patched.subarray(callPos + callOld.length)]);

const backup = target + '.bak-inativos-v5';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
fs.writeFileSync(target, patched);
console.log('[OK] Patch v5 aplicado em ' + target);
console.log('[OK] Backup preservado em ' + backup);
