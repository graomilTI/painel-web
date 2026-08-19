#!/usr/bin/env node
'use strict';

/*
 * Limpeza pontual dos lançamentos indevidos de Café criados retroativamente
 * no Caixa Operacional.
 *
 * Segurança:
 * - descobre os alvos diretamente na API atual do GRM;
 * - exige descrição exata "Lançamento automático retroativo - Café";
 * - exige categoria Café;
 * - faz um PRECHECK completo pela interface antes de qualquer exclusão;
 * - exige que a quantidade por colaborador na interface seja igual à API;
 * - usa exclusivamente a lixeira da própria linha alvo;
 * - valida o modal de exclusão, o valor e os botões CANCELAR/CONFIRMAR;
 * - aceita somente as grafias observadas no GRM: EXCLUIR MOVIMENTO ou EXLCUIR MOVIMENTO;
 * - permite escopo seguro por CPF via GRM_CLEANUP_CAFE_ONLY_CPF;
 * - após o --real, consulta novamente a API e exige zero alvos no escopo executado.
 *
 * DRY_RUN é o padrão. Para excluir de verdade, use --real.
 */

process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = process.env.TMP || '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMP;
process.env.TMPDIR = process.env.TMPDIR || process.env.TMP;

require('dotenv').config();

if (typeof globalThis.Headers === 'undefined') {
  let nodeFetch;
  try { nodeFetch = require('node-fetch'); } catch (_) {
    nodeFetch = require('./node_modules/puppeteer/node_modules/node-fetch');
  }
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const VERSION = 'V4-GRM-TYPO-MODAL';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const STAFF_URL = process.env.GRM_CLEANUP_CAFE_STAFF_URL || 'https://www.grmserver.com.br/adm/team/staff';
const DATE_FROM = process.env.GRM_CLEANUP_CAFE_DATA_DE || '2026-08-11';
const DATE_TO = process.env.GRM_CLEANUP_CAFE_DATA_ATE || '2026-08-17';
const TARGET_DESCRIPTION = 'Lançamento automático retroativo - Café';
const TARGET_DESCRIPTION_KEY = 'LANCAMENTO AUTOMATICO RETROATIVO CAFE';
const DRY_RUN = !process.argv.includes('--real');
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_CLEANUP_CAFE_TIMEOUT_MS || 45000));
const MAX_DELETE_PER_STAFF = Math.max(1, Number(process.env.GRM_CLEANUP_CAFE_MAX_POR_COLABORADOR || 20));
const ONLY_CPF = String(process.env.GRM_CLEANUP_CAFE_ONLY_CPF || '').replace(/\D/g, '');

const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais do GRM ausentes.');
if (ONLY_CPF && ONLY_CPF.length !== 11) throw new Error('GRM_CLEANUP_CAFE_ONLY_CPF inválido. Informe 11 dígitos.');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
function isoToBr(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function toIsoDate(value) {
  const s = String(value || '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return s;
}
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}

async function launchBrowser() {
  const options = {
    headless: HEADLESS,
    defaultViewport: { width: 1920, height: 1440 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-extensions',
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  return puppeteer.launch(options);
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: DEFAULT_TIMEOUT });
  await page.waitForSelector('input#input-v-5', { timeout: DEFAULT_TIMEOUT });
  await page.click('input#input-v-2', { clickCount: 3 });
  await page.type('input#input-v-2', GRM_USER, { delay: 10 });
  await page.click('input#input-v-5', { clickCount: 3 });
  await page.type('input#input-v-5', GRM_PASSWORD, { delay: 10 });
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button.submit-btn'),
  ]);
  await sleep(800);
}

async function api(page, path, body) {
  return page.evaluate(async ({ apiPath, payload }) => {
    let token = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      try {
        const value = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (value?.userToken) { token = value.userToken; break; }
      } catch (_) {}
    }
    if (!token) throw new Error('Token GRM não encontrado no navegador.');
    const response = await fetch(apiPath, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = { text }; }
    if (!response.ok || json?.result === false) {
      throw new Error(`${response.status}: ${text.slice(0, 700)}`);
    }
    return json;
  }, { apiPath: path, payload: body });
}

