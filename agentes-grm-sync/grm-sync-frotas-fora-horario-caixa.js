#!/usr/bin/env node
'use strict';

/*
 * GRM Server - Lançamento do Adiantamento de uso de veículo fora do expediente no Caixa do colaborador.
 *
 * Fila: frotas_fora_horario_caixa_lancamentos (gerada por bonus_substituir_auditoria ao
 * importar a planilha de auditoria em Conferência > Bônus). Cada linha já vem com o
 * valor RESPEITANDO o teto de R$500,00 comprometido por colaborador — esse teto é
 * calculado no banco (RPC), este agente só executa o que já está na fila.
 *
 * Fluxo no GRM: Funcionário -> abrir cadastro -> Caixa -> Despesas -> Adicionar
 * -> Tipo = Adiantamento -> Descrição / Valor / Data -> Salvar.
 *
 * Validado ao vivo em 10/09/2026: com Tipo = Adiantamento o formulário só pede
 * Funcionário, Tipo, Empresa (já vem pré-preenchida, não precisa tocar), Data,
 * Valor, Arquivo (opcional) e Descrição — sem "Tipo da Despesa", "Tipo de
 * Documento" nem "N. Documento" (exclusivos do Comprovante). Também não passa
 * por fila de aprovação separada; "Aprovado Por" já sai preenchido.
 */

process.env.TMPDIR = process.env.TMPDIR || '/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMPDIR;
process.env.TMP = process.env.TMP || process.env.TMPDIR;

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const STAFF_URL = process.env.GRM_BONUS_CAIXA_STAFF_URL || 'https://www.grmserver.com.br/adm/team/staff';
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';
const DEBUG = String(process.env.GRM_FROTAS_FORA_HORARIO_CAIXA_DEBUG ?? 'false').toLowerCase() === 'true';
// Fluxo validado ao vivo em 10/09/2026 (ver comentário acima) — padrão FALSE.
const DRY_RUN = String(process.env.GRM_FROTAS_FORA_HORARIO_CAIXA_DRY_RUN ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Math.min(20, Number(process.env.GRM_FROTAS_FORA_HORARIO_CAIXA_MAX_POR_EXECUCAO || 8)));
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_FROTAS_FORA_HORARIO_CAIXA_TIMEOUT_MS || 45000));
const SCREENSHOT_DIR = process.env.GRM_FROTAS_FORA_HORARIO_CAIXA_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/frotas-fora-horario-caixa';

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

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

function todayBrDate() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = parts.find((part) => part.type === 'year')?.value;
  if (!day || !month || !year) throw new Error('Não foi possível calcular a data de lançamento do Adiantamento.');
  return `${day}/${month}/${year}`;
}

function descriptionFor(job) {
  const descricao = String(job.descricao || '').trim();
  if (descricao) return descricao.slice(0, 250);
  return `Frotas - Uso de veículo fora do expediente - placa ${String(job.placa || '').toUpperCase()} - ${String(job.data_evento || '')} - ${Number(job.km_00_05 || 0).toFixed(3).replace('.', ',')} km x R$ 4,00/km`.slice(0, 250);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

async function selectExactStaffRow(page, cpf) {
  const target = digits(cpf);

  let found = await waitStaffCpfRow(page, target, 5000);
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
    checkbox.dataset.grmDescontoStaffCheckbox = '1';
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
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    document.querySelectorAll('[data-grm-desconto-cash]').forEach((el) => delete el.dataset.grmDescontoCash);

    const searchInput = [...document.querySelectorAll('input')]
      .find((el) =>
        /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || '')
        || /cpf/i.test(el.getAttribute('placeholder') || ''));

    if (!searchInput) return { ok: false, motivo: 'CAMPO_BUSCA_NAO_LOCALIZADO' };

    const sr = searchInput.getBoundingClientRect();
    const centerY = sr.top + (sr.height / 2);

    const buttons = [...document.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, rect, centerY: rect.top + (rect.height / 2) };
      })
      .filter(({ rect, centerY: buttonY }) => rect.right <= sr.left + 15 && Math.abs(buttonY - centerY) <= 35)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (buttons.length < 5) {
      return { ok: false, motivo: 'BARRA_ACOES_INCOMPLETA', quantidade: buttons.length };
    }

    // Mesma barra do GRM usada pelo agente de Bônus: posição 5 = Caixa.
    const cash = buttons[4].el;
    cash.dataset.grmDescontoCash = '1';
    return { ok: true, selector: '[data-grm-desconto-cash="1"]' };
  });

  if (!prepared?.ok) {
    throw new Error(`Botão Caixa não localizado na barra de ações: ${JSON.stringify(prepared).slice(0, 1800)}`);
  }

  await page.click(prepared.selector);
  await page.waitForFunction(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible)
      .some((el) => {
        const text = String(el.innerText || '').replace(/\s+/g, ' ').trim();
        return /CAIXA OPERACIONAL/i.test(text) && /TIPO DE DESPESA|ADIANTAMENTOS|COMPROVANTES/i.test(text);
      });
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(500);
}

