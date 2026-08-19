#!/usr/bin/env node
'use strict';

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

const VERSION = 'V1-API-AUDIT';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const DATE_FROM = process.env.GRM_CAFE_DIAG_DATA_DE || '2026-08-11';
const DATE_TO = process.env.GRM_CAFE_DIAG_DATA_ATE || '2026-08-17';
const TARGET = 'LANCAMENTO AUTOMATICO RETROATIVO CAFE';
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';

if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRM ausentes.');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
function isoToBr(iso) { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; }
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 45000 });
  await page.waitForSelector('input#input-v-5', { timeout: 45000 });
  await page.type('input#input-v-2', GRM_USER, { delay: 10 });
  await page.type('input#input-v-5', GRM_PASSWORD, { delay: 10 });
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button.submit-btn'),
  ]);
  await sleep(700);
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
      throw new Error(`${response.status}: ${text.slice(0, 800)}`);
    }
    return json;
  }, { apiPath: path, payload: body });
}

async function main() {
  log('INFO', `Diagnóstico ${VERSION} iniciado.`, { de: DATE_FROM, ate: DATE_TO });
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
  });

  try {
    const page = await browser.newPage();
    await login(page);

    const [report, types, staff] = await Promise.all([
      api(page, '/api/reports/finance/operatingFlow', {
        ofmDateFrom: isoToBr(DATE_FROM),
        ofmDateTo: isoToBr(DATE_TO),
        ofmStatusReport: ['P', 'A', 'N'],
        reportType: 'flowList',
      }),
      api(page, '/api/oFlowExpenseType/getRecords', { oexStatus: 'A' }),
      api(page, '/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }),
    ]);

    const cafe = (types.searchData || []).find((row) => norm(row.oexName) === 'CAFE');
    if (!cafe) throw new Error('Categoria Café não localizada no GRM.');

    const staffByCode = new Map((staff.searchData || []).map((row) => [Number(row.staCode), row]));
    const all = report.searchData || [];
    const exact = all.filter((row) => {
      const description = norm(row.ofmDescription || row.description || row.descricao || '');
      const cafeByCode = Number(row.oexCode) === Number(cafe.oexCode);
      const cafeByName = norm(row.oexName || row.expenseType || '') === 'CAFE';
      return description === TARGET && (cafeByCode || cafeByName);
    });

    const byStaff = new Map();
    for (const row of exact) {
      const staCode = Number(row.staCode || 0);
      const person = staffByCode.get(staCode) || {};
      const key = String(staCode || row.staName || row.funcionario || 'SEM_STAFF');
      const item = byStaff.get(key) || {
        staCode: staCode || null,
        nome: person.staName || row.staName || row.funcionario || null,
        cpf: person.staCPF || null,
        qtd: 0,
        movimentos: [],
      };
      item.qtd += 1;
      item.movimentos.push({
        ofmCode: row.ofmCode ?? null,
        data: row.ofmDate || row.data || null,
        status: row.ofmStatus || null,
        valor: row.ofmValue ?? row.valor ?? null,
        descricao: row.ofmDescription || row.description || row.descricao || null,
      });
      byStaff.set(key, item);
    }

    const pessoas = [...byStaff.values()].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    for (const item of pessoas) {
      log('INFO', 'ALVO_API', item);
    }

    log('SUCCESS', 'Diagnóstico API concluído.', {
      movimentos_relatorio: all.length,
      cafe_oex_code: cafe.oexCode,
      encontrados_exatos: exact.length,
      colaboradores: pessoas.length,
      de: DATE_FROM,
      ate: DATE_TO,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