async function loadCurrentApiState(page) {
  const [report, staffResp, typesResp] = await Promise.all([
    api(page, '/api/reports/finance/operatingFlow', {
      ofmDateFrom: isoToBr(DATE_FROM),
      ofmDateTo: isoToBr(DATE_TO),
      ofmStatusReport: ['P', 'A', 'N'],
      reportType: 'flowList',
    }),
    api(page, '/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }),
    api(page, '/api/oFlowExpenseType/getRecords', { oexStatus: 'A' }),
  ]);

  const types = typesResp.searchData || [];
  const cafe = types.find((row) => norm(row.oexName) === 'CAFE');
  if (!cafe) throw new Error('Categoria Café não encontrada na API do GRM.');
  const cafeCode = Number(cafe.oexCode);

  const movements = (report.searchData || []).filter((row) =>
    Number(row.oexCode) === cafeCode
    && norm(row.ofmDescription) === TARGET_DESCRIPTION_KEY
    && ['P', 'A', 'N'].includes(String(row.ofmStatus || '').toUpperCase())
  );

  const staffByCode = new Map((staffResp.searchData || []).map((row) => [Number(row.staCode), row]));
  const byStaff = new Map();
  const unresolved = [];

  for (const movement of movements) {
    const staCode = Number(movement.staCode);
    const staff = staffByCode.get(staCode);
    if (!staff) {
      unresolved.push({ staCode, ofmCode: Number(movement.ofmCode), data: toIsoDate(movement.ofmDate) });
      continue;
    }
    const cpf = digits(staff.staCPF);
    if (cpf.length !== 11) {
      unresolved.push({ staCode, nome: staff.staName, cpf: staff.staCPF, ofmCode: Number(movement.ofmCode) });
      continue;
    }
    const current = byStaff.get(staCode) || {
      staCode,
      cpf,
      colaborador: staff.staName || cpf,
      movimentos: [],
    };
    current.movimentos.push({
      ofmCode: Number(movement.ofmCode),
      data: toIsoDate(movement.ofmDate),
      status: String(movement.ofmStatus || ''),
      valor: Number(movement.ofmValue || 0),
    });
    byStaff.set(staCode, current);
  }

  const targets = [...byStaff.values()]
    .map((target) => ({
      ...target,
      movimentos: target.movimentos.sort((a, b) => a.ofmCode - b.ofmCode),
      esperado: target.movimentos.length,
    }))
    .sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));

  return {
    cafeCode,
    reportCount: (report.searchData || []).length,
    total: movements.length,
    targets,
    unresolved,
  };
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION[ÁA]RIOS/i.test(text) || /Nome, Email ou CPF/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
}

async function searchCpf(page, cpf) {
  const ok = await page.evaluate((targetCpf) => {
    const inputs = [...document.querySelectorAll('input')];
    const input = inputs.find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || ''))
      || inputs.find((el) => /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, targetCpf); else input.value = targetCpf;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  }, cpf);
  if (!ok) throw new Error('Campo de busca Nome, Email ou CPF não localizado.');
  await sleep(1200);
}

async function selectExactStaff(page, cpf) {
  await page.waitForFunction((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    return [...document.querySelectorAll('tr')].some((row) => onlyDigits(row.innerText).includes(targetCpf));
  }, { timeout: DEFAULT_TIMEOUT }, cpf);

  const selected = await page.evaluate((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(targetCpf));
    if (rows.length !== 1) return { ok: false, matches: rows.length };
    const row = rows[0];
    const exact = [...row.querySelectorAll('td')].some((cell) => onlyDigits(cell.innerText) === targetCpf);
    if (!exact) return { ok: false, reason: 'CPF_NOT_EXACT' };
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return { ok: false, reason: 'CHECKBOX_NOT_FOUND' };
    if (!checkbox.checked) checkbox.click();
    return { ok: true };
  }, cpf);
  if (!selected.ok) throw new Error(`Funcionário não localizado de forma única: ${JSON.stringify(selected)}`);
  await sleep(250);
}