async function openEmployee(page, cpf) {
  await openStaffPage(page);
  await setSearchCpf(page, cpf);
  await selectExactStaffRow(page, cpf);
  await clickCash(page);
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

    document.querySelectorAll('[data-grm-desconto-expenses]').forEach((el) => delete el.dataset.grmDescontoExpenses);

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
      clickable.dataset.grmDescontoExpenses = '1';
      return { ok: true, selector: '[data-grm-desconto-expenses="1"]', already: false };
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

async function inspectExpenseDescriptions(page, descriptions) {
  const expected = Array.isArray(descriptions) ? descriptions : [descriptions];
  return page.evaluate((wanted) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const targets = wanted.map(normalize).filter(Boolean);
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

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

function brMoneyText(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function verifyMovementRow(rows, job) {
  const expectedValue = brMoneyText(job.valor);
  const candidate = (rows || []).find((row) => {
    const cells = row.cells || [];
    const hasValue = cells.some((cell) => String(cell).includes(expectedValue)) || String(row.text).includes(expectedValue);
    return hasValue;
  });
  return { found: !!candidate, row: candidate || null };
}

async function clickAddExpense(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const signature = (el) => normalize([el.innerText, el.textContent, el.getAttribute?.('title'), el.getAttribute?.('aria-label')].filter(Boolean).join(' '));

    document.querySelectorAll('[data-grm-desconto-add-expense]').forEach((el) => delete el.dataset.grmDescontoAddExpense);

    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')].filter(visible);
    const scope = dialogs[dialogs.length - 1] || document.body;
    const controls = [...scope.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');

    let add = controls.find((el) => {
      const key = signature(el);
      return key === 'ADICIONAR DESPESA' || key === 'NOVA DESPESA' || key === 'ADICIONAR' || key === 'NOVO';
    });

    if (!add) {
      const containers = [...scope.querySelectorAll('section,main,div,.v-expansion-panel-text')]
        .filter(visible)
        .filter((el) => {
          const key = normalize(el.innerText || '');
          return key.includes('DESPESA') && key.length < 5000;
        })
        .sort((a, b) => String(a.innerText || '').length - String(b.innerText || '').length);

      for (const container of containers) {
        const buttons = [...container.querySelectorAll('button,[role="button"],a')].filter(visible).filter((el) => !el.disabled);
        add = buttons.find((el) => {
          const key = signature(el);
          return key === '+' || /\bADICIONAR\b/.test(key) || /\bNOVA?\b/.test(key) || /\bNOVO\b/.test(key) || /PLUS/.test(key);
        });
        if (add) break;
      }
    }

    if (!add) {
      const plusButtons = [...document.querySelectorAll('button,[role="button"],a')]
        .filter(visible)
        .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .filter((el) => [...el.querySelectorAll('lord-icon')].some((icon) => /\/48-plus-to-square-rotation-outline\.json(?:$|\?)/.test(icon.getAttribute('src') || '')));
      add = plusButtons[plusButtons.length - 1] || null;
    }

    if (!add) return null;
    add.dataset.grmDescontoAddExpense = '1';
    return { selector: '[data-grm-desconto-add-expense="1"]' };
  });

  if (!prepared) throw new Error('Botão para adicionar nova despesa não localizado.');

  const beforeForm = await page.evaluate(() => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      inputs: [...document.querySelectorAll('input:not([type="checkbox"]),textarea,select,[role="combobox"]')].filter(visible).length,
    };
  });

  await page.click(prepared.selector);
  await page.waitForFunction((previous) => {
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const inputCount = [...document.querySelectorAll('input:not([type="checkbox"]),textarea,select,[role="combobox"]')].filter(visible).length;
    return inputCount > previous.inputs;
  }, { timeout: DEFAULT_TIMEOUT }, beforeForm);
  await sleep(300);
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
    };
    const pattern = patterns[fieldType];
    if (!pattern) return null;

    const dialogs = [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')].filter(visible);
    const formDialogs = dialogs
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''))
      .filter((el) => el.querySelector('input,textarea,select,[role="combobox"]'))
      .sort((a, b) => b.querySelectorAll('input,textarea,select,[role="combobox"]').length - a.querySelectorAll('input,textarea,select,[role="combobox"]').length);
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
        input.dataset.grmDescontoField = fieldType;
        return `[data-grm-desconto-field="${fieldType}"]`;
      }
    }

    const inputs = [...scope.querySelectorAll('input:not([type="checkbox"]), textarea')].filter(visible);
    const input = inputs.find((el) => pattern.test(normalize([el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('aria-label')].filter(Boolean).join(' '))));
    if (!input) return null;
    input.dataset.grmDescontoField = fieldType;
    return `[data-grm-desconto-field="${fieldType}"]`;
  }, semantic);

  if (!selector) throw new Error(`Campo ${semantic} da Despesa não localizado.`);
  return selector;
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

