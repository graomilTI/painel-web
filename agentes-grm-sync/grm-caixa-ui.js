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
const { obterTokenGrm } = require('./grm-token-cache');
const { postGrm } = require('./grm-token-browser');

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


// ---- Fluxo de tela do lançamento (versões do agente de Bônus, 14/10/2026) ----
// Movidas do grm-sync-bonus-caixa.js sem alteração de corpo (só saveExpense ganhou o
// parâmetro rotulo). Os outros agentes do Caixa ainda têm cópias próprias dessas
// funções, com diferenças pequenas de diagnóstico; migram um por vez.

function brMoneyText(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function selectExactStaffRow(page, cpf) {
  const target = digits(cpf);

  // 1ª espera: a linha do CPF entre os ATIVOS. Só depois disso troca o filtro para "Não Ativos". Pelo túnel do
  // escritório a tabela demora mais que 5 s com frequência; aí quem é Ativo era procurado no filtro errado e virava
  // "não localizado nem em Ativos nem em Não Ativos" (bônus de set/2026, 15/10: 4 dos 12 primeiros, todos
  // existentes no GRM). Na rota do túnel a espera sobe para 15 s; direto segue em 5 s.
  // GRM_CAIXA_BUSCA_CPF_MS sobrescreve.
  const esperaAtivosMs = Math.max(1000, Number(process.env.GRM_CAIXA_BUSCA_CPF_MS || (process.env.GRM_EGRESS_ROTA === 'tunel' ? 15000 : 5000)));
  let found = await waitStaffCpfRow(page, target, esperaAtivosMs);
  if (!found) {
    log('INFO', `CPF ${target} não localizado entre Ativos; tentando Situação = Não Ativos.`);
    await setStaffSituation(page, 'Não Ativos');
    await setSearchCpf(page, target);
    found = await waitStaffCpfRow(page, target, DEFAULT_TIMEOUT);
  }
  if (!found) {
    throw new Error(`Funcionário não localizado pelo CPF ${target} nem em Ativos nem em Não Ativos.`);
  }

  const prepared = await page.evaluate((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(targetCpf));
    if (rows.length !== 1) return { ok: false, reason: 'ROW_NOT_UNIQUE', matches: rows.length };
    const row = rows[0];
    const exactCpf = [...row.querySelectorAll('td')].some((cell) => onlyDigits(cell.innerText) === targetCpf);
    if (!exactCpf) return { ok: false, reason: 'CPF_NOT_EXACT' };
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return { ok: false, reason: 'CHECKBOX_NOT_FOUND' };
    checkbox.dataset.grmBonusStaffCheckbox = '1';
    const control = checkbox.closest('.v-selection-control, .v-checkbox, label') || checkbox.parentElement;
    if (control) control.dataset.grmBonusStaffControl = '1';
    return { ok: true, checked: !!checkbox.checked };
  }, target);

  if (!prepared.ok) throw new Error(`Funcionário não localizado de forma única pelo CPF: ${JSON.stringify(prepared)}`);
  if (!prepared.checked) {
    const clicked = await page.evaluate((targetCpf) => {
      const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
      const row = [...document.querySelectorAll('tr')]
        .find((el) => onlyDigits(el.innerText).includes(targetCpf));
      const checkbox = row?.querySelector('input[type="checkbox"]');
      if (!checkbox) return false;
      checkbox.click();
      return true;
    }, target);
    if (!clicked) throw new Error('Checkbox do funcionário desapareceu durante a seleção.');
  }
  await page.waitForFunction((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const row = [...document.querySelectorAll('tr')]
      .find((el) => onlyDigits(el.innerText).includes(targetCpf));
    return row?.querySelector('input[type="checkbox"]')?.checked === true;
  }, { timeout: DEFAULT_TIMEOUT }, target);
  await sleep(250);
}

