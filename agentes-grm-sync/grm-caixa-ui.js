'use strict';

// Automação de tela do Caixa do GRM compartilhada pelos agentes grm-sync-*-caixa.js
// (bônus, desconto de bônus, ajuda de custo, gorjeta Uber, frotas fora do horário).
// Até 14/10/2026 cada agente tinha a sua cópia destas funções — idênticas, mas uma
// correção de tela precisava ser feita 5 vezes. Os corpos foram movidos sem alteração
// (inclusive os marcadores data-grm-bonus-*, que todos já usavam).
//
// Cada agente roda em processo próprio, então a configuração por agente (pasta de
// screenshots, debug, timeout) fica no estado deste módulo via configurar().

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const STAFF_URL = process.env.GRM_BONUS_CAIXA_STAFF_URL || 'https://www.grmserver.com.br/adm/team/staff';
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';

let SCREENSHOT_DIR = null;
let DEBUG = false;
let DEFAULT_TIMEOUT = 45000;

/**
 * @param {{ screenshotDir: string, debug?: boolean, defaultTimeout?: number }} opcoes
 */
function configurar({ screenshotDir, debug = false, defaultTimeout = 45000 }) {
  if (!screenshotDir) throw new Error('grm-caixa-ui: informe screenshotDir.');
  SCREENSHOT_DIR = screenshotDir;
  DEBUG = Boolean(debug);
  DEFAULT_TIMEOUT = defaultTimeout;
}

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
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