async function chooseMovementType(page, expected = 'Adiantamento') {
  const selector = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
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
    const clickable = control?.matches('input,button,[role="combobox"]') ? control : control?.querySelector('input,button,[role="combobox"]') || control;
    if (!clickable) return null;
    clickable.dataset.grmDescontoType = '1';
    return '[data-grm-desconto-type="1"]';
  });
  if (!selector) throw new Error('Campo Tipo do movimento não localizado.');
  await page.click(selector);
  await sleep(300);
  const option = await page.evaluate((wanted) => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const target = normalize(wanted);
    const candidate = [...document.querySelectorAll('[role="option"],.v-list-item,li')]
      .filter(visible)
      .find((el) => normalize(el.innerText || el.textContent) === target);
    if (!candidate) return null;
    candidate.dataset.grmDescontoTypeOption = '1';
    return '[data-grm-desconto-type-option="1"]';
  }, expected);
  if (!option) throw new Error(`Opção ${expected} não localizada no campo Tipo.`);
  await page.click(option);
  await sleep(250);
}

async function fillExpense(page, job) {
  await chooseMovementType(page, 'Adiantamento');

  const descriptionField = await markField(page, 'descricao');
  const valueField = await markField(page, 'valor');
  const dateField = await markField(page, 'data');

  const description = descriptionFor(job);
  await typeField(page, descriptionField, description);

  const expectedValue = Number(job.valor || 0);
  const valueCandidates = [
    expectedValue.toFixed(2).replace('.', ','),
    String(Math.round(expectedValue * 100)),
    expectedValue.toFixed(2),
  ];
  let valueOk = false;
  for (const candidate of valueCandidates) {
    await typeField(page, valueField, candidate);
    const observed = await page.$eval(valueField, (el) => el.value || el.getAttribute('value') || '');
    if (Math.abs(parseBrowserNumber(observed) - expectedValue) < 0.001) {
      valueOk = true;
      break;
    }
  }
  if (!valueOk) throw new Error(`Valor do Adiantamento não permaneceu no formulário como ${expectedValue.toFixed(2)}.`);

  const launchDate = todayBrDate();
  await typeField(page, dateField, launchDate);

  const observed = await page.evaluate((selectors) => {
    const value = (selector) => {
      const el = document.querySelector(selector);
      return String(el?.value || el?.getAttribute?.('value') || '').trim();
    };
    const form = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .find((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''));
    return {
      descricao: value(selectors.description),
      textoFormulario: String(form?.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  }, { description: descriptionField });

  if (norm(observed.descricao) !== norm(description)) throw new Error(`Descrição divergente no formulário: ${observed.descricao}`);
  if (!norm(observed.textoFormulario).includes(norm('Adiantamento'))) throw new Error('Tipo do movimento não permaneceu como Adiantamento.');

  return { date: launchDate, value: expectedValue, description };
}

async function saveExpense(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')].filter(visible);
    const formDialogs = dialogs
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''))
      .filter((el) => el.querySelector('input,textarea,select,[role="combobox"]'))
      .sort((a, b) => b.querySelectorAll('input,textarea,select,[role="combobox"]').length - a.querySelectorAll('input,textarea,select,[role="combobox"]').length);

    const scope = formDialogs[0] || dialogs[dialogs.length - 1] || document.body;
    const save = [...scope.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .find((button) => normalize(button.textContent) === 'SALVAR' && !button.disabled);

    if (!save) return null;
    save.dataset.grmDescontoSaveExpense = '1';
    return { selector: '[data-grm-desconto-save-expense="1"]' };
  });

  if (!prepared) throw new Error('Botão SALVAR do movimento não localizado.');

  await page.click(prepared.selector);
  await sleep(1400);

  const confirmation = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

    const formStillOpen = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible)
      .some((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || '') && el.querySelector('input,textarea,select,[role="combobox"]'));

    const messages = [...document.querySelectorAll('.v-messages__message,.v-alert,[role="alert"],.v-snackbar,.v-snackbar__content')]
      .filter(visible)
      .map((el) => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(-12);

    const successPattern = /REGISTRO.*CADASTRAD.*SUCESS|CADASTRAD.*SUCESS|SUCESSO|SALVO|SALVA|CRIADO|ADICIONADO/;
    const errorPattern = /ERRO|OBRIGAT|INVALID|PREENCHA|SELECIONE|FALHA|NAO FOI CADASTRAD|NÃO FOI CADASTRAD/;

    let lastSignal = null;
    messages.forEach((msg, index) => {
      const normalized = normalize(msg);
      if (errorPattern.test(normalized)) lastSignal = { type: 'error', message: msg, index };
      if (successPattern.test(normalized) && !/NAO|NÃO|ERRO|FALHA/.test(normalized)) lastSignal = { type: 'success', message: msg, index };
    });

    return {
      formStillOpen,
      messages,
      successMessage: lastSignal?.type === 'success' ? lastSignal.message : null,
      errorMessage: lastSignal?.type === 'error' ? lastSignal.message : null,
      signalType: lastSignal?.type || null,
    };
  });

  if (confirmation.signalType === 'success') {
    log('SUCCESS', 'GRM confirmou o cadastro do movimento.', confirmation);
    return { ...confirmation, confirmedBy: 'GRM_SUCCESS_MESSAGE' };
  }

  if (confirmation.signalType === 'error') {
    throw new Error(`GRM recusou o salvamento do Adiantamento: ${confirmation.errorMessage}`);
  }

  if (confirmation.formStillOpen) {
    throw new Error(
      'GRM não confirmou o salvamento do Adiantamento.'
      + (confirmation.messages.length
        ? ` Mensagens: ${confirmation.messages.join(' | ').slice(0, 1200)}`
        : ' O formulário permaneceu aberto após clicar em Salvar e nenhuma mensagem de sucesso foi exibida.')
    );
  }

  log('INFO', 'GRM fechou o formulário de Adicionar Movimento após Salvar; seguindo para verificação no Caixa.', confirmation);
  return { ...confirmation, confirmedBy: 'FORM_CLOSED' };
}