async function clickCash(page) {
  const prepared = await page.evaluate(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    };

    document
      .querySelectorAll('[data-grm-bonus-cash]')
      .forEach((el) => delete el.dataset.grmBonusCash);

    // O campo de busca já é utilizado pelo agente para pesquisar o CPF.
    const searchInput = [...document.querySelectorAll('input')]
      .find((el) =>
        /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || '')
        || /cpf/i.test(el.getAttribute('placeholder') || '')
      );

    if (!searchInput) {
      return {
        ok: false,
        motivo: 'CAMPO_BUSCA_NAO_LOCALIZADO',
      };
    }

    const sr = searchInput.getBoundingClientRect();
    const centerY = sr.top + (sr.height / 2);

    const buttons = [...document.querySelectorAll(
      'button,[role="button"],a'
    )]
      .filter(visible)
      .filter((el) =>
        !el.disabled &&
        el.getAttribute('aria-disabled') !== 'true'
      )
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          rect,
          centerY: rect.top + (rect.height / 2),
        };
      })
      // Somente a barra de ações à esquerda do campo de busca.
      .filter(({ rect, centerY: buttonY }) =>
        rect.right <= sr.left + 15
        && Math.abs(buttonY - centerY) <= 35
      )
      .sort((a, b) => a.rect.left - b.rect.left);

    if (buttons.length < 5) {
      return {
        ok: false,
        motivo: 'BARRA_ACOES_INCOMPLETA',
        quantidade: buttons.length,
        posicoes: buttons.map((item, index) => ({
          posicao: index + 1,
          left: Math.round(item.rect.left),
          top: Math.round(item.rect.top),
        })),
      };
    }

    // Barra real do GRM:
    // 1 lápis
    // 2 XLS
    // 3 calendário
    // 4 localização
    // 5 Caixa (ícone prédio/museu)
    const cash = buttons[4].el;

    cash.dataset.grmBonusCash = '1';

    return {
      ok: true,
      selector: '[data-grm-bonus-cash="1"]',
      posicao: 5,
      quantidade_acoes: buttons.length,
      left: Math.round(buttons[4].rect.left),
      top: Math.round(buttons[4].rect.top),
      html: String(cash.outerHTML || '').slice(0, 800),
    };
  });

  if (!prepared?.ok) {
    throw new Error(
      `Botão Caixa não localizado na barra de ações: ${
        JSON.stringify(prepared).slice(0, 1800)
      }`
    );
  }

  log('INFO', 'Botão Caixa localizado pela posição da barra.', prepared);

  const beforeUrl = page.url();

  await page.click(prepared.selector);
  await page.waitForFunction((previous) => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )]
      .filter(visible)
      .some((el) => {
        const text = String(el.innerText || '').replace(/\s+/g, ' ').trim();
        return /CAIXA OPERACIONAL/i.test(text)
          && /TIPO DE DESPESA|ADIANTAMENTOS|COMPROVANTES/i.test(text);
      });
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(400);

  const after = await page.evaluate((urlAnterior) => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden';
    };

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )]
      .filter(visible)
      .map((el) => String(el.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(-3);

    return {
      urlAnterior,
      urlAtual: window.location.href,
      mudouUrl: window.location.href !== urlAnterior,
      dialogs,
      body: String(document.body?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-5000),
      controls: [...document.querySelectorAll('button,[role="button"],a')]
        .filter(visible)
        .map((el) => ({
          text: String(el.innerText || '').replace(/\s+/g, ' ').trim(),
          title: el.getAttribute('title'),
          aria: el.getAttribute('aria-label'),
          icons: [...el.querySelectorAll('lord-icon')]
            .map((icon) => icon.getAttribute('src')),
        }))
        .slice(-60),
    };
  }, beforeUrl);

  log('INFO', 'Resultado após clicar no Caixa.', DEBUG ? after : {
    urlAnterior: after.urlAnterior,
    urlAtual: after.urlAtual,
    mudouUrl: after.mudouUrl,
    dialogs: after.dialogs,
  });

  // Não falha aqui apenas porque não abriu modal.
  // O Caixa pode abrir tela, drawer ou outro componente.
  await sleep(500);
}

async function openEmployee(page, cpf) {
  await openStaffPage(page);
  await setSearchCpf(page, cpf);
  await selectExactStaffRow(page, cpf);
  await clickCash(page);
}

