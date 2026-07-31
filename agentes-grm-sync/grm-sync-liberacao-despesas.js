#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const STAFF_URL = process.env.GRM_LIBERACAO_DESPESAS_URL || 'https://www.grmserver.com.br/adm/team/staff';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const DRY_RUN = String(process.env.GRM_LIBERACAO_DESPESAS_DRY_RUN ?? 'true').toLowerCase() !== 'false';
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';
const DEBUG = String(process.env.GRM_LIBERACAO_DESPESAS_DEBUG ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_LIBERACAO_DESPESAS_MAX_POR_EXECUCAO || 5));
const SCREENSHOT_DIR = process.env.GRM_LIBERACAO_DESPESAS_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/liberacao-despesas';
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_LIBERACAO_DESPESAS_TIMEOUT_MS || 45000));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${safeJson(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function canonicalRules(rules) {
  const unique = new Map();
  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = {
      tipo_despesa: String(raw.tipo_despesa || '').trim(),
      exibir: raw.exibir !== false,
      valor_maximo: Number(raw.valor_maximo || 0),
      auto: raw.auto === true,
      carga_nhe: raw.carga_nhe !== false,
      max_mov_dia: Math.max(0, Number(raw.max_mov_dia ?? 1) || 0),
    };
    if (rule.tipo_despesa) unique.set(norm(rule.tipo_despesa), rule);
  }
  return [...unique.values()].sort((a, b) => a.tipo_despesa.localeCompare(b.tipo_despesa, 'pt-BR'));
}

function rulesEqual(a, b) {
  return JSON.stringify(canonicalRules(a)) === JSON.stringify(canonicalRules(b));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function screenshotPath(job, label) {
  ensureDir(SCREENSHOT_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(SCREENSHOT_DIR, `${stamp}_${digits(job.cpf)}_${label}.png`);
}

async function takeScreenshot(page, job, label) {
  const file = screenshotPath(job, label);
  try {
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch (error) {
    log('WARN', `Falha ao salvar screenshot ${file}: ${error.message}`);
    return null;
  }
}

async function launchBrowser() {
  const launchOptions = {
    headless: HEADLESS,
    dumpio: DEBUG,
    defaultViewport: { width: 1920, height: 1440 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return puppeteer.launch(launchOptions);
}

async function login(page) {
  log('INFO', 'Abrindo login do GRM.');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  const userSelector = 'input#input-v-2';
  const passwordSelector = 'input#input-v-5';
  await page.waitForSelector(userSelector, { timeout: DEFAULT_TIMEOUT });
  await page.waitForSelector(passwordSelector, { timeout: DEFAULT_TIMEOUT });
  await page.click(userSelector, { clickCount: 3 });
  await page.type(userSelector, GRM_USER, { delay: 15 });
  await page.click(passwordSelector, { clickCount: 3 });
  await page.type(passwordSelector, GRM_PASSWORD, { delay: 15 });

  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button.submit-btn'),
  ]);
  await sleep(1500);
  log('SUCCESS', 'Login concluído.');
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION[ÁA]RIOS/i.test(text) || /Nome, Email ou CPF/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
}

async function setSearchCpf(page, cpf) {
  const found = await page.evaluate((cpfValue) => {
    const normalize = (value) => String(value || '').replace(/\D/g, '');
    const inputs = [...document.querySelectorAll('input')];
    const input = inputs.find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || ''))
      || inputs.find((el) => /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, normalize(cpfValue));
    else input.value = normalize(cpfValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  }, cpf);
  if (!found) throw new Error('Campo de busca Nome, Email ou CPF não localizado.');
  await sleep(1200);
}

async function selectExactStaffRow(page, cpf) {
  const cpfDigits = digits(cpf);
  await page.waitForFunction((targetCpf) => {
    const normalize = (value) => String(value || '').replace(/\D/g, '');
    return [...document.querySelectorAll('tr')].some((row) => normalize(row.innerText).includes(targetCpf));
  }, { timeout: DEFAULT_TIMEOUT }, cpfDigits);

  const result = await page.evaluate((targetCpf) => {
    const normalize = (value) => String(value || '').replace(/\D/g, '');
    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => normalize(row.innerText).includes(targetCpf));
    if (rows.length !== 1) return { ok: false, matches: rows.length };
    const row = rows[0];
    const cpfCells = [...row.querySelectorAll('td')].filter((cell) => normalize(cell.innerText) === targetCpf);
    if (!cpfCells.length) return { ok: false, matches: rows.length, reason: 'CPF não apareceu de forma exata na linha.' };
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return { ok: false, matches: rows.length, reason: 'Checkbox da linha não encontrado.' };
    if (!checkbox.checked) checkbox.click();
    return { ok: true, text: row.innerText };
  }, cpfDigits);
  if (!result.ok) throw new Error(`Funcionário não localizado de forma única pelo CPF (${safeJson(result)}).`);
  await sleep(300);
  return result;
}

async function clickEdit(page) {
  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const buttons = [...document.querySelectorAll('button, [role="button"]')]
      .filter((el) => el.getClientRects().length > 0);
    const exact = buttons.find((el) => {
      const label = normalize([
        el.getAttribute('title'), el.getAttribute('aria-label'), el.textContent,
      ].filter(Boolean).join(' '));
      return label === 'EDITAR' || label.includes('EDITAR FUNCIONARIO');
    });
    if (!exact) return false;
    exact.click();
    return true;
  });
  if (!clicked) throw new Error('Botão Editar não localizado após selecionar o funcionário.');

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /EDITAR FUNCION[ÁA]RIO/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(500);
}