async function clickCash(page) {
  const prepared = await page.evaluate(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    document.querySelectorAll('[data-grm-cleanup-cash]').forEach((el) => delete el.dataset.grmCleanupCash);
    const search = [...document.querySelectorAll('input')]
      .find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || '') || /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!search) return { ok: false, reason: 'SEARCH_NOT_FOUND' };
    const sr = search.getBoundingClientRect();
    const y = sr.top + sr.height / 2;
    const buttons = [...document.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right <= sr.left + 15 && Math.abs(rect.top + rect.height / 2 - y) <= 35)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (buttons.length < 5) return { ok: false, reason: 'ACTION_BAR_INCOMPLETE', count: buttons.length };
    buttons[4].el.dataset.grmCleanupCash = '1';
    return { ok: true, selector: '[data-grm-cleanup-cash="1"]' };
  });
  if (!prepared.ok) throw new Error(`Botão Caixa não localizado: ${JSON.stringify(prepared)}`);
  await page.click(prepared.selector);
  await page.waitForFunction(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible);
    return dialogs.some((dialog) => {
      const text = String(dialog.innerText || '').replace(/\s+/g, ' ');
      return /CAIXA OPERACIONAL/i.test(text)
        && /TIPO DE DESPESA/i.test(text)
        && /DESCRI[CÇ][AÃ]O|DESCRICAO/i.test(text)
        && /VALOR/i.test(text);
    });
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(450);
}

async function inspectTargets(page) {
  return page.evaluate(({ descriptionKey }) => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    return [...document.querySelectorAll('tr,[role="row"]')]
      .filter(visible)
      .map((row, index) => ({
        index,
        text: String(row.innerText || '').replace(/\s+/g, ' ').trim(),
        normalized: normText(row.innerText || ''),
      }))
      .filter((row) => row.normalized.includes(descriptionKey) && /(^| )CAFE( |$)/.test(row.normalized));
  }, { descriptionKey: TARGET_DESCRIPTION_KEY });
}

async function openTarget(page, target) {
  await openStaffPage(page);
  await searchCpf(page, target.cpf);
  await selectExactStaff(page, target.cpf);
  await clickCash(page);
  return inspectTargets(page);
}