async function clickAddExpense(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();

    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden';
    };

    const signature = (el) => normalize([
      el.innerText,
      el.textContent,
      el.getAttribute?.('title'),
      el.getAttribute?.('aria-label'),
    ].filter(Boolean).join(' '));

    document
      .querySelectorAll('[data-grm-bonus-add-expense]')
      .forEach((el) => delete el.dataset.grmBonusAddExpense);

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )].filter(visible);

    const scope = dialogs[dialogs.length - 1] || document.body;

    const controls = [...scope.querySelectorAll(
      'button,[role="button"],a'
    )]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');

    let add = controls.find((el) => {
      const key = signature(el);
      return key === 'ADICIONAR DESPESA'
        || key === 'NOVA DESPESA'
        || key === 'ADICIONAR'
        || key === 'NOVO';
    });

    if (!add) {
      // Mesmo fallback do agente V1: procurar "+" ou Adicionar
      // dentro de um container relacionado a Despesas.
      const containers = [...scope.querySelectorAll(
        'section,main,div,.v-expansion-panel-text'
      )]
        .filter(visible)
        .filter((el) => {
          const key = normalize(el.innerText || '');
          return key.includes('DESPESA') && key.length < 5000;
        })
        .sort(
          (a, b) =>
            String(a.innerText || '').length -
            String(b.innerText || '').length
        );

      for (const container of containers) {
        const buttons = [...container.querySelectorAll(
          'button,[role="button"],a'
        )]
          .filter(visible)
          .filter((el) => !el.disabled);

        add = buttons.find((el) => {
          const key = signature(el);
          return key === '+'
            || /\bADICIONAR\b/.test(key)
            || /\bNOVA?\b/.test(key)
            || /\bNOVO\b/.test(key)
            || /PLUS/.test(key);
        });

        if (add) break;
      }
    }

    if (!add) {
      const plusButtons = [...document.querySelectorAll(
        'button,[role="button"],a'
      )]
        .filter(visible)
        .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .filter((el) =>
        [...el.querySelectorAll('lord-icon')].some((icon) =>
          /\/48-plus-to-square-rotation-outline\.json(?:$|\?)/
            .test(icon.getAttribute('src') || '')
        )
        );
      add = plusButtons[plusButtons.length - 1] || null;
    }

    if (!add) return null;

    add.dataset.grmBonusAddExpense = '1';

    return {
      selector: '[data-grm-bonus-add-expense="1"]',
      tag: add.tagName,
      texto: signature(add).slice(0, 300),
    };
  });

  if (!prepared) {
    const diagnostics = await page.evaluate(() => {
      const visible = (el) => {
        if (!el || !el.getClientRects().length) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none'
          && style.visibility !== 'hidden';
      };

      return [...document.querySelectorAll(
        'button,[role="button"],a'
      )]
        .filter(visible)
        .map((el) => String([
          el.innerText,
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
        ].filter(Boolean).join(' | ')).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 80);
    });

    throw new Error(
      `Botão para adicionar nova despesa não localizado. Controles: ${
        JSON.stringify(diagnostics).slice(0, 1600)
      }`
    );
  }

  const beforeForm = await page.evaluate(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      inputs: [...document.querySelectorAll(
        'input:not([type="checkbox"]),textarea,select,[role="combobox"]'
      )].filter(visible).length,
      dialogs: [...document.querySelectorAll(
        '[role="dialog"],.v-dialog,[class*="modal"],[class*="dialog"]'
      )].filter(visible).length,
    };
  });

  await page.click(prepared.selector);
  await page.waitForFunction((previous) => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const inputCount = [...document.querySelectorAll(
      'input:not([type="checkbox"]),textarea,select,[role="combobox"]'
    )].filter(visible).length;
    return inputCount > previous.inputs;
  }, { timeout: DEFAULT_TIMEOUT }, beforeForm);
  await sleep(300);

  log('INFO', 'Formulário de nova despesa aberto.', prepared);
}