async function closeModal(page) {
  await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const modalText = [...document.querySelectorAll('*')].find((el) => normalize(el.textContent) === 'EDITAR FUNCIONARIO');
    const modal = modalText?.closest('[role="dialog"], .modal, .v-dialog, [class*="modal"], [class*="dialog"]')
      || modalText?.parentElement?.parentElement?.parentElement;
    if (!modal) return;
    const buttons = [...modal.querySelectorAll('button, [role="button"]')];
    const cancel = buttons.find((el) => normalize(el.textContent) === 'CANCELAR');
    if (cancel) cancel.click();
    else {
      const close = buttons.find((el) => ['FECHAR', 'CLOSE', '×', 'X'].includes(normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent)));
      close?.click();
    }
  });
  await sleep(300);
}

async function openCashRulesSection(page) {
  const found = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const labels = [...document.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    const label = labels.find((el) => el.getClientRects().length > 0);
    if (!label) return false;
    label.scrollIntoView({ block: 'center' });
    const clickable = label.closest('button, [role="button"]') || label.parentElement;
    if (clickable) clickable.click();
    return true;
  });
  if (!found) throw new Error('Seção Regras de Caixa Operacional não localizada.');

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /TIPO DE DESPESA/i.test(text)
      || /ESTE USU[ÁA]RIO AINDA N[ÃA]O POSSUI REGRAS DE CAIXA OPERACIONAL/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(400);
}

async function getCashSectionDiagnostic(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) return null;
    let section = label.parentElement;
    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      const hasTarget = text.includes('REGRAS DE CAIXA OPERACIONAL');
      const hasContent = text.includes('TIPO DE DESPESA') || text.includes('AINDA NAO POSSUI REGRAS');
      if (hasTarget && hasContent && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
      section = section.parentElement;
    }
    if (!section) return null;
    return {
      text: section.innerText.slice(0, 6000),
      inputs: section.querySelectorAll('input').length,
      selects: section.querySelectorAll('select').length,
      buttons: [...section.querySelectorAll('button')].map((button) => ({
        text: button.innerText,
        title: button.getAttribute('title'),
        aria: button.getAttribute('aria-label'),
      })).slice(0, 40),
      html: section.outerHTML.slice(0, 12000),
    };
  });
}