function nameKey(value) {
  return norm(value).replace(/\s+/g, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function setSearchCpf(page, cpf) {
  const ok = await page.evaluate((cpfValue) => {
    const inputs = [...document.querySelectorAll('input')];
    const input = inputs.find((el) => /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || ''))
      || inputs.find((el) => /cpf/i.test(el.getAttribute('placeholder') || ''));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    const value = String(cpfValue || '').replace(/\D/g, '');
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  }, cpf);
  if (!ok) throw new Error('Campo de busca Nome, Email ou CPF não localizado.');
  await sleep(1200);
}

async function clickStaffSearch(page) {
  const searchButton = await page.$('.staff-act-search button') || await page.$('.staff-act-search');
  if (!searchButton) {
    throw new Error('Botão Pesquisar não localizado na tela de Funcionários do GRM.');
  }
  await page.evaluate((btn) => btn.click(), searchButton);
  await sleep(1200);
}

async function waitStaffCpfRow(page, cpf, timeout = 5000) {
  const target = digits(cpf);
  try {
    await page.waitForFunction((targetCpf) => [...document.querySelectorAll('tr')]
      .some((row) => String(row.innerText || '').replace(/\D/g, '').includes(targetCpf)),
    { timeout }, target);
    return true;
  } catch {
    return false;
  }
}

// Localiza e altera o combobox "Situação" (Vuetify) da tela de Funcionários
// do GRM. Colaboradores inativos/desligados só aparecem com Situação =
// "Não Ativos" — sem isso, a busca por CPF nunca encontra a linha e trava
// até estourar o timeout ("Waiting failed: 45000ms exceeded").
async function setStaffSituation(page, targetSituation) {
  const target = String(targetSituation || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  const targetPrefix = target.startsWith('INATIV') ? 'INATIV' : target;

  const filterButton = await page.$('.staff-act-filter button') || await page.$('.staff-act-filter');
  if (!filterButton) throw new Error('Botão Filtros não localizado na tela de Funcionários do GRM.');
  await page.evaluate((btn) => btn.click(), filterButton);
  await sleep(650);

  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    document.querySelectorAll('[data-grm-bonus-situation-combo]').forEach((el) => delete el.dataset.grmBonusSituationCombo);
    document.querySelectorAll('[data-grm-bonus-situation-root]').forEach((el) => delete el.dataset.grmBonusSituationRoot);
    const roots = [...document.querySelectorAll('.v-input,.v-select,.v-autocomplete,.v-field,[class*="field"]')].filter(visible).filter((el) => normalize(el.textContent).includes('SITUACAO'));
    let chosenRoot = null;
    let combo = null;
    for (const root of roots) {
      const candidate = [...root.querySelectorAll('input[role="combobox"],input')].find(visible);
      if (candidate) { chosenRoot = root; combo = candidate; break; }
    }
    if (!combo) return { ok: false, reason: 'SITUATION_COMBOBOX_NOT_FOUND' };
    combo.dataset.grmBonusSituationCombo = '1';
    if (chosenRoot) chosenRoot.dataset.grmBonusSituationRoot = '1';
    return { ok: true, value: combo.value || '', ariaExpanded: combo.getAttribute('aria-expanded'), ariaControls: combo.getAttribute('aria-controls'), rootText: normalize(chosenRoot?.textContent).slice(0, 180) };
  });

  if (!prepared.ok) throw new Error('Campo Situação não localizado: ' + JSON.stringify(prepared));
  const comboSelector = '[data-grm-bonus-situation-combo="1"]';

  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.click();
    el.focus();
  }, comboSelector);
  await sleep(500);

  let menuInfo = await page.evaluate(() => {
    const combo = document.querySelector('[data-grm-bonus-situation-combo="1"]');
    const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';
    const menu = id ? document.getElementById(id) : null;
    return { id, exists: !!menu, text: String(menu?.innerText || menu?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500) };
  });

  if (!menuInfo.exists) {
    await page.focus(comboSelector);
    await page.keyboard.press('ArrowDown');
    await sleep(500);
    menuInfo = await page.evaluate(() => {
      const combo = document.querySelector('[data-grm-bonus-situation-combo="1"]');
      const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';
      const menu = id ? document.getElementById(id) : null;
      return { id, exists: !!menu, text: String(menu?.innerText || menu?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500) };
    });
  }

  const selected = await page.evaluate((prefix) => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const combo = document.querySelector('[data-grm-bonus-situation-combo="1"]');
    const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';
    const menu = id ? document.getElementById(id) : null;
    if (!menu) return { ok: false, reason: 'MENU_NOT_FOUND', id };
    const all = [menu, ...menu.querySelectorAll('*')].filter(visible);
    const exact = all.filter((el) => normalize(el.textContent) === prefix || normalize(el.textContent) === 'INATIVOS');
    const starts = all.filter((el) => normalize(el.textContent).startsWith(prefix));
    const raw = exact[0] || starts.sort((a, b) => String(a.textContent || '').length - String(b.textContent || '').length)[0];
    if (!raw) {
      return { ok: false, reason: 'OPTION_NOT_FOUND', id, menuText: normalize(menu.textContent).slice(0, 500), childTexts: all.map((el) => normalize(el.textContent)).filter(Boolean).slice(0, 40) };
    }
    const clickable = raw.closest('[role="option"],.v-list-item,button,[tabindex]') || raw;
    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    clickable.click();
    return { ok: true, id, text: normalize(raw.textContent), tag: clickable.tagName, cls: clickable.className };
  }, targetPrefix);

  if (!selected.ok) {
    const diag = await page.evaluate(() => {
      const combo = document.querySelector('[data-grm-bonus-situation-combo="1"]');
      const id = combo?.getAttribute('aria-controls') || combo?.getAttribute('aria-owns') || '';
      const menu = id ? document.getElementById(id) : null;
      return { value: combo?.value || '', ariaExpanded: combo?.getAttribute('aria-expanded'), ariaControls: id, menuExists: !!menu, menuText: String(menu?.innerText || menu?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800), menuHtml: String(menu?.innerHTML || '').slice(0, 1600) };
    });
    throw new Error('Não foi possível selecionar ' + targetSituation + ' pelo menu controlado: ' + JSON.stringify({ selected, diag, menuInfo }));
  }

  // confirmacao pre-pesquisa v7: o GRM re-renderiza os filtros ao clicar em
  // Pesquisar e remove os data-* usados para localizar o combobox. Por isso
  // a confirmação precisa ocorrer antes da pesquisa, enquanto o valor
  // selecionado ainda está no campo.
  await sleep(650);

  const confirmed = await page.evaluate((expected) => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const markedCombo = document.querySelector('[data-grm-bonus-situation-combo="1"]');
    const markedRoot = document.querySelector('[data-grm-bonus-situation-root="1"]');
    const marked = normalize((markedCombo?.value || '') + ' ' + (markedRoot?.textContent || ''));
    if (marked.includes(expected)) {
      return { ok: true, method: 'marked', combined: marked.slice(0, 220) };
    }

    const roots = [...document.querySelectorAll('.v-input,.v-select,.v-autocomplete,.v-field,[class*="field"]')];
    const snapshots = [];
    for (const root of roots) {
      const text = normalize(root.textContent || '');
      const inputs = [...root.querySelectorAll('input[role="combobox"],input')];
      const values = inputs.map((el) => normalize(el.value || '')).filter(Boolean);
      const combined = normalize(text + ' ' + values.join(' '));
      if (text.includes('SITUACAO') || values.some((v) => v.includes(expected))) {
        snapshots.push({ text: text.slice(0, 180), values: values.slice(0, 6), combined: combined.slice(0, 220) });
      }
      if (combined.includes(expected)) {
        return { ok: true, method: 'rediscovered', combined: combined.slice(0, 220), snapshots: snapshots.slice(0, 6) };
      }
    }

    const allCombos = [...document.querySelectorAll('input[role="combobox"]')].map((el) => ({
      value: normalize(el.value || ''),
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaControls: el.getAttribute('aria-controls'),
      hostText: normalize((el.closest('.v-input,.v-select,.v-autocomplete,.v-field') || el.parentElement)?.textContent || '').slice(0, 180),
    }));
    const direct = allCombos.find((item) => item.value.includes(expected) || item.hostText.includes(expected));
    if (direct) return { ok: true, method: 'all-combos', direct };

    return { ok: false, expected, marked: marked.slice(0, 220), snapshots: snapshots.slice(0, 8), allCombos: allCombos.slice(0, 12) };
  }, targetPrefix);

  if (!confirmed.ok) throw new Error('Filtro Situação não confirmou ' + targetSituation + ' antes da pesquisa: ' + JSON.stringify(confirmed));
  log('INFO', 'Filtro Situação confirmado como ' + targetSituation + ' antes da pesquisa.', { selected, confirmed });

  await clickStaffSearch(page);
}