async function prepareDeleteTarget(page) {
  return page.evaluate(({ descriptionKey }) => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const signature = (el) => normText([
      el.innerText,
      el.textContent,
      el.getAttribute?.('title'),
      el.getAttribute?.('aria-label'),
      typeof el.className === 'string' ? el.className : '',
      ...[...el.querySelectorAll('lord-icon,svg,use,i')].map((icon) => [
        icon.getAttribute('src'), icon.getAttribute('href'), icon.getAttribute('data-icon'),
        typeof icon.className === 'string' ? icon.className : '',
      ].filter(Boolean).join(' ')),
    ].filter(Boolean).join(' '));

    document.querySelectorAll('[data-grm-cleanup-delete]').forEach((el) => delete el.dataset.grmCleanupDelete);
    const rows = [...document.querySelectorAll('tr,[role="row"]')]
      .filter(visible)
      .filter((row) => {
        const key = normText(row.innerText || '');
        return key.includes(descriptionKey) && /(^| )CAFE( |$)/.test(key);
      });
    if (!rows.length) return { ok: false, reason: 'NO_TARGET' };

    const row = rows[0];
    const cells = [...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')];
    const rowText = String(row.innerText || '').replace(/\s+/g, ' ').trim();
    const valueMatch = rowText.match(/R\$\s*([\d.]+,\d{2})/i);
    if (!valueMatch) return { ok: false, reason: 'VALUE_NOT_FOUND', row: rowText.slice(0, 1000) };
    const valueText = `R$ ${valueMatch[1]}`;

    const allButtons = [...row.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    const semantic = allButtons.filter((el) => /EXCLUIR|REMOVER|DELETE|TRASH|LIXEIRA|BIN/.test(signature(el)));
    let deleteButton = semantic.length === 1 ? semantic[0] : null;
    let strategy = deleteButton ? 'SEMANTIC' : null;

    if (!deleteButton && cells.length) {
      const firstCellButtons = [...cells[0].querySelectorAll('button,[role="button"],a')]
        .filter(visible)
        .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (firstCellButtons.length === 1) {
        deleteButton = firstCellButtons[0];
        strategy = 'FIRST_CELL_ONLY_BUTTON';
      }
    }

    if (!deleteButton) {
      return {
        ok: false,
        reason: 'DELETE_CONTROL_NOT_UNIQUE',
        semanticCount: semantic.length,
        row: rowText.slice(0, 1000),
        controls: allButtons.map((el) => signature(el)).slice(0, 20),
      };
    }

    deleteButton.dataset.grmCleanupDelete = '1';
    return {
      ok: true,
      selector: '[data-grm-cleanup-delete="1"]',
      strategy,
      row: rowText.slice(0, 1000),
      valueText,
      valueKey: normText(valueText),
    };
  }, { descriptionKey: TARGET_DESCRIPTION_KEY });
}

async function confirmDeleteModal(page, expectedValueKey) {
  await page.waitForFunction(({ expectedValue }) => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const validTitle = (text) => text.includes('EXCLUIR MOVIMENTO') || text.includes('EXLCUIR MOVIMENTO');
    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible);
    return dialogs.some((dialog) => {
      const text = normText(dialog.innerText || '');
      const buttons = [...dialog.querySelectorAll('button,[role="button"]')].filter(visible);
      return validTitle(text)
        && text.includes('CAIXA OPERACIONAL')
        && text.includes('DESEJA REALMENTE EXCLUIR O REGISTRO NO VALOR DE')
        && text.includes(expectedValue)
        && buttons.some((button) => normText(button.innerText || button.textContent) === 'CONFIRMAR')
        && buttons.some((button) => normText(button.innerText || button.textContent) === 'CANCELAR');
    });
  }, { timeout: DEFAULT_TIMEOUT }, { expectedValue: expectedValueKey });

  const clicked = await page.evaluate(({ expectedValue }) => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const validTitle = (text) => text.includes('EXCLUIR MOVIMENTO') || text.includes('EXLCUIR MOVIMENTO');
    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible)
      .filter((dialog) => {
        const text = normText(dialog.innerText || '');
        return validTitle(text)
          && text.includes('CAIXA OPERACIONAL')
          && text.includes('DESEJA REALMENTE EXCLUIR O REGISTRO NO VALOR DE')
          && text.includes(expectedValue);
      });
    if (dialogs.length !== 1) return { ok: false, reason: 'DELETE_MODAL_NOT_UNIQUE', count: dialogs.length };
    const buttons = [...dialogs[0].querySelectorAll('button,[role="button"]')].filter(visible);
    const confirm = buttons.filter((button) => normText(button.innerText || button.textContent) === 'CONFIRMAR');
    const cancel = buttons.filter((button) => normText(button.innerText || button.textContent) === 'CANCELAR');
    if (confirm.length !== 1 || cancel.length !== 1) {
      return { ok: false, reason: 'CONFIRM_CONTROLS_INVALID', confirm: confirm.length, cancel: cancel.length };
    }
    confirm[0].click();
    return { ok: true };
  }, { expectedValue: expectedValueKey });

  if (!clicked.ok) throw new Error(`Modal de exclusão inseguro: ${JSON.stringify(clicked)}`);
}