async function readCashRules(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const parseNumber = (value) => {
      const raw = String(value ?? '').trim();
      if (!raw) return 0;
      const cleaned = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
      const number = Number(cleaned.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(number) ? number : 0;
    };
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) throw new Error('Seção de regras não encontrada.');
    let section = label.parentElement;
    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      if (text.includes('TIPO DE DESPESA') && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
      section = section.parentElement;
    }
    if (!section || normalize(section.innerText).includes('AINDA NAO POSSUI REGRAS')) return [];

    const candidates = [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) => row.querySelector('input, select, [role="combobox"]'));
    const rules = [];
    for (const row of candidates) {
      const fields = [...row.querySelectorAll('input, select, [role="combobox"]')]
        .filter((field) => field.getClientRects().length > 0);
      if (!fields.length) continue;
      const typeField = fields.find((field) => field.tagName === 'SELECT' || field.getAttribute('role') === 'combobox')
        || fields.find((field) => field.type === 'text');
      let type = '';
      if (typeField?.tagName === 'SELECT') type = typeField.selectedOptions?.[0]?.textContent || typeField.value || '';
      else type = typeField?.value || typeField?.textContent || '';
      type = String(type).trim();
      if (!type || normalize(type).includes('TIPO DE DESPESA')) continue;

      const checkboxes = fields.filter((field) => field.type === 'checkbox');
      const numbers = fields.filter((field) => field !== typeField && field.type !== 'checkbox');
      const money = numbers.find((field) => /valor|maximo|money|currency/i.test(`${field.name} ${field.id} ${field.placeholder}`)) || numbers[0];
      const maxMov = numbers.find((field) => /mov|dia/i.test(`${field.name} ${field.id} ${field.placeholder}`)) || numbers[numbers.length - 1];
      rules.push({
        tipo_despesa: type,
        exibir: checkboxes[0] ? checkboxes[0].checked : true,
        valor_maximo: parseNumber(money?.value),
        auto: checkboxes[1] ? checkboxes[1].checked : false,
        carga_nhe: checkboxes[2] ? checkboxes[2].checked : true,
        max_mov_dia: Math.max(0, Math.trunc(parseNumber(maxMov?.value) || 0)),
      });
    }
    return rules;
  });
}

async function getCashRowsCount(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) return -1;
    let section = label.parentElement;
    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      if (text.includes('TIPO DE DESPESA') && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
      section = section.parentElement;
    }
    if (!section || normalize(section.innerText).includes('AINDA NAO POSSUI REGRAS')) return 0;
    return [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) => row.querySelector('input, select, [role="combobox"]')).length;
  });
}

async function deleteAllCashRules(page) {
  let guard = 0;
  while (guard++ < 100) {
    const count = await getCashRowsCount(page);
    if (count <= 0) return;

    const clicked = await page.evaluate(() => {
      const normalize = (value) => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      const label = [...document.querySelectorAll('*')]
        .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
      if (!label) return false;
      let section = label.parentElement;
      while (section && section.parentElement) {
        const text = normalize(section.innerText);
        if (text.includes('TIPO DE DESPESA') && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
        section = section.parentElement;
      }
      if (!section) return false;
      const rows = [...section.querySelectorAll('tr, [role="row"]')]
        .filter((row) => row.querySelector('input, select, [role="combobox"]'));
      const row = rows[rows.length - 1];
      if (!row) return false;
      const buttons = [...row.querySelectorAll('button, [role="button"]')].filter((button) => button.getClientRects().length > 0);
      const remove = buttons.find((button) => {
        const labelText = normalize([
          button.getAttribute('title'), button.getAttribute('aria-label'), button.textContent,
          button.className,
        ].filter(Boolean).join(' '));
        return /EXCLUIR|REMOVER|DELETE|TRASH|LIXEIRA/.test(labelText);
      });
      if (!remove) return false;
      remove.click();
      return true;
    });
    if (!clicked) throw new Error('Botão seguro de exclusão da regra não foi localizado; nenhuma ação aleatória foi executada.');
    await sleep(250);
  }
  throw new Error('Limite de segurança excedido ao remover regras de Caixa Operacional.');
}

async function addCashRuleRow(page) {
  const before = await getCashRowsCount(page);
  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9+]+/g, ' ').trim();
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) return false;
    let section = label.parentElement;
    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      const buttons = [...section.querySelectorAll('button, [role="button"]')];
      if (text.includes('REGRAS DE CAIXA OPERACIONAL') && buttons.length && section.getBoundingClientRect().height < window.innerHeight * 0.9) {
        const add = buttons.find((button) => {
          const key = normalize([button.textContent, button.getAttribute('title'), button.getAttribute('aria-label')].filter(Boolean).join(' '));
          return key === '+' || key.includes('ADICIONAR') || key.includes('NOVA REGRA');
        });
        if (add) { add.click(); return true; }
      }
      section = section.parentElement;
    }
    return false;
  });
  if (!clicked) throw new Error('Botão + de Regras de Caixa Operacional não localizado.');
  await page.waitForFunction((oldCount) => {
    const text = document.body?.innerText || '';
    if (!/TIPO DE DESPESA/i.test(text)) return false;
    const rows = [...document.querySelectorAll('tr, [role="row"]')]
      .filter((row) => row.querySelector('input, select, [role="combobox"]'));
    return rows.length > oldCount;
  }, { timeout: DEFAULT_TIMEOUT }, Math.max(0, before));
  await sleep(250);
}