async function closeDialogs(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function verifyExpense(page, cpf, job) {
  await closeDialogs(page);
  await openEmployee(page, cpf);
  await openExpensesSection(page);

  const description = descriptionFor(job);
  let lastRows = [];

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(attempt === 1 ? 700 : 1200);
    const rows = await inspectExpenseDescriptions(page, [description]);
    lastRows = rows;
    const verification = verifyMovementRow(rows, job);
    if (verification.found) return { ok: true, row: verification.row, attempt };
  }

  return { ok: false, row: null, rows: lastRows };
}

async function recoverStaleProcessing() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('frotas_fora_horario_caixa_lancamentos')
    .update({ status: 'PENDENTE', iniciado_em: null, updated_at: new Date().toISOString() })
    .eq('status', 'PROCESSANDO')
    .lt('iniciado_em', cutoff);
  if (error) log('WARN', `Falha ao recuperar PROCESSANDO antigo: ${error.message}`);
}

async function loadPendingJobs() {
  const { data, error } = await supabase
    .from('frotas_fora_horario_caixa_lancamentos')
    .select('*')
    .eq('status', 'PENDENTE')
    .order('solicitado_em', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;
  return data || [];
}

async function loadCollaborators() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    // vw_colaboradores_atuais ordena por "tem lançamento PENDENTE/PROCESSANDO
    // agora" antes do nome — essa ordem muda em tempo real enquanto este
    // próprio agente (ou o sync-bonus-caixa, na mesma janela) processa o
    // lote (status indo PENDENTE -> PROCESSANDO -> LANCADO). Sem um order()
    // estável e independente disso, o range() pode pular ou repetir linhas
    // entre uma página e outra, derrubando colaboradores existentes da lista
    // ("CPF não resolvido... 0 correspondência(s)" mesmo com o colaborador
    // cadastrado normalmente).
    const { data, error } = await supabase
      .from('vw_colaboradores_atuais')
      .select('nome,cpf,ativo,situacao')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const map = new Map();
  for (const row of rows) {
    const key = nameKey(row.nome);
    const cpf = digits(row.cpf);
    if (!key || !cpf) continue;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.some((item) => item.cpf === cpf)) list.push({ ...row, cpf });
  }
  return map;
}