async function markField(page, semantic) {
  const selector = await page.evaluate((fieldType) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const patterns = {
      descricao: /DESCRI[CÇ][AÃ]O|DESCRICAO|MOTIVO|OBSERVA[CÇ][AÃ]O|OBSERVACAO/,
      valor: /^VALOR$|VALOR DA DESPESA|VALOR TOTAL|R\$/,
      data: /^DATA$|DATA DA DESPESA|DATA DO LAN[CÇ]AMENTO/,
      documento: /^N(\.|º|°)?\s*(DO\s*)?DOCUMENTO$|NUMERO DO DOCUMENTO|N DOCUMENTO/,
    };
    const pattern = patterns[fieldType];
    if (!pattern) return null;

    const dialogs = [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
      .filter(visible);
    const formDialogs = dialogs
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''))
      .filter((el) => el.querySelector('input,textarea,select,[role="combobox"]'))
      .sort((a, b) =>
        b.querySelectorAll('input,textarea,select,[role="combobox"]').length
        - a.querySelectorAll('input,textarea,select,[role="combobox"]').length);
    const scope = formDialogs[0] || dialogs[dialogs.length - 1] || document.body;

    const labelCandidates = [...scope.querySelectorAll('label, .v-label, [class*="label"]')]
      .filter(visible)
      .filter((el) => pattern.test(normalize(el.textContent || '')));

    for (const label of labelCandidates) {
      let input = null;
      if (label.htmlFor) input = document.getElementById(label.htmlFor);
      if (!input) {
        const host = label.closest('.v-input, .v-field, .form-group, [class*="field"]') || label.parentElement;
        input = host?.querySelector('input:not([type="checkbox"]), textarea') || null;
      }
      if (input && visible(input)) {
        input.dataset.grmBonusField = fieldType;
        return `[data-grm-bonus-field="${fieldType}"]`;
      }
    }

    const inputs = [...scope.querySelectorAll('input:not([type="checkbox"]), textarea')].filter(visible);
    const input = inputs.find((el) => pattern.test(normalize([
      el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('aria-label'),
    ].filter(Boolean).join(' '))));
    if (!input) return null;
    input.dataset.grmBonusField = fieldType;
    return `[data-grm-bonus-field="${fieldType}"]`;
  }, semantic);

  if (!selector) throw new Error(`Campo ${semantic} da Despesa não localizado.`);
  return selector;
}

async function chooseMovementType(page, expected = 'Comprovante') {
  const selector = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible)
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''));
    const scope = dialogs.sort((a, b) => b.querySelectorAll('input').length - a.querySelectorAll('input').length)[0];
    if (!scope) return null;
    const labels = [...scope.querySelectorAll('label,.v-label,[class*="label"]')]
      .filter(visible)
      .filter((el) => normalize(el.textContent) === 'TIPO');
    let control = labels[0]?.closest('.v-input,.v-field,[role="combobox"],[class*="field"]');
    if (!control) {
      control = [...scope.querySelectorAll('[role="combobox"],.v-select,.v-autocomplete')]
        .filter(visible)
        .find((el) => /ADIANTAMENTO|COMPROVANTE/.test(normalize(el.innerText || el.textContent)));
    }
    const clickable = control?.matches('input,button,[role="combobox"]')
      ? control
      : control?.querySelector('input,button,[role="combobox"]') || control;
    if (!clickable) return null;
    clickable.dataset.grmBonusType = '1';
    return '[data-grm-bonus-type="1"]';
  });
  if (!selector) throw new Error('Campo Tipo do movimento não localizado.');
  await page.click(selector);
  await sleep(300);
  const option = await page.evaluate((wanted) => {
    const normalize = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const target = normalize(wanted);
    const candidate = [...document.querySelectorAll('[role="option"],.v-list-item,li')]
      .filter(visible)
      .find((el) => normalize(el.innerText || el.textContent) === target);
    if (!candidate) return null;
    candidate.dataset.grmBonusTypeOption = '1';
    return '[data-grm-bonus-type-option="1"]';
  }, expected);
  if (!option) throw new Error(`Opção ${expected} não localizada no campo Tipo.`);
  await page.click(option);
  await sleep(250);
}