async function chooseRuleType(page, rowIndex, typeText) {
  const descriptor = await page.evaluate((index) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) return null;
    let section = label.parentElement;
    while (section && section.parentElement) {
      if (normalize(section.innerText).includes('TIPO DE DESPESA') && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
      section = section.parentElement;
    }
    const rows = [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) => row.querySelector('input, select, [role="combobox"]'));
    const row = rows[index];
    if (!row) return null;
    const native = row.querySelector('select');
    if (native) {
      native.dataset.grmAgentTarget = `type-${index}`;
      return { kind: 'select', selector: `[data-grm-agent-target="type-${index}"]` };
    }
    const combo = row.querySelector('[role="combobox"], input[type="text"]');
    if (!combo) return null;
    combo.dataset.grmAgentTarget = `type-${index}`;
    return { kind: 'custom', selector: `[data-grm-agent-target="type-${index}"]` };
  }, rowIndex);
  if (!descriptor) throw new Error(`Campo Tipo de Despesa não localizado na linha ${rowIndex + 1}.`);

  if (descriptor.kind === 'select') {
    const options = await page.$eval(descriptor.selector, (select) => [...select.options].map((option) => ({ value: option.value, text: option.textContent })));
    const match = options.find((option) => norm(option.text) === norm(typeText));
    if (!match) throw new Error(`Tipo de despesa "${typeText}" não existe no seletor do GRM.`);
    await page.select(descriptor.selector, match.value);
    return;
  }

  await page.click(descriptor.selector);
  await sleep(200);
  const input = await page.$(descriptor.selector);
  await input?.press('Control+A');
  await input?.type(typeText, { delay: 20 });
  await sleep(350);
  const selected = await page.evaluate((expected) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const options = [...document.querySelectorAll('[role="option"], li, .v-list-item, [class*="option"]')]
      .filter((el) => el.getClientRects().length > 0);
    const exact = options.find((el) => normalize(el.textContent) === normalize(expected));
    if (!exact) return false;
    exact.click();
    return true;
  }, typeText);
  if (!selected) throw new Error(`Opção exata "${typeText}" não apareceu no dropdown do GRM.`);
}

