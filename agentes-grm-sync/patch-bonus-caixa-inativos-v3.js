#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'grm-sync-bonus-caixa.js');

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo alvo nao encontrado: ${target}`);
}

const original = fs.readFileSync(target);
const v3Marker = Buffer.from('async function setStaffSituationExplicit(page, targetSituation) {', 'utf8');

if (original.indexOf(v3Marker) >= 0) {
  console.log(`[OK] Patch v3 de inativos ja aplicado em ${target}`);
  process.exit(0);
}

function replaceRange(buffer, startCandidates, endAnchor, replacement, label) {
  let start = -1;
  for (const candidate of startCandidates) {
    const idx = buffer.indexOf(Buffer.from(candidate, 'utf8'));
    if (idx >= 0 && (start < 0 || idx < start)) start = idx;
  }
  if (start < 0) {
    throw new Error(`Ancora inicial nao encontrada para ${label}. Patch abortado sem alterar o arquivo.`);
  }
  const end = buffer.indexOf(Buffer.from(endAnchor, 'utf8'), start);
  if (end < 0) {
    throw new Error(`Ancora final nao encontrada para ${label}. Patch abortado sem alterar o arquivo.`);
  }
  return Buffer.concat([
    buffer.subarray(0, start),
    Buffer.from(replacement, 'utf8'),
    buffer.subarray(end),
  ]);
}

let patched = original;

const navReplacement = [
  'async function openStaffPage(page) {',
  "  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });",
  '  await page.waitForFunction(() => {',
  "    const text = document.body?.innerText || '';",
  "    return /CONTROLE DE FUNCION/i.test(text) || /Nome, Email ou CPF/i.test(text);",
  '  }, { timeout: DEFAULT_TIMEOUT });',
  '}',
  '',
  'async function clickStaffSearch(page) {',
  "  const searchButton = await page.$('.staff-act-search button') || await page.$('.staff-act-search');",
  '  if (!searchButton) {',
  "    throw new Error('Botao Pesquisar nao localizado na tela de Funcionarios do GRM.');",
  '  }',
  '  await page.evaluate((btn) => btn.click(), searchButton);',
  '  await sleep(1200);',
  '}',
  '',
  'async function setStaffSituationExplicit(page, targetSituation) {',
  "  const target = String(targetSituation || '').normalize('NFD')",
  "    .replace(/[\\u0300-\\u036f]/g, '')",
  '    .toUpperCase()',
  '    .trim();',
  '',
  "  const filterButton = await page.$('.staff-act-filter button') || await page.$('.staff-act-filter');",
  '  if (!filterButton) {',
  "    throw new Error('Botao Filtros nao localizado na tela de Funcionarios do GRM.');",
  '  }',
  '  await page.evaluate((btn) => btn.click(), filterButton);',
  '  await sleep(600);',
  '',
  '  const prepared = await page.evaluate(() => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    document.querySelectorAll('[data-grm-bonus-situation-field]').forEach((el) => delete el.dataset.grmBonusSituationField);",
  "    const roots = [...document.querySelectorAll('.v-input,.v-field,[class*=\"field\"]')]",
  "      .filter((el) => normalize(el.textContent).includes('SITUACAO'));",
  "    const root = roots.find((el) => el.querySelector('input[role=\"combobox\"]'))",
  "      || roots.find((el) => el.querySelector('input'))",
  '      || roots[0];',
  "    if (!root) return { ok: false, reason: 'SITUATION_FIELD_NOT_FOUND' };",
  "    const clickable = root.querySelector('.v-field')",
  "      || root.querySelector('input[role=\"combobox\"]')",
  "      || root.querySelector('input')",
  '      || root;',
  "    clickable.dataset.grmBonusSituationField = '1';",
  '    return { ok: true, text: normalize(root.textContent).slice(0, 180) };',
  '  });',
  '',
  '  if (!prepared.ok) {',
  "    throw new Error('Campo Situacao nao localizado: ' + JSON.stringify(prepared));",
  '  }',
  '',
  "  await page.click('[data-grm-bonus-situation-field=\"1\"]');",
  '',
  "  const targetPrefix = target.startsWith('INATIV') ? 'INATIV' : target;",
  '  try {',
  '    await page.waitForFunction((prefix) => {',
  "      const normalize = (value) => String(value || '').normalize('NFD')",
  "        .replace(/[\\u0300-\\u036f]/g, '')",
  '        .toUpperCase()',
  "        .replace(/\\s+/g, ' ')",
  '        .trim();',
  "      const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "      return [...document.querySelectorAll('.v-list-item,[role=\"option\"]')].filter(visible).some((el) => normalize(el.textContent).startsWith(prefix));",
  '    }, { timeout: 6000 }, targetPrefix);',
  '  } catch {',
  "    throw new Error('Opcoes do filtro Situacao nao abriram para selecionar ' + targetSituation + '.');",
  '  }',
  '',
  '  const selected = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';",
  "    const candidates = [...document.querySelectorAll('.v-list-item,[role=\"option\"]')].filter(visible).filter((el) => normalize(el.textContent).startsWith(prefix));",
  '    const option = candidates[0];',
  '    if (!option) return { ok: false, matches: 0 };',
  '    option.click();',
  '    return { ok: true, text: normalize(option.textContent) };',
  '  }, targetPrefix);',
  '',
  '  if (!selected.ok) {',
  "    throw new Error('Opcao ' + targetSituation + ' nao localizada no filtro Situacao.');",
  '  }',
  '',
  '  await sleep(500);',
  '  await clickStaffSearch(page);',
  '',
  '  const confirmed = await page.evaluate((prefix) => {',
  "    const normalize = (value) => String(value || '').normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toUpperCase()',
  "      .replace(/\\s+/g, ' ')",
  '      .trim();',
  "    const roots = [...document.querySelectorAll('.v-input,.v-field,[class*=\"field\"]')].filter((el) => normalize(el.textContent).includes('SITUACAO'));",
  '    const texts = roots.map((el) => normalize(el.textContent));',
  '    return { ok: texts.some((text) => text.includes(prefix)), texts: texts.slice(0, 8) };',
  '  }, targetPrefix);',
  '',
  '  if (!confirmed.ok) {',
  "    throw new Error('Filtro Situacao nao confirmou ' + targetSituation + ': ' + JSON.stringify(confirmed));",
  '  }',
  '',
  "  log('INFO', 'Filtro Situacao alterado explicitamente para ' + targetSituation + '.', selected);",
  '}',
  '',
  'async function waitStaffCpfRow(page, cpf, timeout = 5000) {',
  '  const target = digits(cpf);',
  '  try {',
  "    await page.waitForFunction((targetCpf) => [...document.querySelectorAll('tr')].some((row) => String(row.innerText || '').replace(/\\D/g, '').includes(targetCpf)), { timeout }, target);",
  '    return true;',
  '  } catch {',
  '    return false;',
  '  }',
  '}',
].join('\n');

patched = replaceRange(
  patched,
  ['async function clearStaffSituationFilter(page) {', 'async function openStaffPage(page) {'],
  '\n\nasync function setSearchCpf(page, cpf) {',
  navReplacement,
  'bloco de navegacao/filtro'
);

const selectReplacement = [
  'async function selectExactStaffRow(page, cpf) {',
  '  const target = digits(cpf);',
  '  let found = await waitStaffCpfRow(page, target, 5000);',
  '',
  '  if (!found) {',
  "    log('INFO', 'CPF ' + target + ' nao localizado entre Ativos; tentando Situacao = Inativos.');",
  "    await setStaffSituationExplicit(page, 'Inativos');",
  '    await setSearchCpf(page, target);',
  '    await clickStaffSearch(page);',
  '    found = await waitStaffCpfRow(page, target, 8000);',
  '  }',
  '',
  '  if (!found) {',
  "    throw new Error('Funcionario nao localizado pelo CPF ' + target + ' nem em Ativos nem em Inativos.');",
  '  }',
  '',
  '  const prepared = await page.evaluate((targetCpf) => {',
  "    const onlyDigits = (value) => String(value || '').replace(/\\D/g, '');",
  "    const rows = [...document.querySelectorAll('tr')].filter((row) => onlyDigits(row.innerText).includes(targetCpf));",
  "    if (rows.length !== 1) return { ok: false, reason: 'ROW_NOT_UNIQUE', matches: rows.length };",
  '    const row = rows[0];',
  "    const exactCpf = [...row.querySelectorAll('td')].some((cell) => onlyDigits(cell.innerText) === targetCpf);",
  "    if (!exactCpf) return { ok: false, reason: 'CPF_NOT_EXACT' };",
  "    const checkbox = row.querySelector('input[type=\"checkbox\"]');",
  "    if (!checkbox) return { ok: false, reason: 'CHECKBOX_NOT_FOUND' };",
  "    checkbox.dataset.grmBonusStaffCheckbox = '1';",
  "    const control = checkbox.closest('.v-selection-control, .v-checkbox, label') || checkbox.parentElement;",
  "    if (control) control.dataset.grmBonusStaffControl = '1';",
  '    return { ok: true, checked: !!checkbox.checked };',
  '  }, target);',
  '',
  "  if (!prepared.ok) throw new Error('Funcionario nao localizado de forma unica pelo CPF: ' + JSON.stringify(prepared));",
  '  if (!prepared.checked) {',
  '    const clicked = await page.evaluate((targetCpf) => {',
  "      const onlyDigits = (value) => String(value || '').replace(/\\D/g, '');",
  "      const row = [...document.querySelectorAll('tr')].find((el) => onlyDigits(el.innerText).includes(targetCpf));",
  "      const checkbox = row?.querySelector('input[type=\"checkbox\"]');",
  '      if (!checkbox) return false;',
  '      checkbox.click();',
  '      return true;',
  '    }, target);',
  "    if (!clicked) throw new Error('Checkbox do funcionario desapareceu durante a selecao.');",
  '  }',
  '',
  '  await page.waitForFunction((targetCpf) => {',
  "    const onlyDigits = (value) => String(value || '').replace(/\\D/g, '');",
  "    const row = [...document.querySelectorAll('tr')].find((el) => onlyDigits(el.innerText).includes(targetCpf));",
  "    return row?.querySelector('input[type=\"checkbox\"]')?.checked === true;",
  '  }, { timeout: DEFAULT_TIMEOUT }, target);',
  '  await sleep(250);',
  '}',
].join('\n');

patched = replaceRange(
  patched,
  ['async function selectExactStaffRow(page, cpf) {'],
  '\n\nasync function waitEmployeeModal(page, timeout = 10000) {',
  selectReplacement,
  'selecao do funcionario'
);

const backup = `${target}.bak-inativos-v3`;
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
fs.writeFileSync(target, patched);
console.log(`[OK] Patch v3 aplicado em ${target}`);
console.log(`[OK] Backup preservado em ${backup}`);