async function saveExpense(page, rotulo = 'Bônus') {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden';

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )].filter(visible);

    const formDialogs = dialogs
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''))
      .filter((el) => el.querySelector('input,textarea,select,[role="combobox"]'))
      .sort((a, b) =>
        b.querySelectorAll('input,textarea,select,[role="combobox"]').length
        - a.querySelectorAll('input,textarea,select,[role="combobox"]').length
      );

    const scope = formDialogs[0] || dialogs[dialogs.length - 1] || document.body;
    const save = [...scope.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .find((button) => normalize(button.textContent) === 'SALVAR' && !button.disabled);

    if (!save) return null;
    save.dataset.grmBonusSaveExpense = '1';

    return {
      selector: '[data-grm-bonus-save-expense="1"]',
    };
  });

  if (!prepared) throw new Error('Botão SALVAR do movimento não localizado.');

  await page.click(prepared.selector);
  await sleep(1400);

  // L\u00ea a tela em busca do aviso de sucesso/erro do GRM e se o formul\u00e1rio ainda est\u00e1 aberto.
  const lerConfirmacao = () => page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden';

    const formStillOpen = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )]
      .filter(visible)
      .some((el) =>
        /ADICIONAR MOVIMENTO/i.test(el.innerText || '')
        && el.querySelector('input,textarea,select,[role="combobox"]')
      );

    const messages = [...document.querySelectorAll(
      '.v-messages__message,.v-alert,[role="alert"],.v-snackbar,.v-snackbar__content'
    )]
      .filter(visible)
      .map((el) => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(-12);

    const successPattern = /REGISTRO.*CADASTRAD.*SUCESS|CADASTRAD.*SUCESS|SUCESSO|SALVO|SALVA|CRIADO|ADICIONADO/;
    const errorPattern = /ERRO|OBRIGAT|INVALID|PREENCHA|SELECIONE|FALHA|NAO FOI CADASTRAD|NÃO FOI CADASTRAD/;

    let lastSignal = null;
    messages.forEach((msg, index) => {
      const normalized = normalize(msg);
      if (errorPattern.test(normalized)) {
        lastSignal = { type: 'error', message: msg, index };
      }
      if (successPattern.test(normalized) && !/NAO|NÃO|ERRO|FALHA/.test(normalized)) {
        lastSignal = { type: 'success', message: msg, index };
      }
    });

    return {
      formStillOpen,
      messages,
      successMessage: lastSignal?.type === 'success' ? lastSignal.message : null,
      errorMessage: lastSignal?.type === 'error' ? lastSignal.message : null,
      signalType: lastSignal?.type || null,
    };
  });

  // Antes lia a tela UMA vez, 1,4 s depois do clique. Pelo túnel do escritório (EUA <-> Brasil em cada chamada)
  // a resposta do GRM chega depois disso com frequência: o agente não via o aviso de sucesso, marcava ERRO
  // ("não confirmou o salvamento") e o GRM gravava logo em seguida (15/10/2026, lançamento de bônus). Agora, se
  // ainda não há sinal e o formulário segue aberto, espera até GRM_CAIXA_CONFIRMACAO_MS (padrão 15 s), relendo a
  // cada 500 ms; sai na hora em que aparecer sucesso ou erro, ou quando o formulário fechar.
  const esperaMaximaMs = Math.max(0, Number(process.env.GRM_CAIXA_CONFIRMACAO_MS || 15000));
  const inicioDaEspera = Date.now();
  let confirmation = await lerConfirmacao();
  while (!confirmation.signalType && confirmation.formStillOpen && Date.now() - inicioDaEspera < esperaMaximaMs) {
    await sleep(500);
    confirmation = await lerConfirmacao();
  }

  // O GRM mantém o formulário aberto em algumas versões mesmo após gravar.
  // A mensagem oficial "Registro cadastrado... com sucesso" é confirmação
  // suficiente para seguir à verificação do movimento no Caixa.
  if (confirmation.signalType === 'success') {
    log('SUCCESS', 'GRM confirmou o cadastro do movimento.', confirmation);
    return { ...confirmation, confirmedBy: 'GRM_SUCCESS_MESSAGE' };
  }

  if (confirmation.signalType === 'error') {
    throw new Error(`GRM recusou o salvamento do ${rotulo}: ${confirmation.errorMessage}`);
  }

  if (confirmation.formStillOpen) {
    throw new Error(
      `GRM não confirmou o salvamento do ${rotulo}.`
      + (confirmation.messages.length
        ? ` Mensagens: ${confirmation.messages.join(' | ').slice(0, 1200)}`
        : ' O formulário permaneceu aberto após clicar em Salvar e nenhuma mensagem de sucesso foi exibida.')
    );
  }

  log('INFO', 'GRM fechou o formulário de Adicionar Movimento após Salvar; seguindo para verificação no Caixa.', confirmation);
  return { ...confirmation, confirmedBy: 'FORM_CLOSED' };
}