async function fillCashRuleRow(page, rowIndex, rule) {
  await chooseRuleType(page, rowIndex, rule.tipo_despesa);
  const result = await page.evaluate((index, desired) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const setInput = (input, value) => {
      const prototype = input instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(input, String(value));
      else input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setCheckbox = (input, value) => {
      if (input.checked !== !!value) input.click();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0 && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');
    if (!label) return { ok: false, reason: 'section' };
    let section = label.parentElement;
    while (section && section.parentElement) {
      if (normalize(section.innerText).includes('TIPO DE DESPESA') && section.getBoundingClientRect().height < window.innerHeight * 0.9) break;
      section = section.parentElement;
    }
    const rows = [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) => row.querySelector('input, select, [role="combobox"]'));
    const row = rows[index];
    if (!row) return { ok: false, reason: 'row' };
    const fields = [...row.querySelectorAll('input, select, [role="combobox"]')]
      .filter((field) => field.getClientRects().length > 0);
    const typeField = fields.find((field) => field.tagName === 'SELECT' || field.getAttribute('role') === 'combobox')
      || fields.find((field) => field.type === 'text');
    const checkboxes = fields.filter((field) => field.type === 'checkbox');
    const writable = fields.filter((field) => field !== typeField && field.type !== 'checkbox' && !field.disabled);
    const money = writable.find((field) => /valor|maximo|money|currency/i.test(`${field.name} ${field.id} ${field.placeholder}`)) || writable[0];
    const maxMov = writable.find((field) => /mov|dia/i.test(`${field.name} ${field.id} ${field.placeholder}`)) || writable[writable.length - 1];
    if (!money || !maxMov) return { ok: false, reason: 'numeric-fields', fields: writable.length };
    setInput(money, Number(desired.valor_maximo || 0).toFixed(2).replace('.', ','));
    setInput(maxMov, Math.max(0, Number(desired.max_mov_dia || 0)));
    if (checkboxes[0]) setCheckbox(checkboxes[0], desired.exibir !== false);
    if (checkboxes[1]) setCheckbox(checkboxes[1], desired.auto === true);
    if (checkboxes[2]) setCheckbox(checkboxes[2], desired.carga_nhe !== false);
    return { ok: true };
  }, rowIndex, rule);
  if (!result.ok) throw new Error(`Não foi possível preencher a regra ${rule.tipo_despesa}: ${safeJson(result)}`);
  await sleep(150);
}

async function saveEmployee(page) {
  const clicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const buttons = [...document.querySelectorAll('button, [role="button"]')]
      .filter((el) => el.getClientRects().length > 0);
    const save = buttons.find((el) => normalize(el.textContent) === 'SALVAR');
    if (!save) return false;
    save.click();
    return true;
  });
  if (!clicked) throw new Error('Botão SALVAR do funcionário não localizado.');
  await page.waitForFunction(() => !/EDITAR FUNCION[ÁA]RIO/i.test(document.body?.innerText || ''), { timeout: 60000 });
  await sleep(800);
}

async function inspectEmployee(page, job) {
  await openStaffPage(page);
  await setSearchCpf(page, job.cpf);
  const selected = await selectExactStaffRow(page, job.cpf);
  await clickEdit(page);
  await openCashRulesSection(page);
  const currentRules = canonicalRules(await readCashRules(page));
  const diagnostic = await getCashSectionDiagnostic(page);
  return { selected, currentRules, diagnostic };
}

async function applyEmployeeRules(page, job) {
  const desired = canonicalRules(job.regras);
  const inspection = await inspectEmployee(page, job);
  log('INFO', `CPF ${job.cpf}: regras atuais=${inspection.currentRules.length}, desejadas=${desired.length}, ação=${job.acao}.`);

  if (rulesEqual(inspection.currentRules, desired)) {
    await closeModal(page);
    return { changed: false, currentRules: inspection.currentRules, verifiedRules: inspection.currentRules };
  }

  await deleteAllCashRules(page);
  for (let i = 0; i < desired.length; i += 1) {
    await addCashRuleRow(page);
    await fillCashRuleRow(page, i, desired[i]);
  }
  await saveEmployee(page);

  // Verificação real: reabre pelo CPF e lê novamente o que o GRM gravou.
  const verification = await inspectEmployee(page, job);
  await closeModal(page);
  if (!rulesEqual(verification.currentRules, desired)) {
    const error = new Error('GRM ficou divergente depois de salvar as Regras de Caixa Operacional.');
    error.code = 'DIVERGENTE';
    error.currentRules = inspection.currentRules;
    error.verifiedRules = verification.currentRules;
    throw error;
  }

  return { changed: true, currentRules: inspection.currentRules, verifiedRules: verification.currentRules };
}

