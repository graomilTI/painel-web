#!/usr/bin/env node
'use strict';

/*
 * Diagnóstico SEM exclusão para descobrir a estrutura real do modal
 * de "EXCLUIR MOVIMENTO" no Caixa Operacional do GRM.
 *
 * Fluxo:
 * 1) entra no GRM;
 * 2) abre ADEFRAN PEREIRA DE ARAUJO pelo CPF;
 * 3) abre Caixa Operacional;
 * 4) localiza a linha exata "Lançamento automático retroativo - Café";
 * 5) clica na lixeira dessa própria linha;
 * 6) inspeciona os elementos visíveis que contêm EXCLUIR/CONFIRMAR/CANCELAR;
 * 7) clica em CANCELAR, nunca em CONFIRMAR.
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

const VERSION = 'V1-NO-DELETE-MODAL-PROBE';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const STAFF_URL = process.env.GRM_CLEANUP_CAFE_STAFF_URL || 'https://www.grmserver.com.br/adm/team/staff';
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const TARGET_CPF = process.env.GRM_CAFE_PROBE_CPF || '01549076345';
const TARGET_DESCRIPTION_KEY = 'LANCAMENTO AUTOMATICO RETROATIVO CAFE';
const DEFAULT_TIMEOUT = 45000;

if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRM ausentes.');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
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

async function openStaff(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => /Nome, Email ou CPF/i.test(document.body?.innerText || ''), { timeout: DEFAULT_TIMEOUT });
}

async function searchAndSelect(page, cpf) {
  const searched = await page.evaluate((targetCpf) => {
    const input = [...document.querySelectorAll('input')]
      .find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || ''))
      || [...document.querySelectorAll('input')].find((el) => /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, targetCpf); else input.value = targetCpf;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, cpf);
  if (!searched) throw new Error('Busca de CPF não encontrada.');
  await sleep(1200);

  const selected = await page.evaluate((targetCpf) => {
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const rows = [...document.querySelectorAll('tr')].filter((row) => digits(row.innerText).includes(targetCpf));
    if (rows.length !== 1) return { ok: false, rows: rows.length };
    const row = rows[0];
    const exact = [...row.querySelectorAll('td')].some((td) => digits(td.innerText) === targetCpf);
    if (!exact) return { ok: false, reason: 'CPF_NOT_EXACT' };
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return { ok: false, reason: 'CHECKBOX_NOT_FOUND' };
    if (!checkbox.checked) checkbox.click();
    return { ok: true };
  }, cpf);
  if (!selected.ok) throw new Error(`Funcionário não selecionado: ${JSON.stringify(selected)}`);
}

async function clickCash(page) {
  const selector = await page.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const search = [...document.querySelectorAll('input')]
      .find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || '') || /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!search) return null;
    const sr = search.getBoundingClientRect();
    const y = sr.top + sr.height / 2;
    const buttons = [...document.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right <= sr.left + 15 && Math.abs(rect.top + rect.height / 2 - y) <= 35)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (buttons.length < 5) return null;
    document.querySelectorAll('[data-probe-cash]').forEach((el) => delete el.dataset.probeCash);
    buttons[4].el.dataset.probeCash = '1';
    return '[data-probe-cash="1"]';
  });
  if (!selector) throw new Error('Botão Caixa não localizado.');
  await page.click(selector);
  await page.waitForFunction(() => /CAIXA OPERACIONAL/i.test(document.body?.innerText || ''), { timeout: DEFAULT_TIMEOUT });
  await sleep(700);
}

async function prepareTrash(page) {
  return page.evaluate(({ key }) => {
    const norm = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

    const rows = [...document.querySelectorAll('tr,[role="row"]')]
      .filter(visible)
      .filter((row) => {
        const text = norm(row.innerText);
        return text.includes(key) && /(^| )CAFE( |$)/.test(text);
      });
    if (!rows.length) return { ok: false, reason: 'TARGET_NOT_FOUND' };

    const row = rows[0];
    const cells = [...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')];
    const firstCell = cells[0];
    const buttons = firstCell
      ? [...firstCell.querySelectorAll('button,[role="button"],a')].filter(visible)
      : [];

    document.querySelectorAll('[data-probe-trash]').forEach((el) => delete el.dataset.probeTrash);
    if (buttons.length !== 1) {
      return {
        ok: false,
        reason: 'FIRST_CELL_BUTTON_COUNT',
        count: buttons.length,
        row: String(row.innerText || '').replace(/\s+/g, ' ').trim(),
        firstCellHtml: firstCell?.outerHTML?.slice(0, 3000),
      };
    }

    buttons[0].dataset.probeTrash = '1';
    return {
      ok: true,
      selector: '[data-probe-trash="1"]',
      row: String(row.innerText || '').replace(/\s+/g, ' ').trim(),
      firstCellHtml: firstCell?.outerHTML?.slice(0, 3000),
      buttonHtml: buttons[0].outerHTML?.slice(0, 3000),
    };
  }, { key: TARGET_DESCRIPTION_KEY });
}

async function inspectModal(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const norm = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

    const controls = [...document.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .map((el) => ({
        tag: el.tagName,
        text: clean(el.innerText || el.textContent),
        title: el.getAttribute('title'),
        aria: el.getAttribute('aria-label'),
        cls: typeof el.className === 'string' ? el.className.slice(0, 300) : '',
        html: el.outerHTML?.slice(0, 1000),
      }))
      .filter((x) => /EXCLUIR|CONFIRMAR|CANCELAR/i.test(`${x.text} ${x.title || ''} ${x.aria || ''}`));

    const matching = [...document.querySelectorAll('body *')]
      .filter(visible)
      .map((el) => ({ el, text: clean(el.innerText || el.textContent) }))
      .filter(({ text }) => /EXCLUIR MOVIMENTO|DESEJA REALMENTE EXCLUIR|CONFIRMAR|CANCELAR/i.test(text))
      .sort((a, b) => a.text.length - b.text.length)
      .slice(0, 30)
      .map(({ el, text }) => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        cls: typeof el.className === 'string' ? el.className.slice(0, 300) : '',
        text: text.slice(0, 1200),
        normalized: norm(text).slice(0, 1200),
        html: el.outerHTML?.slice(0, 2000),
      }));

    return {
      controls,
      matching,
      bodyHasTitle: /EXCLUIR MOVIMENTO/i.test(document.body?.innerText || ''),
      bodyHasConfirm: /CONFIRMAR/i.test(document.body?.innerText || ''),
      bodyHasCancel: /CANCELAR/i.test(document.body?.innerText || ''),
    };
  });
}

async function cancelModal(page) {
  const result = await page.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const norm = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const buttons = [...document.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .filter((el) => norm(el.innerText || el.textContent) === 'CANCELAR');
    if (buttons.length !== 1) return { ok: false, count: buttons.length };
    buttons[0].click();
    return { ok: true };
  });
  if (!result.ok) throw new Error(`Botão CANCELAR não localizado de forma única: ${JSON.stringify(result)}`);
  await sleep(500);
}

async function main() {
  log('INFO', `Probe ${VERSION} iniciado.`, { cpf: TARGET_CPF, mutacao: false });
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1440 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
  });

  try {
    const page = await browser.newPage();
    await login(page);
    await openStaff(page);
    await searchAndSelect(page, TARGET_CPF);
    await clickCash(page);

    const trash = await prepareTrash(page);
    log(trash.ok ? 'INFO' : 'ERROR', 'Linha/lixeira inspecionada.', trash);
    if (!trash.ok) throw new Error(`Lixeira não localizada: ${JSON.stringify(trash)}`);

    await page.click(trash.selector);
    await sleep(1200);

    const modal = await inspectModal(page);
    log('INFO', 'MODAL_PROBE', modal);

    if (!modal.bodyHasTitle || !modal.bodyHasConfirm || !modal.bodyHasCancel) {
      throw new Error('Modal esperado não apareceu integralmente após clicar na lixeira.');
    }

    await cancelModal(page);
    log('SUCCESS', 'Probe concluído: modal abriu e foi CANCELADO. Nenhum movimento foi excluído.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[FATAL] ${new Date().toISOString()} - ${error.stack || error.message}`);
  process.exit(1);
});