async function openExpensesSection(page) {
  const found = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    document.querySelectorAll('[data-grm-bonus-expenses]').forEach((el) => delete el.dataset.grmBonusExpenses);

    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')].filter(visible);
    const scope = dialogs[dialogs.length - 1] || document.body;
    const clickableSelector = 'button,[role="button"],[role="tab"],a,.v-tab,.v-list-item,.v-expansion-panel-title';

    const direct = [...scope.querySelectorAll(clickableSelector)]
      .filter(visible)
      .filter((el) => !['I', 'SVG', 'PATH'].includes(el.tagName))
      .filter((el) => {
        const text = normalize(el.innerText || el.textContent || '');
        return text === 'DESPESAS' || text === 'DESPESA';
      });

    let clickable = direct[direct.length - 1] || null;

    if (!clickable) {
      const labels = [...scope.querySelectorAll('*')]
        .filter(visible)
        .filter((el) => el.children.length === 0)
        .filter((el) => {
          const text = normalize(el.textContent || '');
          return text === 'DESPESAS' || text === 'DESPESA';
        });
      for (let i = labels.length - 1; i >= 0; i -= 1) {
        const parent = labels[i].closest(clickableSelector);
        if (parent && visible(parent) && !['I', 'SVG', 'PATH'].includes(parent.tagName)) {
          clickable = parent;
          break;
        }
      }
    }

    if (clickable) {
      clickable.dataset.grmBonusExpenses = '1';
      return { ok: true, selector: '[data-grm-bonus-expenses="1"]', already: false };
    }

    // O modal "CAIXA OPERACIONAL" (aberto por clickCash) passou a exibir a
    // tabela de despesas direto, sem aba "DESPESAS" separada pra clicar
    // (confirmado por screenshot de erro: 2026-09-16, colaborador ativo,
    // cadastro completo — a tabela já estava visível). Se a tabela já tem
    // as colunas esperadas, não há nada pra clicar; segue em frente.
    const headerTexts = [...scope.querySelectorAll('th,[role="columnheader"]')]
      .filter(visible)
      .map((el) => normalize(el.textContent || ''));
    const hasTable = ['DESCRICAO', 'TIPO DE DESPESA', 'VALOR'].every((col) => headerTexts.includes(col));
    if (hasTable) {
      return { ok: true, already: true, headerTexts: headerTexts.slice(0, 12) };
    }

    return { ok: false, headerTexts: headerTexts.slice(0, 12) };
  });

  if (!found?.ok) throw new Error('Seção DESPESAS não localizada no cadastro do colaborador: ' + JSON.stringify(found));

  if (!found.already) {
    await page.click(found.selector);
    await sleep(1000);
  }
}

// ---- Movimentos do Caixa pela API do GRM (14/10/2026) ----
// A tabela de despesas do modal "Caixa Operacional" só mostra uma JANELA de datas: esconde
// lançamentos com data futura (o Bônus é lançado no dia 15; rodando antes do dia 15 a data é
// futura) e os mais antigos. Em 06/10 isso deixou 15 bônus já lançados como ERRO ("não
// localizado") e deixava cega a trava contra duplicidade — reprocessar teria lançado de novo.
// O relatório reports/finance/operatingFlow não tem essa janela. A tela continua sendo usada
// só para lançar; conferir e checar duplicidade é por aqui.