function resolveCpf(job, collaborators) {
  const matches = collaborators.get(nameKey(job.colaborador_nome)) || [];
  const active = matches.filter((item) => item.ativo !== false && !/INATIV|DESLIG/i.test(String(item.situacao || '')));
  const preferred = active.length ? active : matches;
  if (preferred.length !== 1) {
    throw new Error(`CPF não resolvido de forma única para ${job.colaborador_nome}: ${preferred.length} correspondência(s).`);
  }
  return preferred[0].cpf;
}

async function updateLaunch(id, patch) {
  const { error } = await supabase
    .from('frotas_fora_horario_caixa_lancamentos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function markProcessing(job) {
  await updateLaunch(job.id, {
    status: 'PROCESSANDO',
    tentativas: Number(job.tentativas || 0) + 1,
    ultimo_erro: null,
    iniciado_em: new Date().toISOString(),
    processado_em: null,
  });
}

async function markSuccess(job, payload) {
  await updateLaunch(job.id, {
    status: 'LANCADO',
    ultimo_erro: null,
    processado_em: new Date().toISOString(),
    grm_retorno: payload,
  });
}

async function markError(job, error, screenshotPath) {
  await updateLaunch(job.id, {
    status: 'ERRO',
    ultimo_erro: String(error?.message || error).slice(0, 4000),
    processado_em: new Date().toISOString(),
    grm_retorno: {
      ok: false,
      erro: String(error?.message || error),
      stack: String(error?.stack || '').slice(0, 8000),
      screenshot_path: screenshotPath || null,
    },
  });
}

async function enqueueFollowupIfNeeded() {
  const { data: remaining, error } = await supabase
    .from('frotas_fora_horario_caixa_lancamentos')
    .select('id')
    .eq('status', 'PENDENTE')
    .limit(1);
  if (error || !remaining?.length) return;

  const { data: queued, error: queuedError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-frotas-fora-horario-caixa')
    .eq('status', 'pendente')
    .limit(1);
  if (queuedError || queued?.length) return;

  const { error: insertError } = await supabase.from('grm_sync_jobs').insert({
    agente_id: 'sync-frotas-fora-horario-caixa',
    status: 'pendente',
    payload: { origem: 'bonus_desconto_caixa_continuacao' },
  });
  if (insertError) log('WARN', `Falha ao enfileirar continuação: ${insertError.message}`);
}

async function processJob(page, job, collaborators) {
  await markProcessing(job);
  const cpf = resolveCpf(job, collaborators);
  const description = descriptionFor(job);
  const date = todayBrDate();

  log('INFO', `${job.colaborador_nome}: preparando Adiantamento "${description}" no valor de ${Number(job.valor || 0).toFixed(2)}.`);

  await openEmployee(page, cpf);
  await openExpensesSection(page);

  const existing = await inspectExpenseDescriptions(page, [description]);
  if (existing.length) {
    const exact = verifyMovementRow(existing, job);
    if (!exact.found) {
      throw new Error('Já existe movimento com esta descrição no GRM, mas com valor divergente. Lançamento automático bloqueado para evitar duplicidade.');
    }
    await markSuccess(job, {
      ok: true,
      cpf,
      descricao: description,
      valor: Number(job.valor || 0),
      data: date,
      duplicate_guard: 'DESCRICAO_JA_EXISTIA_NO_GRM',
      criado_agora: false,
      linha_grm: exact.row.text,
      verificado_em: new Date().toISOString(),
    });
    log('SUCCESS', `${job.colaborador_nome}: adiantamento já existia no GRM; duplicidade bloqueada.`);
    return;
  }

  if (DRY_RUN) {
    await updateLaunch(job.id, {
      status: 'PENDENTE',
      iniciado_em: null,
      grm_retorno: {
        dry_run: true,
        cpf,
        descricao: description,
        valor: Number(job.valor || 0),
        data: date,
        verificado_existente: false,
      },
    });
    log('INFO', `${job.colaborador_nome}: DRY_RUN, nenhuma alteração feita.`);
    return;
  }

  await clickAddExpense(page);
  const filled = await fillExpense(page, job);
  await saveExpense(page);

  const verified = await verifyExpense(page, cpf, job);
  if (!verified.ok) {
    throw new Error(
      'GRM fechou o formulário, mas o lançamento do Adiantamento não foi localizado no Caixa '
      + 'com a Descrição e Valor esperados. Não reprocesse sem conferir o cadastro para evitar duplicidade.'
    );
  }

  await markSuccess(job, {
    ok: true,
    cpf,
    descricao: filled.description,
    valor: filled.value,
    data: filled.date,
    criado_agora: true,
    verificado_no_grm: true,
    linha_grm: verified.row?.text || null,
    verificado_em: new Date().toISOString(),
  });
  log('SUCCESS', `${job.colaborador_nome}: adiantamento lançado e verificado no GRM.`);
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  await recoverStaleProcessing();
  const jobs = await loadPendingJobs();
  if (!jobs.length) {
    log('INFO', 'Nenhum Adiantamento de uso de veículo fora do expediente pendente para lançar.');
    return;
  }

  const collaborators = await loadCollaborators();
  let browser;
  let success = 0;
  let errors = 0;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(60000);
    if (DEBUG) page.on('console', (msg) => log('BROWSER', msg.text()));
    await login(page);

    for (const job of jobs) {
      try {
        await processJob(page, job, collaborators);
        success += 1;
      } catch (error) {
        errors += 1;
        const shot = await screenshot(page, job, 'erro');
        try { await markError(job, error, shot); } catch (markErrorFailure) {
          log('ERROR', `Falha ao registrar erro do lançamento ${job.id}: ${markErrorFailure.message}`);
        }
        log('ERROR', `${job.colaborador_nome}: ${error.message}`);
        try { await closeDialogs(page); } catch (_) {}
      }
    }
  } finally {
    if (browser) await browser.close();
    await enqueueFollowupIfNeeded();
  }

  log(errors ? 'WARN' : 'SUCCESS', 'Agente de Adiantamento de uso de veículo fora do expediente concluído.', {
    processados: jobs.length,
    sucesso: success,
    erros: errors,
    dry_run: DRY_RUN,
  });

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log('ERROR', `Erro fatal no agente de Adiantamento de uso de veículo fora do expediente: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