async function deleteFirstTarget(page) {
  const prepared = await prepareDeleteTarget(page);
  if (!prepared.ok) {
    if (prepared.reason === 'NO_TARGET') return false;
    throw new Error(`Controle seguro de exclusão não localizado: ${JSON.stringify(prepared)}`);
  }

  const before = (await inspectTargets(page)).length;
  await page.click(prepared.selector);
  await confirmDeleteModal(page, prepared.valueKey);

  await page.waitForFunction(({ descriptionKey, beforeCount }) => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const remaining = [...document.querySelectorAll('tr,[role="row"]')]
      .filter(visible)
      .filter((row) => {
        const key = normText(row.innerText || '');
        return key.includes(descriptionKey) && /(^| )CAFE( |$)/.test(key);
      }).length;
    return remaining < beforeCount;
  }, { timeout: DEFAULT_TIMEOUT }, { descriptionKey: TARGET_DESCRIPTION_KEY, beforeCount: before });

  const after = (await inspectTargets(page)).length;
  if (after >= before) throw new Error(`Exclusão não foi confirmada no GRM (${before} -> ${after}).`);
  log('SUCCESS', 'Despesa retroativa de Café excluída.', {
    before,
    after,
    valor: prepared.valueText,
    estrategia_lixeira: prepared.strategy,
    row: prepared.row,
  });
  return true;
}