let tokenApi = null;
let cadastroStaff = null;
const relatorioPorMes = new Map();

async function grmApi(endpoint, body) {
  if (!tokenApi) {
    tokenApi = await obterTokenGrm({
      login: () => Promise.reject(new Error('Sem token de sessão válido em cache para consultar a API do GRM.')),
    });
  }
  const resposta = await postGrm(endpoint, body, tokenApi);
  if (!resposta || resposta.result === false) {
    throw new Error(`API do GRM recusou ${endpoint}: ${resposta?.message || 'sem detalhes'}`);
  }
  return resposta;
}

async function staCodePorCpf(cpf) {
  const alvo = digits(cpf);
  if (alvo.length !== 11) throw new Error('CPF inválido para consulta na API do GRM.');
  if (!cadastroStaff) {
    cadastroStaff = (await grmApi('staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: '' })).searchData || [];
  }
  const achados = cadastroStaff.filter((s) => digits(s.staCPF) === alvo);
  if (achados.length !== 1) {
    throw new Error(`CPF localizado ${achados.length} vez(es) no cadastro de Funcionários do GRM (API).`);
  }
  return Number(achados[0].staCode);
}

// [primeiro dia, último dia] (DD/MM/AAAA) de cada mês entre duas datas ISO, inclusive.
// A API recusa intervalo maior que um mês (invalidDateRangeMonths).
function mesesDoPeriodo(deIso, ateIso) {
  const [anoIni, mesIni] = String(deIso).slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = String(ateIso).slice(0, 7).split('-').map(Number);
  if (!anoIni || !mesIni || !anoFim || !mesFim) throw new Error(`Período inválido: ${deIso} a ${ateIso}`);
  const meses = [];
  let ano = anoIni;
  let mes = mesIni;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    const mm = String(mes).padStart(2, '0');
    const ultimo = String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0');
    meses.push([`01/${mm}/${ano}`, `${ultimo}/${mm}/${ano}`]);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
    if (meses.length > 24) throw new Error('Período de consulta do Caixa maior que 24 meses.');
  }
  return meses;
}

/**
 * Movimentos do Caixa de um colaborador, de mês inteiro em mês inteiro (todos os status:
 * pendente, aprovado e reprovado). semCache: rebaixa o relatório (usar na conferência pós-salvar).
 * @param {{ cpf: string, de: string, ate: string, semCache?: boolean }} opcoes  datas ISO AAAA-MM-DD
 */
async function movimentosCaixaGrm({ cpf, de, ate, semCache = false }) {
  const staCode = await staCodePorCpf(cpf);
  const movimentos = [];
  for (const [inicio, fim] of mesesDoPeriodo(de, ate)) {
    if (semCache || !relatorioPorMes.has(inicio)) {
      const relatorio = await grmApi('reports/finance/operatingFlow', {
        ofmDateFrom: inicio, ofmDateTo: fim, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList',
      });
      relatorioPorMes.set(inicio, relatorio.searchData || []);
    }
    for (const r of relatorioPorMes.get(inicio)) {
      if (Number(r.staCode) !== staCode) continue;
      movimentos.push({
        ofmCode: r.ofmCode,
        data: r.ofmDate,
        descricao: String(r.ofmDescription || '').trim(),
        tipoDespesa: String(r.oexName || '').trim(),
        valor: Number(r.ofmValue),
        documento: r.ofmDocument == null ? '' : String(r.ofmDocument).trim(),
        status: r.ofmStatus,
        tipo: r.ofmType,
      });
    }
  }
  return movimentos;
}

module.exports = {
  openExpensesSection,
  movimentosCaixaGrm,
  mesesDoPeriodo,
  brMoneyText,
  selectExactStaffRow,
  clickCash,
  openEmployee,
  clickAddExpense,
  markField,
  chooseMovementType,
  saveExpense,
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