async function getLatestState(cpf) {
  const { data, error } = await supabase
    .from('grm_despesas_estado_colaborador')
    .select('*')
    .eq('cpf', digits(cpf))
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function claimNext() {
  const { data, error } = await supabase.rpc('claim_next_grm_despesa_fila');
  if (error) throw error;
  return data && data.id ? data : null;
}

async function listDryRunJobs() {
  const { data, error } = await supabase
    .from('grm_despesas_fila')
    .select('*')
    .in('status', ['PENDENTE', 'ERRO'])
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;
  return data || [];
}

async function updateQueue(id, patch) {
  const { error } = await supabase.from('grm_despesas_fila').update(patch).eq('id', id);
  if (error) throw error;
}

async function updateStateIfCurrent(job, patch) {
  const { error } = await supabase
    .from('grm_despesas_estado_colaborador')
    .update(patch)
    .eq('cpf', digits(job.cpf))
    .eq('hash_desejado', job.hash_desejado)
    .eq('versao_desejada_id', job.versao_id);
  if (error) throw error;
}

async function markSuperseded(job, state) {
  await updateQueue(job.id, {
    status: 'IGNORADO_VERSAO_SUPERADA',
    locked_at: null,
    finalizado_em: new Date().toISOString(),
    diagnostico: {
      motivo: 'Versão ou hash mais novo encontrado antes de acessar o GRM.',
      versao_job: job.versao_id,
      versao_atual: state?.versao_desejada_id || null,
      hash_job: job.hash_desejado,
      hash_atual: state?.hash_desejado || null,
    },
  });
}

async function markSuccess(job, result, screenshot) {
  const finalStatus = canonicalRules(job.regras).length ? 'APLICADO' : 'LIMPO';
  const now = new Date().toISOString();
  await updateQueue(job.id, {
    status: finalStatus,
    locked_at: null,
    finalizado_em: now,
    ultimo_erro: null,
    screenshot_path: screenshot || null,
    diagnostico: {
      changed: result.changed,
      regras_antes: result.currentRules,
      regras_confirmadas: result.verifiedRules,
    },
  });
  await updateStateIfCurrent(job, {
    hash_aplicado: job.hash_desejado,
    status_aplicacao: finalStatus,
    aplicado_em: now,
  });
}

async function markFailure(job, error, screenshot) {
  const attempts = Number(job.tentativas || 0);
  const maxAttempts = Number(job.max_tentativas || 3);
  const exhausted = attempts >= maxAttempts;
  const status = exhausted && error.code === 'DIVERGENTE' ? 'DIVERGENTE' : 'ERRO';
  await updateQueue(job.id, {
    status,
    locked_at: null,
    finalizado_em: exhausted ? new Date().toISOString() : null,
    ultimo_erro: error.message,
    screenshot_path: screenshot || null,
    diagnostico: {
      code: error.code || null,
      stack: String(error.stack || '').slice(0, 8000),
      regras_antes: error.currentRules || null,
      regras_confirmadas: error.verifiedRules || null,
    },
  });
  await updateStateIfCurrent(job, { status_aplicacao: status });
}

async function recordDryRun(job, inspection, screenshot) {
  await updateQueue(job.id, {
    diagnostico: {
      dry_run: true,
      validado_em: new Date().toISOString(),
      regras_atuais: inspection.currentRules,
      regras_desejadas: canonicalRules(job.regras),
      iguais: rulesEqual(inspection.currentRules, job.regras),
      secao: DEBUG ? inspection.diagnostic : undefined,
    },
    screenshot_path: screenshot || null,
  });
}

async function enqueueFollowupIfNeeded() {
  if (DRY_RUN) return;
  const { data: remainingRows, error: remainingError } = await supabase
    .from('grm_despesas_fila')
    .select('id,status,tentativas,max_tentativas')
    .in('status', ['PENDENTE', 'ERRO'])
    .limit(200);
  if (remainingError) {
    log('WARN', `Não foi possível conferir fila restante: ${remainingError.message}`);
    return;
  }
  const hasRemaining = (remainingRows || []).some((row) =>
    row.status === 'PENDENTE' || (row.status === 'ERRO' && Number(row.tentativas || 0) < Number(row.max_tentativas || 3))
  );
  if (!hasRemaining) return;

  // O job atual ainda está RODANDO enquanto este script executa. Conferimos
  // somente outro PENDENTE para poder deixar o próximo ciclo já enfileirado.
  const { data: pendingJob, error: pendingError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-liberacao-despesas')
    .eq('status', 'pendente')
    .limit(1);
  if (pendingError) return;
  if (!pendingJob?.length) {
    const { error } = await supabase.from('grm_sync_jobs').insert({
      agente_id: 'sync-liberacao-despesas',
      status: 'pendente',
    });
    if (error) log('WARN', `Falha ao enfileirar continuação: ${error.message}`);
  }
}

async function processDryRun(page) {
  const jobs = await listDryRunJobs();
  if (!jobs.length) {
    log('INFO', 'DRY_RUN: nenhuma alteração pendente para validar.');
    return { processed: 0, errors: 0 };
  }
  let errors = 0;
  for (const job of jobs) {
    let screenshot = null;
    try {
      const state = await getLatestState(job.cpf);
      if (!state || state.hash_desejado !== job.hash_desejado || state.versao_desejada_id !== job.versao_id) {
        log('INFO', `DRY_RUN: job ${job.id} está superado; será ignorado apenas em execução real.`);
        continue;
      }
      const inspection = await inspectEmployee(page, job);
      screenshot = DEBUG ? await takeScreenshot(page, job, 'dry-run') : null;
      await closeModal(page);
      await recordDryRun(job, inspection, screenshot);
      log('SUCCESS', `DRY_RUN CPF ${job.cpf}: leitura concluída; nenhuma alteração feita.`, {
        atuais: inspection.currentRules,
        desejadas: canonicalRules(job.regras),
      });
    } catch (error) {
      errors += 1;
      screenshot = await takeScreenshot(page, job, 'dry-run-erro');
      await updateQueue(job.id, {
        diagnostico: { dry_run: true, erro: error.message, stack: String(error.stack || '').slice(0, 8000) },
        screenshot_path: screenshot,
      });
      log('ERROR', `DRY_RUN CPF ${job.cpf}: ${error.message}`);
      try { await closeModal(page); } catch (_) {}
    }
  }
  return { processed: jobs.length, errors };
}

async function processReal(page) {
  let processed = 0;
  let errors = 0;
  for (let i = 0; i < MAX_PER_RUN; i += 1) {
    const job = await claimNext();
    if (!job) break;
    processed += 1;
    let screenshot = null;
    try {
      const state = await getLatestState(job.cpf);
      if (!state || state.hash_desejado !== job.hash_desejado || state.versao_desejada_id !== job.versao_id) {
        await markSuperseded(job, state);
        log('INFO', `Job ${job.id} ignorado: versão superada.`);
        continue;
      }

      const result = await applyEmployeeRules(page, job);
      screenshot = DEBUG ? await takeScreenshot(page, job, 'aplicado') : null;
      await markSuccess(job, result, screenshot);
      log('SUCCESS', `CPF ${job.cpf}: ${canonicalRules(job.regras).length ? 'regras aplicadas' : 'regras limpas'} e verificadas.`);
    } catch (error) {
      errors += 1;
      screenshot = await takeScreenshot(page, job, 'erro');
      await markFailure(job, error, screenshot);
      log('ERROR', `CPF ${job.cpf}: ${error.message}`);
      try { await closeModal(page); } catch (_) {}
    }
  }
  await enqueueFollowupIfNeeded();
  return { processed, errors };
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  log('INFO', `Iniciando agente de liberação de despesas (dry_run=${DRY_RUN}, max=${MAX_PER_RUN}).`);
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(60000);
    page.on('console', (message) => {
      if (DEBUG) log('BROWSER', message.text());
    });
    page.on('pageerror', (error) => {
      if (DEBUG) log('BROWSER_ERROR', error.message);
    });

    await login(page);
    const result = DRY_RUN ? await processDryRun(page) : await processReal(page);
    log(result.errors ? 'ERROR' : 'SUCCESS', 'Agente concluído.', result);

    // Em modo real, qualquer falha técnica precisa chegar ao worker como erro.
    // Isso evita o falso "sucesso" quando todas as alterações individuais
    // falharam. Em DRY_RUN, o job é apenas diagnóstico e não muda a fila.
    if (!DRY_RUN && result.errors > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  log('ERROR', `Erro fatal: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
