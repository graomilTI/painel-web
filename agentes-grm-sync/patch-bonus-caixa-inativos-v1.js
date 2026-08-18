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
const marker = Buffer.from('async function clearStaffSituationFilter(page) {', 'utf8');

if (original.indexOf(marker) >= 0) {
  console.log(`[OK] Patch de inativos ja aplicado em ${target}`);
  process.exit(0);
}

const startAnchor = Buffer.from('async function openStaffPage(page) {', 'utf8');
const endAnchor = Buffer.from('\n\nasync function setSearchCpf(page, cpf) {', 'utf8');

const start = original.indexOf(startAnchor);
if (start < 0) {
  throw new Error('Ancora openStaffPage nao encontrada. Patch abortado sem alterar o arquivo.');
}

const end = original.indexOf(endAnchor, start);
if (end < 0) {
  throw new Error('Ancora setSearchCpf nao encontrada. Patch abortado sem alterar o arquivo.');
}

const replacement = Buffer.from(`async function clearStaffSituationFilter(page) {
  // O GRM abre a tela de Funcionarios filtrada por Situacao = Ativo.
  // Para bonus de competencia fechada precisamos localizar tambem quem foi
  // desligado depois de produzir (inclusive inativacao temporaria).
  const filterButton = await page.$('.staff-act-filter button');
  if (!filterButton) {
    throw new Error('Botao Filtros nao localizado na tela de Funcionarios do GRM.');
  }

  await page.evaluate((btn) => btn.click(), filterButton);
  await sleep(600);

  const clearResult = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toUpperCase()
      .replace(/\\s+/g, ' ')
      .trim();

    const clearButtons = [...document.querySelectorAll('.v-field__clearable button')];

    for (const btn of clearButtons) {
      let parent = btn;
      for (let level = 0; level < 9 && parent; level += 1, parent = parent.parentElement) {
        if (normalize(parent.textContent).includes('SITUACAO')) {
          btn.click();
          return { cleared: true, method: 'clearable' };
        }
      }
    }

    // Se o campo ja estiver sem valor, nao existe botao X. Nesse caso o
    // filtro ja esta correto e basta executar a pesquisa.
    const situationText = [...document.querySelectorAll('.v-input,.v-field,[class*="field"]')]
      .map((el) => normalize(el.textContent))
      .find((text) => text.includes('SITUACAO')) || '';

    const alreadyOpen = situationText === 'SITUACAO'
      || /SITUACAO\\s*(TODOS|TODAS|QUALQUER)?$/.test(situationText);

    return {
      cleared: false,
      alreadyOpen,
      situationText: situationText.slice(0, 160),
    };
  });

  await sleep(450);

  const searchButton = await page.$('.staff-act-search button');
  if (!searchButton) {
    throw new Error('Botao Pesquisar nao localizado apos limpar o filtro Situacao.');
  }

  await page.evaluate((btn) => btn.click(), searchButton);
  await sleep(1400);

  log('INFO', 'Filtro Situacao liberado para incluir ativos e inativos.', clearResult);
  return clearResult;
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION/i.test(text) || /Nome, Email ou CPF/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });

  await clearStaffSituationFilter(page);
}`, 'utf8');

const patched = Buffer.concat([
  original.subarray(0, start),
  replacement,
  original.subarray(end),
]);

const backup = `${target}.bak-inativos-v1`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, original);
}

fs.writeFileSync(target, patched);
console.log(`[OK] Patch aplicado em ${target}`);
console.log(`[OK] Backup preservado em ${backup}`);