async function closeCurrent(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function preflightAll(page, targets, expectedTotal) {
  const summary = { colaboradores: 0, encontrados: 0, erros: 0 };
  for (const target of targets) {
    summary.colaboradores += 1;
    try {
      const found = await openTarget(page, target);
      if (found.length !== target.esperado) {
        throw new Error(`Divergência API/UI: API=${target.esperado}, interface=${found.length}.`);
      }
      summary.encontrados += found.length;
      log('INFO', `${target.colaborador}: precheck OK.`, {
        cpf: target.cpf,
        api: target.esperado,
        interface: found.length,
        ofm_codes: target.movimentos.map((m) => m.ofmCode),
      });
    } catch (error) {
      summary.erros += 1;
      log('ERROR', `${target.colaborador} / ${target.cpf}: ${error.message}`);
    } finally {
      await closeCurrent(page).catch(() => {});
    }
  }
  if (summary.erros > 0 || summary.encontrados !== expectedTotal) {
    throw new Error(`PRECHECK reprovado: ${JSON.stringify({ ...summary, esperado_api: expectedTotal })}`);
  }
  return summary;
}

async function deleteAll(page, targets, expectedTotal) {
  const summary = { colaboradores: 0, encontrados: 0, excluidos: 0, erros: 0 };
  for (const target of targets) {
    summary.colaboradores += 1;
    try {
      const found = await openTarget(page, target);
      if (found.length !== target.esperado) {
        throw new Error(`Divergência antes da exclusão: API inicial=${target.esperado}, interface=${found.length}.`);
      }
      summary.encontrados += found.length;
      let deleted = 0;
      while ((await inspectTargets(page)).length > 0) {
        if (deleted >= MAX_DELETE_PER_STAFF) throw new Error('Limite de exclusões por colaborador excedido.');
        const changed = await deleteFirstTarget(page);
        if (!changed) break;
        deleted += 1;
      }
      const remaining = await inspectTargets(page);
      if (remaining.length !== 0 || deleted !== target.esperado) {
        throw new Error(`Limpeza incompleta: esperado=${target.esperado}, excluído=${deleted}, restante=${remaining.length}.`);
      }
      summary.excluidos += deleted;
      log('SUCCESS', `${target.colaborador}: limpeza concluída.`, { cpf: target.cpf, excluidos: deleted });
    } catch (error) {
      summary.erros += 1;
      log('ERROR', `${target.colaborador} / ${target.cpf}: ${error.message}`);
    } finally {
      await closeCurrent(page).catch(() => {});
    }
  }
  if (summary.erros > 0 || summary.excluidos !== expectedTotal) {
    throw new Error(`EXCLUSÃO incompleta: ${JSON.stringify({ ...summary, esperado_api: expectedTotal })}`);
  }
  return summary;
}

async function main() {
  log('INFO', `Cleanup ${VERSION} iniciado.`, {
    alvo: TARGET_DESCRIPTION,
    de: DATE_FROM,
    ate: DATE_TO,
    dry_run: DRY_RUN,
    only_cpf: ONLY_CPF || null,
  });

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await login(page);

    const apiState = await loadCurrentApiState(page);
    log('INFO', 'Alvos atuais carregados pela API do GRM.', {
      movimentos_relatorio: apiState.reportCount,
      cafe_oex_code: apiState.cafeCode,
      encontrados_exatos: apiState.total,
      colaboradores: apiState.targets.length,
      sem_cadastro_ativo: apiState.unresolved.length,
    });

    if (apiState.unresolved.length) {
      throw new Error(`Há movimentos sem colaborador ativo resolvido: ${JSON.stringify(apiState.unresolved).slice(0, 3000)}`);
    }
    if (apiState.total === 0) {
      log('SUCCESS', 'Nenhum lançamento retroativo de Café permanece no GRM.');
      return;
    }

    const scopeTargets = ONLY_CPF
      ? apiState.targets.filter((target) => target.cpf === ONLY_CPF)
      : apiState.targets;
    const scopeTotal = scopeTargets.reduce((sum, target) => sum + target.esperado, 0);

    if (ONLY_CPF && scopeTargets.length !== 1) {
      throw new Error(`CPF de teste não localizado entre os alvos atuais: ${ONLY_CPF}`);
    }

    log('INFO', 'Escopo da execução definido.', {
      only_cpf: ONLY_CPF || null,
      colaboradores_escopo: scopeTargets.length,
      movimentos_escopo: scopeTotal,
    });

    const preflight = await preflightAll(page, scopeTargets, scopeTotal);
    log('SUCCESS', 'PRECHECK concluído sem divergências.', preflight);

    if (DRY_RUN) {
      log('SUCCESS', 'Cleanup concluído em DRY-RUN.', {
        api_exatos_global: apiState.total,
        api_exatos_escopo: scopeTotal,
        colaboradores: scopeTargets.length,
        encontrados_interface: preflight.encontrados,
        excluidos: 0,
        erros: 0,
      });
      return;
    }

    const deleted = await deleteAll(page, scopeTargets, scopeTotal);
    const after = await loadCurrentApiState(page);
    const afterScope = ONLY_CPF
      ? after.targets.filter((target) => target.cpf === ONLY_CPF).reduce((sum, target) => sum + target.esperado, 0)
      : after.total;

    if (afterScope !== 0) {
      throw new Error(`Verificação final da API encontrou ${afterScope} lançamento(s) restante(s) no escopo.`);
    }

    const expectedGlobalAfter = apiState.total - scopeTotal;
    if (after.total !== expectedGlobalAfter) {
      throw new Error(`Total global após exclusão divergiu: esperado=${expectedGlobalAfter}, API=${after.total}.`);
    }

    log('SUCCESS', 'Cleanup REAL concluído e verificado pela API.', {
      api_inicial_global: apiState.total,
      api_inicial_escopo: scopeTotal,
      only_cpf: ONLY_CPF || null,
      colaboradores: scopeTargets.length,
      excluidos: deleted.excluidos,
      api_restante_escopo: afterScope,
      api_restante_global: after.total,
      erros: 0,
    });
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[FATAL] ${new Date().toISOString()} - ${error.stack || error.message}`);
    process.exit(1);
  });
}

module.exports = {
  norm,
  TARGET_DESCRIPTION,
  TARGET_DESCRIPTION_KEY,
};