async function inspectExpenseDescriptions(page, descriptions) {
  const expected = Array.isArray(descriptions) ? descriptions : [descriptions];
  return page.evaluate((wanted) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const targets = wanted.map(normalize).filter(Boolean);
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden';

    return [...document.querySelectorAll('tr,[role="row"]')]
      .filter(visible)
      .map((row) => ({
        text: String(row.innerText || '').replace(/\s+/g, ' ').trim(),
        normalized: normalize(row.innerText || ''),
        cells: [...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')]
          .map((cell) => String(cell.innerText || '').replace(/\s+/g, ' ').trim()),
      }))
      .filter((row) => targets.some((target) => row.normalized.includes(target)));
  }, expected);
}

async function typeField(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.down('Control');
  try { await page.keyboard.press('A'); } finally { await page.keyboard.up('Control'); }
  await page.keyboard.press('Backspace');
  await page.keyboard.type(String(value), { delay: 20 });
  await page.keyboard.press('Tab');
  await sleep(250);
}

function parseBrowserNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function closeDialogs(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function screenshot(page, job, label) {
  try {
    ensureDir(SCREENSHOT_DIR);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(SCREENSHOT_DIR, `${stamp}_${nameKey(job.colaborador_nome)}_${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch (error) {
    log('WARN', `Falha ao salvar screenshot: ${error.message}`);
    return null;
  }
}

async function launchBrowser() {
  const options = {
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
  if (process.env.PUPPETEER_EXECUTABLE_PATH) options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  return puppeteer.launch(options);
}

async function login(page) {
  // Login pelo formulário é barrado pelo Turnstile (30/09/2026): usa o token de sessão em cache.
  if (String(process.env.GRM_LOGIN_MODE || '').toLowerCase() !== 'form') {
    return require('./grm-token-browser').autenticarPaginaComToken(page);
  }
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: DEFAULT_TIMEOUT });
  await page.waitForSelector('input#input-v-5', { timeout: DEFAULT_TIMEOUT });
  await page.click('input#input-v-2', { clickCount: 3 });
  await page.type('input#input-v-2', GRM_USER, { delay: 15 });
  await page.click('input#input-v-5', { clickCount: 3 });
  await page.type('input#input-v-5', GRM_PASSWORD, { delay: 15 });
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button.submit-btn'),
  ]);
  await sleep(1200);
  log('SUCCESS', 'Login no GRM concluído.');
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION[ÁA]RIOS/i.test(text) || /Nome, Email ou CPF/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
}

module.exports = {
  configurar,
  log,
  sleep,
  digits,
  norm,
  nameKey,
  ensureDir,
  setSearchCpf,
  clickStaffSearch,
  waitStaffCpfRow,
  setStaffSituation,
  inspectExpenseDescriptions,
  typeField,
  parseBrowserNumber,
  closeDialogs,
  screenshot,
  launchBrowser,
  login,
  openStaffPage,
};
