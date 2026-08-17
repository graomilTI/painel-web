#!/usr/bin/env node
'use strict';

/*
 * GRM Server - LanГ§amento do BГґnus de ClassificaГ§ГЈo FOB no Caixa do colaborador.
 *
 * Fluxo confirmado para o BГґnus:
 *   FuncionГЎrio -> abrir cadastro -> Despesas -> Adicionar
 *   -> DescriГ§ГЈo / Valor / Data -> Salvar.
 *
 * A descriГ§ГЈo Г© Гєnica por competГЄncia: BГґnus de Tons <mГЄs> - <ano>.
 * Antes de adicionar, o agente procura essa descriГ§ГЈo no cadastro. Se jГЎ existir,
 * apenas confirma o lanГ§amento no Supabase e NГѓO cria uma segunda movimentaГ§ГЈo.
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
const DEBUG = String(process.env.GRM_BONUS_CAIXA_DEBUG ?? 'false').toLowerCase() === 'true';
const DRY_RUN = String(process.env.GRM_BONUS_CAIXA_DRY_RUN ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Math.min(20, Number(process.env.GRM_BONUS_CAIXA_MAX_POR_EXECUCAO || 8)));
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_BONUS_CAIXA_TIMEOUT_MS || 45000));
const SCREENSHOT_DIR = process.env.GRM_BONUS_CAIXA_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/bonus-caixa';

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

function brDateDia15() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('NГЈo foi possГ­vel calcular a data de lanГ§amento do BГґnus.');

  return `15/${month}/${year}`;
}

const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'marГ§o',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function competenceParts(job) {
  const text = String(job.competencia || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) throw new Error(`CompetГЄncia invГЎlida: ${job.competencia}`);

  const ano = match[1];
  const mesNumero = Number(match[2]);
  const mes = MESES_PT_BR[mesNumero - 1];
  if (!mes) throw new Error(`MГЄs invГЎlido na competГЄncia: ${job.competencia}`);

  return { ano, mes, mesNumero };
}

function descriptionFor(job) {
  const { ano, mes } = competenceParts(job);
  // Mesmo padrГЈo usado no fluxo manual validado no GRM.
  return `BГґnus toneladas ${mes} / ${ano}`;
}

function descriptionAliasesFor(job) {
  const { ano, mes } = competenceParts(job);
  // Inclui a descriГ§ГЈo da versГЈo anterior para bloquear duplicidade caso
  // alguma tentativa antiga tenha sido persistida pelo GRM.
  return [
    descriptionFor(job),
    `BГґnus de Tons ${mes} - ${ano}`,
  ];
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
  log('SUCCESS', 'Login no GRM concluГ­do.');
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION[ГЃA]RIOS/i.test(text) || /Nome, Email ou CPF/i.test(text);
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
  if (!ok) throw new Error('Campo de busca Nome, Email ou CPF nГЈo localizado.');
  await sleep(1200);
}

async function selectExactStaffRow(page, cpf) {
  const target = digits(cpf);
  await page.waitForFunction((targetCpf) => [...document.querySelectorAll('tr')]
    .some((row) => String(row.innerText || '').replace(/\D/g, '').includes(targetCpf)),
  { timeout: DEFAULT_TIMEOUT }, target);

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

  if (!prepared.ok) throw new Error(`FuncionГЎrio nГЈo localizado de forma Гєnica pelo CPF: ${JSON.stringify(prepared)}`);
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
    if (!clicked) throw new Error('Checkbox do funcionГЎrio desapareceu durante a seleГ§ГЈo.');
  }
  await page.waitForFunction((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const row = [...document.querySelectorAll('tr')]
      .find((el) => onlyDigits(el.innerText).includes(targetCpf));
    return row?.querySelector('input[type="checkbox"]')?.checked === true;
  }, { timeout: DEFAULT_TIMEOUT }, target);
  await sleep(250);
}

async function waitEmployeeModal(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => {
      const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      return [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
        .filter(visible)
        .some((el) => /EDITAR FUNCION[ГЃA]RIO|DESPESAS|CONFIGURAГ‡Г•ES E PERMISSГ•ES/i.test(el.innerText || ''));
    }, { timeout });
    return true;
  } catch {
    return false;
  }
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

    // O campo de busca jГЎ Г© utilizado pelo agente para pesquisar o CPF.
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
      // Somente a barra de aГ§Гµes Г  esquerda do campo de busca.
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
    // 1 lГЎpis
    // 2 XLS
    // 3 calendГЎrio
    // 4 localizaГ§ГЈo
    // 5 Caixa (Г­cone prГ©dio/museu)
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
      `BotГЈo Caixa nГЈo localizado na barra de aГ§Гµes: ${
        JSON.stringify(prepared).slice(0, 1800)
      }`
    );
  }

  log('INFO', 'BotГЈo Caixa localizado pela posiГ§ГЈo da barra.', prepared);

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

  log('INFO', 'Resultado apГіs clicar no Caixa.', DEBUG ? after : {
    urlAnterior: after.urlAnterior,
    urlAtual: after.urlAtual,
    mudouUrl: after.mudouUrl,
    dialogs: after.dialogs,
  });

  // NГЈo falha aqui apenas porque nГЈo abriu modal.
  // O Caixa pode abrir tela, drawer ou outro componente.
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
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();

    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    };

    document
      .querySelectorAll('[data-grm-bonus-expenses]')
      .forEach((el) => delete el.dataset.grmBonusExpenses);

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )].filter(visible);

    const scope = dialogs[dialogs.length - 1] || document.body;

    const clickableSelector = [
      'button',
      '[role="button"]',
      '[role="tab"]',
      'a',
      '.v-tab',
      '.v-list-item',
      '.v-expansion-panel-title',
    ].join(',');

    // 1. Controle clicГЎvel cujo prГіprio texto Г© EXATAMENTE DESPESAS.
    const direct = [...scope.querySelectorAll(clickableSelector)]
      .filter(visible)
      .filter((el) => !['I', 'SVG', 'PATH'].includes(el.tagName))
      .filter((el) => {
        const text = normalize(el.innerText || el.textContent || '');
        return text === 'DESPESAS' || text === 'DESPESA';
      });

    let clickable = direct[direct.length - 1] || null;

    // 2. Procura um rГіtulo folha exatamente DESPESAS e sobe atГ© o controle.
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

        if (
          parent &&
          visible(parent) &&
          !['I', 'SVG', 'PATH'].includes(parent.tagName)
        ) {
          clickable = parent;
          break;
        }
      }
    }

    if (!clickable) {
      return {
        ok: false,
        encontrados: [...scope.querySelectorAll('*')]
          .filter(visible)
          .map((el) => normalize(el.textContent || ''))
          .filter((text) => text === 'DESPESAS' || text === 'DESPESA')
          .slice(0, 20),
      };
    }

    clickable.dataset.grmBonusExpenses = '1';

    return {
      ok: true,
      selector: '[data-grm-bonus-expenses="1"]',
      tag: clickable.tagName,
      texto: normalize(clickable.innerText || clickable.textContent || ''),
      html: String(clickable.outerHTML || '').slice(0, 700),
    };
  });

  if (!found?.ok) {
    throw new Error(
      `SeГ§ГЈo DESPESAS exata nГЈo localizada no cadastro. DiagnГіstico: ${
        JSON.stringify(found).slice(0, 1200)
      }`
    );
  }

  log('INFO', 'Controle correto de Despesas localizado.', found);

  await page.click(found.selector);
  await sleep(1000);
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

function brMoneyText(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function verifyMovementRow(rows, job, description) {
  const expectedDescription = norm(description);
  const expectedCategory = norm('BГґnus e PremiaГ§Гµes');
  const expectedValue = brMoneyText(job.valor);
  const candidates = (rows || []).filter((row) =>
    norm(row.text).includes(expectedDescription)
  );

  const exact = candidates.find((row) => {
    const cells = row.cells || [];
    const hasCategory = cells.some((cell) => norm(cell) === expectedCategory)
      || norm(row.text).includes(expectedCategory);
    const hasValue = cells.some((cell) => String(cell).includes(expectedValue))
      || String(row.text).includes(expectedValue);
    const hasDocumentZero = cells.some((cell) => String(cell).trim() === '0');
    return hasCategory && hasValue && hasDocumentZero;
  });

  return {
    found: candidates.length > 0,
    exact: !!exact,
    exactRow: exact || null,
    candidates,
  };
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
      `BotГЈo para adicionar nova despesa nГЈo localizado. Controles: ${
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

  log('INFO', 'FormulГЎrio de nova despesa aberto.', prepared);
}
async function markField(page, semantic) {
  const selector = await page.evaluate((fieldType) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const patterns = {
      descricao: /DESCRI[CГ‡][AГѓ]O|DESCRICAO|MOTIVO|OBSERVA[CГ‡][AГѓ]O|OBSERVACAO/,
      valor: /^VALOR$|VALOR DA DESPESA|VALOR TOTAL|R\$/,
      data: /^DATA$|DATA DA DESPESA|DATA DO LAN[CГ‡]AMENTO/,
      documento: /^N(\.|Вє|В°)?\s*(DO\s*)?DOCUMENTO$|NUMERO DO DOCUMENTO|N DOCUMENTO/,
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
        input = host?.querySelectoЉ	Ъ[њ]››Э
Э\OHЪXЪШ›Ю—JK^\™XIКHќ[В€B€Y€
[њ]	‰€љ\ЪX›J[њ]
JHВ€[њ]™]\Щ]™Ь›P›Ыќ\СљY[HљY[\NВ€™]\›€Щ]KYЬ›KX›Ыќ\ЛYљY[H‰ЩљY[\_H—XВ€B€B‚€ЫЫњЭ[њ]ИHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]››Э
Э\OHЪXЪШ›Ю—JK^\™XIКWK™љ[\Љљ\ЪX›JNВ€ЫЫњЭ[њ]H[њ]Л™љ[™

[
HO€]\›‹ќ\Э
›Ь›X[^™JВ€[™Щ]]љXќ]J	ЬXЩZЫ\‰КK[™Щ]]љXќ]J	Ы[YIКK[љY[™Щ]]љXќ]J	Ш\љXK[X™[	КK€K™љ[\Љ›ЫЫX[ЉKљ›Ъ[Љ	И	КJJJNВ€Y€
Z[њ]
H™]\›€ќ[В€[њ]™]\Щ]™Ь›P›Ыќ\СљY[HљY[\NВ€™]\›€Щ]KYЬ›KX›Ыќ\ЛYљY[H‰ЩљY[\_H—XВ€KЩ[X[ќXКNВ‚€Y€
\Щ[XЭЬЉH›ЭИ™]И\њ›ЬЉШ[\И	ЬЩ[X[ќXЯHH\Ь\ШH°иЫИШШ[^YЛ
NВ€™]\›€Щ[XЭЬЋВџB‚\Ю[Иќ[Э[Ы€\QљY[
YЩKЩ[XЭЬ‹[YJHВ€]ШZ]YЩKЫXЪКЩ[XЭЬ‹ИЫXЪРЫЭ[ќ€ИJNВ€]ШZ]YЩKљЩ^X›Ш\™™ЭЫЉ	РЫЫќ›Ы	КNВ€ћHИ]ШZ]YЩKљЩ^X›Ш\™њ™\ЬК	РIКNИHљ[[HИ]ШZ]YЩKљЩ^X›Ш\™ќ\
	РЫЫќ›Ы	КNИB€]ШZ]YЩKљЩ^X›Ш\™њ™\ЬК	РXЪЬЬXЩIКNВ€]ШZ]YЩKљЩ^X›Ш\™ќ\JЭљ[™К[YJKИ[^N€ЊJNВ€]ШZ]YЩKљЩ^X›Ш\™њ™\ЬК	ХX‰КNВ€]ШZ]ЫY\
ЌL
NВџB‚™ќ[Э[Ы€\њЩPњ›ЭЬЩ\“ќ[X™\Љ[YJHВ€ЫЫњЭ]ИHЭљ[™К[YHПИ	ЙКKќљ[J
NВ€Y€
\]КH™]\›€В€ЫЫњЭ›Ь›X[^™YH]Лљ[ЫY\К	Л	КHИ]Лњ™\XЩJЧ‹ЩЛ	ЙКKњ™\XЩJ	Л	Л	Л‰КH€]ОВ€ЫЫњЭ€Hќ[X™\Љ›Ь›X[^™Yњ™\XЩJЦЧЊNK‹WKЩЛ	ЙКJNВ€™]\›€ќ[X™\‹љ\Сљ[љ]JЉHИ€€ВџB‚\Ю[Иќ[Э[Ы€ЪЫЬЩS[Э™[Y[ќ\JYЩK^XЭYH	РЫЫ\›Э[ќIКHВ€ЫЫњЭЩ[XЭЬ€H]ШZ]YЩK™][X]J

HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКK››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКKќХ\\ђШ\ЩJ
Kќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IИ	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ€ЫЫњЭX[ЩЬИHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
	ЦЬ›ЫOH™X[ЩИ—Kќ‹[Э™\›^WЧШЫЫќ[ќќ‹YX[ЩЛШЫ\ЬКЏH›[Щ[—KШЫ\ЬКЏH™X[ЩИ—IКWB€™љ[\Љљ\ЪX›JB€™љ[\Љ
[
HO€РQPТSУђT€SХ’SQS•ЛЪKќ\Э
[љ[›™\•^	ЙКJNВ€ЫЫњЭШЫЬHHX[ЩЬЛњЫЬќ

KЉHO€‹њ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]	КK›[™ЭHKњ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]	КK›[™Э
VМNВ€Y€
\ШЫЬJH™]\›€ќ[В€ЫЫњЭX™[ИHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	ЫX™[ќ‹[X™[ШЫ\ЬКЏH›X™[—IКWB€™љ[\Љљ\ЪX›JB€™љ[\Љ
[
HO€›Ь›X[^™J[ќ^ЫЫќ[ќ
HOOH	ХTЙКNВ€]ЫЫќ›ЫHX™[ЦМOЛЫЬЩ\Э
	Лќ‹Z[њ]ќ‹YљY[Ь›ЫOHЫЫX›Ш›Ю—KШЫ\ЬКЏH™љY[—IКNВ€Y€
XЫЫќ›Ы
HВ€ЫЫќ›ЫHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	ЦЬ›ЫOHЫЫX›Ш›Ю—Kќ‹\Щ[XЭќ‹X]]ШЫЫ\]IКWB€™љ[\Љљ\ЪX›JB€™љ[™

[
HO€РQPS•SQS•ЯУУT“ХђS•KЛќ\Э
›Ь›X[^™J[љ[›™\•^[ќ^ЫЫќ[ќ
JJNВ€B€ЫЫњЭЫXЪШX›HHЫЫќ›ЫЛ›X]Ъ\К	Ъ[њ]ќ]Ы‹Ь›ЫOHЫЫX›Ш›Ю—IКB€ИЫЫќ›Ы€€ЫЫќ›ЫЛњ]Y\ћTЩ[XЭЬЉ	Ъ[њ]ќ]Ы‹Ь›ЫOHЫЫX›Ш›Ю—IКHЫЫќ›ЫВ€Y€
XЫXЪШX›JH™]\›€ќ[В€ЫXЪШX›K™]\Щ]™Ь›P›Ыќ\Х\HH	МIОВ€™]\›€	ЦЩ]KYЬ›KX›Ыќ\Л]\OHЊH—IОВ€JNВ€Y€
\Щ[XЭЬЉH›ЭИ™]И\њ›ЬЉ	РШ[\И\ИИ[Эљ[Y[ќИ°иЫИШШ[^YЛ‰КNВ€]ШZ]YЩKЫXЪКЩ[XЭЬЉNВ€]ШZ]ЫY\
М
NВ€ЫЫњЭЬ[Ы€H]ШZ]YЩK™][X]J
Ш[ќY
HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКK››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКKќХ\\ђШ\ЩJ
Kќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IИ	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ€ЫЫњЭ\™Щ]H›Ь›X[^™JШ[ќY
NВ€ЫЫњЭШ[™Y]HHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
	ЦЬ›ЫOH›Ь[Ы€—Kќ‹[\ЭZ][KIКWB€™љ[\Љљ\ЪX›JB€™љ[™

[
HO€›Ь›X[^™J[љ[›™\•^[ќ^ЫЫќ[ќ
HOOH\™Щ]
NВ€Y€
XШ[™Y]JH™]\›€ќ[В€Ш[™Y]K™]\Щ]™Ь›P›Ыќ\Х\SЬ[Ы€H	МIОВ€™]\›€	ЦЩ]KYЬ›KX›Ыќ\Л]\K[Ь[ЫЏHЊH—IОВ€K^XЭY
NВ€Y€
[Ь[ЫЉH›ЭИ™]И\њ›ЬЉЬ0йриЫИ	Щ^XЭYH°иЫИШШ[^YH›ИШ[\И\Л
NВ€]ШZ]YЩKЫXЪКЬ[ЫЉNВ€]ШZ]ЫY\
ЌL
NВџB‚\Ю[Иќ[Э[Ы€ЪЫЬЩTЩ[XЭћSX™[
YЩKX™[^^XЭYЬ[ЫЉHВ€ЫЫњЭЩ[XЭЬ€H]ШZ]YЩK™][X]J
X™[Ш[ќY
HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКB€››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКB€ќХ\\ђШ\ЩJ
B€њ™\XЩJЦЧђKVЊNWJЛЩЛ	И	КB€ќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IВ€	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ€ЫЫњЭ\™Щ]H›Ь›X[^™JX™[Ш[ќY
NВ‚€ШЭ[Y[ќ€њ]Y\ћTЩ[XЭЬђ[
	ЦЩ]KYЬ›KX›Ыќ\Л\Щ[XЭYљY[IКB€™›Ь‘XXЪ

[
HO€[]H[™]\Щ]™Ь›P›Ыќ\ФЩ[XЭљY[
NВ‚€ЫЫњЭX[ЩЬИHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	ЦЬ›ЫOH™X[ЩИ—Kќ‹[Э™\›^WЧШЫЫќ[ќќ‹YX[ЩЛШЫ\ЬКЏH›[Щ[—KШЫ\ЬКЏH™X[ЩИ—IВ€
WB€™љ[\Љљ\ЪX›JB€™љ[\Љ
[
HO€РQPТSУђT€SХ’SQS•ЛЪKќ\Э
[љ[›™\•^	ЙКJB€њЫЬќ

KЉHO‚€‹њ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКK›[™Э€HKњ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКK›[™Э€
NВ€ЫЫњЭШЫЬHHX[ЩЬЦМHШЭ[Y[ќ›ЩNВ‚€ЫЫњЭX™[ИHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	ЫX™[ќ‹[X™[ШЫ\ЬКЏH›X™[—IКWB€™љ[\Љљ\ЪX›JB€™љ[\Љ
[
HO€›Ь›X[^™J[ќ^ЫЫќ[ќ	ЙКHOOH\™Щ]
NВ‚€]ЫЫќ›ЫHќ[В€›Ь€
ЫЫњЭX™[Щ€X™[КHВ€ЫЫќ›ЫHX™[ЫЬЩ\Э
	Лќ‹Z[њ]ќ‹YљY[ќ‹\Щ[XЭќ‹X]]ШЫЫ\]KШЫ\ЬКЏH™љY[—IКNВ€Y€
ЫЫќ›Ы
Hњ™XZОВ€B‚€Y€
XЫЫќ›Ы
HВ€ЫЫњЭ[њ]ИHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]Ь›ЫOHЫЫX›Ш›Ю—IКWK™љ[\Љљ\ЪX›JNВ€ЫЫќ›ЫH[њ]Л™љ[™

[
HO€В€ЫЫњЭЪYЫ]\™HH›Ь›X[^™JВ€[™Щ]]љXќ]J	Ш\љXK[X™[	КK€[™Щ]]љXќ]J	ЬXЩZЫ\‰КK€[™Щ]]љXќ]J	Ы[YIКK€K™љ[\Љ›ЫЫX[ЉKљ›Ъ[Љ	И	КJNВ€™]\›€ЪYЫ]\™HOOH\™Щ]ЪYЫ]\™Kљ[ЫY\К\™Щ]
NВ€JHќ[В€B‚€ЫЫњЭЫXЪШX›HHЫЫќ›ЫЛ›X]Ъ\К	Ъ[њ]ќ]Ы‹Ь›ЫOHЫЫX›Ш›Ю—IКB€ИЫЫќ›Ы€€ЫЫќ›ЫЛњ]Y\ћTЩ[XЭЬЉ	Ъ[њ]ќ]Ы‹Ь›ЫOHЫЫX›Ш›Ю—IКHЫЫќ›ЫВ‚€Y€
XЫXЪШX›JH™]\›€ќ[В€ЫXЪШX›K™]\Щ]™Ь›P›Ыќ\ФЩ[XЭљY[H\™Щ]В€™]\›€	ЦЩ]KYЬ›KX›Ыќ\Л\Щ[XЭYљY[IОВ€KX™[^
NВ‚€Y€
\Щ[XЭЬЉH›ЭИ™]И\њ›ЬЉШ[\И	ЫX™[^H°иЫИШШ[^YИ›И›Ь›][0и\љ[ИИФ“K
NВ€]ШZ]YЩKЫXЪКЩ[XЭЬЉNВ€]ШZ]ЫY\
НL
NВ‚€ЫЫњЭЬ[Ы€H]ШZ]YЩK™][X]J
Ш[ќY
HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКB€››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКB€ќХ\\ђШ\ЩJ
B€њ™\XЩJЧКЛЩЛ	И	КB€ќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IВ€	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ€ЫЫњЭ\™Щ]H›Ь›X[^™JШ[ќY
NВ‚€ШЭ[Y[ќ€њ]Y\ћTЩ[XЭЬђ[
	ЦЩ]KYЬ›KX›Ыќ\Л\Щ[XЭ[Ь[Ы—IКB€™›Ь‘XXЪ

[
HO€[]H[™]\Щ]™Ь›P›Ыќ\ФЩ[XЭЬ[ЫЉNВ‚€ЫЫњЭШ[™Y]\ИHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	ЦЬ›ЫOH›Ь[Ы€—Kќ‹[\ЭZ][KIВ€
WB€™љ[\Љљ\ЪX›JB€™љ[\Љ
[
HO€›Ь›X[^™J[љ[›™\•^[ќ^ЫЫќ[ќ
HOOH\™Щ]
NВ‚€ЫЫњЭШ[™Y]HHШ[™Y]\ЦШШ[™Y]\Л›[™ЭHWNВ€Y€
XШ[™Y]JH™]\›€ќ[В€Ш[™Y]K™]\Щ]™Ь›P›Ыќ\ФЩ[XЭЬ[Ы€H	МIОВ€™]\›€	ЦЩ]KYЬ›KX›Ыќ\Л\Щ[XЭ[Ь[ЫЏHЊH—IОВ€K^XЭYЬ[ЫЉNВ‚€Y€
[Ь[ЫЉH›ЭИ™]И\њ›ЬЉ€Ь0йриЫИ	Щ^XЭYЬ[ЫџH°иЫИШШ[^YH›ИШ[\И	ЫX™[^K€
NВ‚€]ШZ]YЩKЫXЪКЬ[ЫЉNВ€]ШZ]ЫY\
М
NВџB‚\Ю[Иќ[Э[Ы€љ[^[њЩJYЩK›Ш‹\ШЬљ\[ЫЉHВ€]ШZ]ЪЫЬЩS[Э™[Y[ќ\JYЩK	РЫЫ\›Э[ќIКNВ‚€ЛИ›ИФ“H\Э\ИШ[\ЬИ\\™XЩ[H]X[™ИИ[Эљ[Y[ќИ0кHЫЫ\›Э[ќK‚€]ШZ]ЪЫЬЩTЩ[XЭћSX™[
YЩK	Х\ИH\Ь\ШIЛ	Р°нќ\ИH™[ZXpйрнY\ЙКNВ€]ШZ]ЪЫЬЩTЩ[XЭћSX™[
YЩK	Х\ИHШЭ[Y[ќЙЛ	РЭ\ЫHљ\ШШ[	КNВ‚€ЫЫњЭ\ШЬљ\[Ы‘љY[H]ШZ]X\љСљY[
YЩK	Щ\ШЬљXШ[ЙКNВ€ЫЫњЭ[YQљY[H]ШZ]X\љСљY[
YЩK	Э[Ь‰КNВ€ЫЫњЭ]QљY[H]ШZ]X\љСљY[
YЩK	Щ]IКNВ€ЫЫњЭШЭ[Y[ќљY[H]ШZ]X\љСљY[
YЩK	ЩШЭ[Y[ќЙКNВ‚€]ШZ]\QљY[
YЩK\ШЬљ\[Ы‘љY[\ШЬљ\[ЫЉNВ€]ШZ]\QљY[
YЩKШЭ[Y[ќљY[	М	КNВ‚€ЫЫњЭ^XЭY[YHHќ[X™\Љ›Ш‹ќ[Ь€
NВ€ЫЫњЭ[YPШ[™Y]\ИHВ€^XЭY[YKќСљ^Y
ЉKњ™\XЩJ	Л‰Л	Л	КK€Эљ[™КX]њ›Э[™
^XЭY[YH
€L
JK€^XЭY[YKќСљ^Y
ЉK€NВ€][YSЪИH[ЩNВ€›Ь€
ЫЫњЭШ[™Y]HЩ€[YPШ[™Y]\КHВ€]ШZ]\QљY[
YЩK[YQљY[Ш[™Y]JNВ€ЫЫњЭШњЩ\ќ™YH]ШZ]YЩK‰][
€[YQљY[€
[
HO€[ќ[YH[™Щ]]љXќ]J	Э[YIКH	ЙВ€
NВ€Y€
X]XњК\њЩPњ›ЭЬЩ\“ќ[X™\ЉШњЩ\ќ™Y
HH^XЭY[YJHЊJHВ€[YSЪИHќYNВ€њ™XZОВ€B€B€Y€
][YSЪКHВ€›ЭИ™]И\њ›ЬЉ€[Ь€И°нќ\И°иЫИ\›X[™XЩ]H›И›Ь›][0и\љ[ИЫЫ[И	Щ^XЭY[YKќСљ^Y
Љ_K€
NВ€B‚€ЫЫњЭ][Ъ]HHњ‘]QXLMJ
NВ€]ШZ]\QљY[
YЩK]QљY[][Ъ]JNВ‚€ЫЫњЭШњЩ\ќ™YH]ШZ]YЩK™][X]J
Щ[XЭЬњКHO€В€ЫЫњЭ[YHH
Щ[XЭЬЉHO€В€ЫЫњЭ[HШЭ[Y[ќњ]Y\ћTЩ[XЭЬЉЩ[XЭЬЉNВ€™]\›€Эљ[™К[Лќ[YH[Л™Щ]]љXќ]OЛЉ	Э[YIКH	ЙКKќљ[J
NВ€NВ€ЫЫњЭ›Ь›HHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	ЦЬ›ЫOH™X[ЩИ—Kќ‹[Э™\›^WЧШЫЫќ[ќќ‹YX[ЩЛШЫ\ЬКЏH›[Щ[—KШЫ\ЬКЏH™X[ЩИ—IВ€
WK™љ[™

[
HO€РQPТSУђT€SХ’SQS•ЛЪKќ\Э
[љ[›™\•^	ЙКJNВ€™]\›€В€\ШЬљXШ[О€[YJЩ[XЭЬњЛ™\ШЬљ\[ЫЉK€ШЭ[Y[ќО€[YJЩ[XЭЬњЛ™ШЭ[Y[ќ
K€^С›Ь›][\љ[О€Эљ[™К›Ь›OЛљ[›™\•^	ЙКKњ™\XЩJЧКЛЩЛ	И	КKќљ[J
K€NВ€KВ€\ШЬљ\[ЫЋ€\ШЬљ\[Ы‘љY[€ШЭ[Y[ќ€ШЭ[Y[ќљY[€JNВ‚€Y€
›Ь›JШњЩ\ќ™Y™\ШЬљXШ[КHOOH›Ь›J\ШЬљ\[ЫЉJHВ€›ЭИ™]И\њ›ЬЉ\ШЬљpйриЫИ]™\™Щ[ќH›И›Ь›][0и\љ[О€	ЫШњЩ\ќ™Y™\ШЬљXШ[ЯX
NВ€B€Y€
Эљ[™КШњЩ\ќ™Y™ШЭ[Y[ќКKќљ[J
HOOH	М	КHВ€›ЭИ™]И\њ›ЬЉ‹€ШЭ[Y[ќИ]™\™Щ[ќH›И›Ь›][0и\љ[О€	ЫШњЩ\ќ™Y™ШЭ[Y[ќЯX
NВ€B€Y€
[›Ь›JШњЩ\ќ™Yќ^С›Ь›][\љ[КKљ[ЫY\К›Ь›J	Р°нќ\ИH™[ZXpйрнY\ЙКJJHВ€›ЭИ™]И\њ›ЬЉ	Х\ИH\Ь\ШH°иЫИ\›X[™XЩ]HЫЫ[И°нќ\ИH™[ZXpйрнY\Л‰КNВ€B€Y€
[›Ь›JШњЩ\ќ™Yќ^С›Ь›][\љ[КKљ[ЫY\К›Ь›J	РЭ\ЫHљ\ШШ[	КJJHВ€›ЭИ™]И\њ›ЬЉ	Х\ИHШЭ[Y[ќИ°иЫИ\›X[™XЩ]HЫЫ[ИЭ\ЫHљ\ШШ[‰КNВ€B€Y€
[›Ь›JШњЩ\ќ™Yќ^С›Ь›][\љ[КKљ[ЫY\К›Ь›J	РЫЫ\›Э[ќIКJJHВ€›ЭИ™]И\њ›ЬЉ	Х\ИИ[Эљ[Y[ќИ°иЫИ\›X[™XЩ]HЫЫ[ИЫЫ\›Э[ќK‰КNВ€B‚€™]\›€И]N€][Ъ]K[YN€^XЭY[YHNВџB‚\Ю[Иќ[Э[Ы€Ш]™Q^[њЩJYЩJHВ€ЫЫњЭ™\\™YH]ШZ]YЩK™][X]J

HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКB€››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКB€ќХ\\ђШ\ЩJ
B€ќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IВ€	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ‚€ЫЫњЭX[ЩЬИHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	ЦЬ›ЫOH™X[ЩИ—Kќ‹[Э™\›^WЧШЫЫќ[ќќ‹YX[ЩЛШЫ\ЬКЏH›[Щ[—KШЫ\ЬКЏH™X[ЩИ—IВ€
WK™љ[\Љљ\ЪX›JNВ‚€ЫЫњЭ›Ь›QX[ЩЬИHX[ЩЬВ€™љ[\Љ
[
HO€РQPТSУђT€SХ’SQS•ЛЪKќ\Э
[љ[›™\•^	ЙКJB€™љ[\Љ
[
HO€[њ]Y\ћTЩ[XЭЬЉ	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКJB€њЫЬќ

KЉHO‚€‹њ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКK›[™Э€HKњ]Y\ћTЩ[XЭЬђ[
	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКK›[™Э€
NВ‚€ЫЫњЭШЫЬHH›Ь›QX[ЩЬЦМHX[ЩЬЦЩX[ЩЬЛ›[™ЭHWHШЭ[Y[ќ›ЩNВ€ЫЫњЭШ]™HHЛ‹‹њШЫЬKњ]Y\ћTЩ[XЭЬђ[
	Шќ]Ы‹Ь›ЫOHќ]Ы€—IКWB€™љ[\Љљ\ЪX›JB€™љ[™

ќ]ЫЉHO€›Ь›X[^™Jќ]Ы‹ќ^ЫЫќ[ќ
HOOH	ФРSђT‰И	‰€Xќ]Ы‹™\ШX›Y
NВ‚€Y€
\Ш]™JH™]\›€ќ[В€Ш]™K™]\Щ]™Ь›P›Ыќ\ФШ]™Q^[њЩHH	МIОВ‚€™]\›€В€Щ[XЭЬЋ€	ЦЩ]KYЬ›KX›Ыќ\Л\Ш]™KY^[њЩOHЊH—IЛ€NВ€JNВ‚€Y€
\™\\™Y
H›ЭИ™]И\њ›ЬЉ	Р›Э0иЫИРSђT€И[Эљ[Y[ќИ°иЫИШШ[^YЛ‰КNВ‚€]ШZ]YЩKЫXЪК™\\™YњЩ[XЭЬЉNВ€]ШZ]ЫY\
M
NВ‚€ЫЫњЭЫЫ™љ\›X][Ы€H]ШZ]YЩK™][X]J

HO€В€ЫЫњЭ›Ь›X[^™HH
[YJHO€Эљ[™К[YH	ЙКB€››Ь›X[^™J	У‘‘	КB€њ™\XЩJЦЧLМWLН™—KЩЛ	ЙКB€ќХ\\ђШ\ЩJ
B€њ™\XЩJЧКЛЩЛ	И	КB€ќљ[J
NВ€ЫЫњЭљ\ЪX›HH
[
HO€HY[	‰€[™Щ]ЫY[ќ™XЭК
K›[™Э€€	‰€Щ]ЫЫ\]YЭ[J[
K™\Ь^HOOH	Ы›Ы™IВ€	‰€Щ]ЫЫ\]YЭ[J[
Kќљ\ЪXљ[]HOOH	ЪY[‰ОВ‚€ЫЫњЭ›Ь›TЭ[Ь[€HЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	ЦЬ›ЫOH™X[ЩИ—Kќ‹[Э™\›^WЧШЫЫќ[ќќ‹YX[ЩЛШЫ\ЬКЏH›[Щ[—KШЫ\ЬКЏH™X[ЩИ—IВ€
WB€™љ[\Љљ\ЪX›JB€њЫЫYJ
[
HO‚€РQPТSУђT€SХ’SQS•ЛЪKќ\Э
[љ[›™\•^	ЙКB€	‰€[њ]Y\ћTЩ[XЭЬЉ	Ъ[њ]^\™XKЩ[XЭЬ›ЫOHЫЫX›Ш›Ю—IКB€
NВ‚€ЫЫњЭY\ЬШYЩ\ИHЛ‹‹™ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
€	Лќ‹[Y\ЬШYЩ\ЧЧЫY\ЬШYЩKќ‹X[\ќЬ›ЫOH[\ќ—Kќ‹\ЫXЪШ\‹ќ‹\ЫXЪШ\—ЧШЫЫќ[ќ	В€
WB€™љ[\Љљ\ЪX›JB€›X\

[
HO€Эљ[™К[љ[›™\•^[ќ^ЫЫќ[ќ	ЙКKњ™\XЩJЧКЛЩЛ	И	КKќљ[J
JB€™љ[\Љ›ЫЫX[ЉB€њЫXЩJLLЉNВ‚€ЫЫњЭЭXШЩ\ЬФ]\›€HФ‘QТTХ“ЛЉђРQTХђQЉ”ХPСTФЯРQTХђQЉ”ХPСTФЯХPСTФУЯРS“ЯРSђ_Ф’PQЯQPТSУђQЛОВ€ЫЫњЭ\њ›Ь”]\›€HСT”“ЯР”’QРUS•ђSQ‘QSђТ_СSPТSУ‘_ђS_ђSИ“ТHРQTХђQ°аУИ“ТHРQTХђQОВ‚€]\ЭЪYЫ[Hќ[В€Y\ЬШYЩ\Л™›Ь‘XXЪ

\ЩЛ[™^
HO€В€ЫЫњЭ›Ь›X[^™YH›Ь›X[^™J\ЩКNВ€Y€
\њ›Ь”]\›‹ќ\Э
›Ь›X[^™Y
JHВ€\ЭЪYЫ[HИ\N€	Щ\њ›Ь‰ЛY\ЬШYЩN€\ЩЛ[™^NВ€B€Y€
ЭXШЩ\ЬФ]\›‹ќ\Э
›Ь›X[^™Y
H	‰€KУђSЯ°аУЯT”“ЯђSKЛќ\Э
›Ь›X[^™Y
JHВ€\ЭЪYЫ[HИ\N€	ЬЭXШЩ\ЬЙЛY\ЬШYЩN€\ЩЛ[™^NВ€B€JNВ‚€™]\›€В€›Ь›TЭ[Ь[‹€Y\ЬШYЩ\Л€ЭXШЩ\ЬУY\ЬШYЩN€\ЭЪYЫ[Лќ\HOOH	ЬЭXШЩ\ЬЙИИ\ЭЪYЫ[›Y\ЬШYЩH€ќ[€\њ›Ь“Y\ЬШYЩN€\ЭЪYЫ[Лќ\HOOH	Щ\њ›Ь‰ИИ\ЭЪYЫ[›Y\ЬШYЩH€ќ[€ЪYЫ[\N€\ЭЪYЫ[Лќ\Hќ[€NВ€JNВ‚€ЛИИФ“HX[ќ0к[HИ›Ь›][0и\љ[ИX™\ќИ[H[Э[X\И™\њрнY\ИY\Ы[И\0мЬИЬ]\‹‚€ЛИHY[њШYЩ[HЩљXЪX[”™YЪ\Э›ИШY\ЭYЛ‹‹€ЫЫHЭXЩ\ЬЫИ€0кHЫЫ™љ\›XpйриЫВ€ЛИЭYљXЪY[ќH\HЩYЭZ\€0и™\љYљXШpйриЫИИ[Эљ[Y[ќИ›ИШZ^K‚€Y€
ЫЫ™љ\›X][Ы‹њЪYЫ[\HOOH	ЬЭXШЩ\ЬЙКHВ€ЩК	ФХPРСTФЙЛ	СФ“HЫЫ™љ\›[ЭHИШY\Э›ИИ[Эљ[Y[ќЛ‰ЛЫЫ™љ\›X][ЫЉNВ€™]\›€И‹‹ЫЫ™љ\›X][Ы‹ЫЫ™љ\›YYћN€	СФ“WФХPРСTФЧУQTФРQСIИNВ€B‚€Y€
ЫЫ™љ\›X][Ы‹њЪYЫ[\HOOH	Щ\њ›Ь‰КHВ€›ЭИ™]И\њ›ЬЉФ“H™XЭ\ЫЭHИШ[[Y[ќИИ°нќ\О€	ШЫЫ™љ\›X][Ы‹™\њ›Ь“Y\ЬШYЩ_X
NВ€B‚€Y€
ЫЫ™љ\›X][Ы‹™›Ь›TЭ[Ь[ЉHВ€›ЭИ™]И\њ›ЬЉ€Ф“H°иЫИЫЫ™љ\›[ЭHИШ[[Y[ќИИ°нќ\Л€
И
ЫЫ™љ\›X][Ы‹›Y\ЬШYЩ\Л›[™Э€ИY[њШYЩ[њО€	ШЫЫ™љ\›X][Ы‹›Y\ЬШYЩ\Лљ›Ъ[Љ	И	КKњЫXЩJLЊ
_X€€	ИИ›Ь›][0и\љ[И\›X[™XЩ]HX™\ќИ\0мЬИЫXШ\€[HШ[\€H™[љ[XHY[њШYЩ[HHЭXЩ\ЬЫИ›ЪH^XљYK‰КB€
NВ€B‚€ЩК	ТS‘“ЙЛ	СФ“H™XЪЭHИ›Ь›][0и\љ[ИHYXЪ[Ы\€[Эљ[Y[ќИ\0мЬИШ[\ЋИЩYЭZ[™И\H™\љYљXШpйриЫИ›ИШZ^K‰ЛЫЫ™љ\›X][ЫЉNВ€™]\›€И‹‹ЫЫ™љ\›X][Ы‹ЫЫ™љ\›YYћN€	С“Ф“WРУФСQ	ИNВџB‚\Ю[Иќ[Э[Ы€ЫЬЩQX[ЩЬКYЩJHВ€]ШZ]YЩKљЩ^X›Ш\™њ™\ЬК	С\ШШ\IКKШ]Ъ


HO€ЯJNВ€]ШZ]ЫY\
ЌL
NВџB‚\Ю[Иќ[Э[Ы€™\љYћQ^[њЩJYЩKЬ‹›Ш‹\ШЬљ\[ЫњКHВ€]ШZ]ЫЬЩQX[ЩЬКYЩJNВ€]ШZ]Ь[‘[\ЮYYJYЩKЬЉNВ‚€ЫЫњЭљ[X\ћHH\ШЬљ\[ЫњЦМNВ€]\Э›ЭЬИHЧNВ€]\Э™\љYљXШ][Ы€Hќ[В‚€ЛИИ[Эљ[Y[ќИЩH]\€[Э[њИЩYЭ[™ЬИ\H\\™XЩ\€HX™[H\0мЬИB€ЛИY[њШYЩ[HHЭXЩ\ЬЫЛ€^™[[ЬИ[ќ]]\ИЫЫY[ќHHZ]\KЩ[HШ[\‚€ЛИ›Э[Y[ќK\H°иЫИЬљX\€\XЪYYK‚€›Ь€
]][\HNИ][\HNИ][\
ПHJHВ€]ШZ]ЫY\
][\OOHHИМ€LЊ
NВ€ЫЫњЭ›ЭЬИH]ШZ][њЬXЭ^[њЩQ\ШЬљ\[ЫњКYЩK\ШЬљ\[ЫњКNВ€\Э›ЭЬИH›ЭЬОВ€ЫЫњЭ™\љYљXШ][Ы€H™\љYћS[Э™[Y[ќ›ЭК›ЭЬЛ›Ш‹љ[X\ћJNВ€\Э™\љYљXШ][Ы€H™\љYљXШ][ЫЋВ‚€Y€
™\љYљXШ][Ы‹™^XЭ
HВ€™]\›€ИЪО€ќYK›ЭО€™\љYљXШ][Ы‹™^XЭ›ЭЛ][\NВ€B‚€ЛИЩH[XH\ШЬљpйриЫИ[ќYШH^\Э\‹[H[X°к[H›Ь]YZXH\XЪYYK€\B€ЛИЫЫ™љ\›X\€ЭXЩ\ЬЫИ^YЪ[[ЬИИ[Ь€HЬИШ[\ЬИљ\рл]™Z\ИИ[Эљ[Y[ќЛ‚€Y€
›ЭЬЛ›[™Э
HВ€ЫЫњЭYШXЮQ^XЭH›ЭЬЛ™љ[™

›ЭКHO€В€ЫЫњЭЩ[ИH›ЭЛЩ[ИЧNВ€ЫЫњЭ^XЭY[YHHњ“[Ы™^U^
›Ш‹ќ[ЬЉNВ€ЫЫњЭ\РШ]YЫЬћHHЩ[ЛњЫЫYJ
Щ[
HO€›Ь›JЩ[
HOOH›Ь›J	Р°нќ\ИH™[ZXpйрнY\ЙКJB€›Ь›J›ЭЛќ^
Kљ[ЫY\К›Ь›J	Р°нќ\ИH™[ZXpйрнY\ЙКJNВ€ЫЫњЭ\Х[YHHЩ[ЛњЫЫYJ
Щ[
HO€Эљ[™КЩ[
Kљ[ЫY\К^XЭY[YJJB€Эљ[™К›ЭЛќ^
Kљ[ЫY\К^XЭY[YJNВ€ЫЫњЭ\СШЭ[Y[ќ™\›ИHЩ[ЛњЫЫYJ
Щ[
HO€Эљ[™КЩ[
Kќљ[J
HOOH	М	КNВ€™]\›€\РШ]YЫЬћH	‰€\Х[YH	‰€\СШЭ[Y[ќ™\›ОВ€JNВ€Y€
YШXЮQ^XЭ
HВ€™]\›€ИЪО€ќYK›ЭО€YШXЮQ^XЭYШXЮN€ќYK][\NВ€B€B€B‚€™]\›€В€ЪО€[ЩK€›ЭО€\Э™\љYљXШ][ЫЏЛ™^XЭ›ЭИќ[€›ЭЬО€\Э›ЭЬЛ€NВџB‚\Ю[Иќ[Э[Ы€™XЫЭ™\”Э[T›ШЩ\ЬЪ[™К
HВ€ЫЫњЭЭ]Щ™€H™]И]J]K››ЭК
HHМ
€Њ
€L
KќТTУФЭљ[™К
NВ€ЫЫњЭИ\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	Ш›Ыќ\ЧШШZ^WЫ[Ш[Y[ќЬЙКB€ќ\]JИЭ]\О€	ФS‘S•IЛ[љXЪXYЧЩ[N€ќ[\]YШ]€™]И]J
KќТTУФЭљ[™К
HJB€™\J	ЬЭ]\ЙЛ	Ф“РСTФРS‘ЙКB€›
	Ъ[љXЪXYЧЩ[IЛЭ]Щ™ЉNВ€Y€
\њ›ЬЉHЩК	ХРT“‰Л[H[И™XЭ\\\€“РСTФРS‘И[ќYЫО€	Щ\њ›Ь‹›Y\ЬШYЩ_X
NВџB‚\Ю[Иќ[Э[Ы€ШY[™[™Т›ШњК
HВ€ЫЫњЭИ]K\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	Ш›Ыќ\ЧШШZ^WЫ[Ш[Y[ќЬЙКB€њЩ[XЭ
	К‰КB€™\J	ЬЭ]\ЙЛ	ФS‘S•IКB€›Ь™\Љ	ЬЫЫXЪ]YЧЩ[IЛИ\ШЩ[™[™О€ќYHJB€›[Z]
PVФT—Ф•SЉNВ€Y€
\њ›ЬЉH›ЭИ\њ›ЬЋВ€ЫЫњЭ›ШњИH]HЧNВ€ЫЫњЭћPЫЫ\][ЩHH™]ИX\

NВ‚€›Ь€
ЫЫњЭ›Ш€Щ€›ШњКHВ€ЫЫњЭЫЫ\][ЩHHЭљ[™К›Ш‹ЫЫ\][ЪXH	ЙКKњЫXЩJL
NВ€Y€
XћPЫЫ\][ЩKљ\КЫЫ\][ЩJJHВ€ЫЫњЭИ]N€›ЩXЭ[Ы‹\њ›ЬЋ€›ЩXЭ[Ы‘\њ›Ь€HH]ШZ]Э\X\ЩB€њњК	Ш›Ыќ\ЧЬ›ЩXШ[ЧШЫЫ\][ЪXIЛИШЫЫ\][ЪXN€ЫЫ\][ЩHJNВ€Y€
›ЩXЭ[Ы‘\њ›ЬЉH›ЭИ›ЩXЭ[Ы‘\њ›ЬЋВ€ћPЫЫ\][ЩKњЩ]
ЫЫ\][ЩK™]ИX\
€
›ЩXЭ[Ы€ЧJK›X\

›ЭКHO€В€[YRЩ^J›ЭЛЫЫX›ЬYЬ€›ЭЛЫЫX›ЬYЬ—Ы›ЫYH›ЭЛ››ЫYJK€›ЭЛ€JK€
JNВ€B‚€ЫЫњЭЭ\њ™[ќHћPЫЫ\][ЩK™Щ]
ЫЫ\][ЩJK™Щ]
[YRЩ^J›Ш‹ЫЫX›ЬYЬ—Ы›ЫYJJNВ€Y€
XЭ\њ™[ќ›Ь›JЭ\њ™[ќњЭ]\КHOOH	РTЙКHВ€›ЭИ™]И\њ›ЬЉ€°нќ\И]X[°иЫИ\Э0иH\И\H	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_HHЫЫ\]0к›ЪXH	ШЫЫ\][Щ_K€
NВ€B‚€ЫЫњЭЭ\њ™[ќЫњИHќ[X™\ЉЭ\њ™[ќќЫњИ
NВ€ЫЫњЭЭ\њ™[ќ[YHHќ[X™\ЉЭ\њ™[ќќ[Ь€
NВ€Y€
€X]XњКќ[X™\Љ›Ш‹ќЫњИ
HHЭ\њ™[ќЫњКH€ЊB€X]XњКќ[X™\Љ›Ш‹ќ[Ь€
HHЭ\њ™[ќ[YJH€ЊB€
HВ€ЫЫњЭИ\њ›ЬЋ€™Yњ™\Ъ\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	Ш›Ыќ\ЧШШZ^WЫ[Ш[Y[ќЬЙКB€ќ\]JВ€ЫњО€Э\њ™[ќЫњЛ€[ЬЋ€Э\њ™[ќ[YK€\]YШ]€™]И]J
KќТTУФЭљ[™К
K€JB€™\J	ЪY	Л›Ш‹љY
B€™\J	ЬЭ]\ЙЛ	ФS‘S•IКNВ€Y€
™Yњ™\Ъ\њ›ЬЉH›ЭИ™Yњ™\Ъ\њ›ЬЋВ€ЩК	ТS‘“ЙЛ	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€љ[H]X[^YHЫЫHH›ЩpйриЫИљYЩ[ќKВ€ЫњЧШ[ќ\љ[ЬЋ€ќ[X™\Љ›Ш‹ќЫњИ
K€ЫњЧШ]X[€Э\њ™[ќЫњЛ€[Ь—Ш[ќ\љ[ЬЋ€ќ[X™\Љ›Ш‹ќ[Ь€
K€[Ь—Ш]X[€Э\њ™[ќ[YK€JNВ€›Ш‹ќЫњИHЭ\њ™[ќЫњОВ€›Ш‹ќ[Ь€HЭ\њ™[ќ[YNВ€B€B‚€™]\›€›ШњОВџB‚\Ю[Иќ[Э[Ы€ШYЫЫX›Ь]ЬњК
HВ€ЫЫњЭИ]K\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	ЭќЧШЫЫX›ЬYЬ™\ЧШ]XZ\ЙКB€њЩ[XЭ
	Ы›ЫYKЬ‹]]›ЛЪ]XXШ[ЙКB€›[Z]
Њ
NВ€Y€
\њ›ЬЉH›ЭИ\њ›ЬЋВ‚€ЫЫњЭX\H™]ИX\

NВ€›Ь€
ЫЫњЭ›ЭИЩ€]HЧJHВ€ЫЫњЭЩ^HH[YRЩ^J›ЭЛ››ЫYJNВ€ЫЫњЭЬ€HYЪ]К›ЭЛЬЉNВ€Y€
ZЩ^HXЬЉHЫЫќ[ќYNВ€Y€
[X\љ\КЩ^JJHX\њЩ]
Щ^KЧJNВ€ЫЫњЭ\ЭHX\™Щ]
Щ^JNВ€Y€
[\ЭњЫЫYJ
][JHO€][KЬ€OOHЬЉJH\Эњ\Ъ
И‹‹њ›ЭЛЬ€JNВ€B€™]\›€X\ВџB‚™ќ[Э[Ы€™\ЫЫ™PЬЉ›Ш‹ЫЫX›Ь]ЬњКHВ€ЫЫњЭX]Ъ\ИHЫЫX›Ь]ЬњЛ™Щ]
[YRЩ^J›Ш‹ЫЫX›ЬYЬ—Ы›ЫYJJHЧNВ€ЫЫњЭXЭ]™HHX]Ъ\Л™љ[\Љ
][JHO€][K]]›ИOOH[ЩH	‰€KТSђUUџTУQЛЪKќ\Э
Эљ[™К][KњЪ]XXШ[И	ЙКJJNВ€ЫЫњЭ™Y™\њ™YHXЭ]™K›[™ЭИXЭ]™H€X]Ъ\ОВ€Y€
™Y™\њ™Y›[™ЭOOHJHВ€›ЭИ™]И\њ›ЬЉФ€°иЫИ™\ЫЫљYИH›Ь›XH0о›љXШH\H	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€	Ь™Y™\њ™Y›[™ЭHЫЬњ™\ЬЫ™0к›ЪXJКK
NВ€B€™]\›€™Y™\њ™YМKЬЋВџB‚\Ю[Иќ[Э[Ы€\]S][Ъ
Y]Ъ
HВ€ЫЫњЭИ\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	Ш›Ыќ\ЧШШZ^WЫ[Ш[Y[ќЬЙКB€ќ\]JИ‹‹њ]Ъ\]YШ]€™]И]J
KќТTУФЭљ[™К
HJB€™\J	ЪY	ЛY
NВ€Y€
\њ›ЬЉH›ЭИ\њ›ЬЋВџB‚\Ю[Иќ[Э[Ы€X\љФ›ШЩ\ЬЪ[™К›ШЉHВ€]ШZ]\]S][Ъ
›Ш‹љYВ€Э]\О€	Ф“РСTФРS‘ЙЛ€[ќ]]\О€ќ[X™\Љ›Ш‹ќ[ќ]]\И
H
ИK€[[[ЧЩ\њ›О€ќ[€[љXЪXYЧЩ[N€™]И]J
KќТTУФЭљ[™К
K€›ШЩ\ЬШYЧЩ[N€ќ[€JNВџB‚\Ю[Иќ[Э[Ы€X\љФЭXШЩ\ЬК›Ш‹^[ШY
HВ€]ШZ]\]S][Ъ
›Ш‹љYВ€Э]\О€	УSђРQЙЛ€[[[ЧЩ\њ›О€ќ[€›ШЩ\ЬШYЧЩ[N€™]И]J
KќТTУФЭљ[™К
K€Ь›WЬ™]Ь››О€^[ШY€JNВџB‚\Ю[Иќ[Э[Ы€X\љС\њ›ЬЉ›Ш‹\њ›Ь‹ШЬ™Y[њЪЭ]
HВ€]ШZ]\]S][Ъ
›Ш‹љYВ€Э]\О€	СT”“ЙЛ€[[[ЧЩ\њ›О€Эљ[™К\њ›ЬЏЛ›Y\ЬШYЩH\њ›ЬЉKњЫXЩJ
K€›ШЩ\ЬШYЧЩ[N€™]И]J
KќТTУФЭљ[™К
K€Ь›WЬ™]Ь››О€В€ЪО€[ЩK€\њ›О€Эљ[™К\њ›ЬЏЛ›Y\ЬШYЩH\њ›ЬЉK€ЭXЪО€Эљ[™К\њ›ЬЏЛњЭXЪИ	ЙКKњЫXЩJ
K€ШЬ™Y[њЪЭЬ]€ШЬ™Y[њЪЭ]ќ[€K€JNВџB‚\Ю[Иќ[Э[Ы€[њ]Y]YQ›ЫЭЭ\Y“™YYY

HВ€ЫЫњЭИ]N€™[XZ[љ[™Л\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	Ш›Ыќ\ЧШШZ^WЫ[Ш[Y[ќЬЙКB€њЩ[XЭ
	ЪY	КB€™\J	ЬЭ]\ЙЛ	ФS‘S•IКB€›[Z]
JNВ€Y€
\њ›Ь€\™[XZ[љ[™ПЛ›[™Э
H™]\›ЋВ‚€ЫЫњЭИ]N€]Y]YY\њ›ЬЋ€]Y]YY\њ›Ь€HH]ШZ]Э\X\ЩB€™њ›ЫJ	ЩЬ›WЬЮ[ЧЪ›ШњЙКB€њЩ[XЭ
	ЪY	КB€™\J	ШYЩ[ќWЪY	Л	ЬЮ[ЛX›Ыќ\ЛXШZ^IКB€™\J	ЬЭ]\ЙЛ	Ь[™[ќIКB€›[Z]
JNВ€Y€
]Y]YY\њ›Ь€]Y]YYЛ›[™Э
H™]\›ЋВ‚€ЫЫњЭИ\њ›ЬЋ€[њЩ\ќ\њ›Ь€HH]ШZ]Э\X\ЩK™њ›ЫJ	ЩЬ›WЬЮ[ЧЪ›ШњЙКKљ[њЩ\ќ
В€YЩ[ќWЪY€	ЬЮ[ЛX›Ыќ\ЛXШZ^IЛ€Э]\О€	Ь[™[ќIЛ€^[ШY€ИЬљYЩ[N€	Ш›Ыќ\ЧШШZ^WШЫЫќ[ќXXШ[ЙИK€JNВ€Y€
[њЩ\ќ\њ›ЬЉHЩК	ХРT“‰Л[H[И[™љ[Z\\€ЫЫќ[ќXpйриЫО€	Ъ[њЩ\ќ\њ›Ь‹›Y\ЬШYЩ_X
NВџB‚\Ю[Иќ[Э[Ы€›ШЩ\ЬТ›ШЉYЩK›Ш‹ЫЫX›Ь]ЬњКHВ€]ШZ]X\љФ›ШЩ\ЬЪ[™К›ШЉNВ€ЫЫњЭЬ€H™\ЫЫ™PЬЉ›Ш‹ЫЫX›Ь]ЬњКNВ€ЫЫњЭ\ШЬљ\[ЫњИH\ШЬљ\[Ыђ[X\Щ\С›ЬЉ›ШЉNВ€ЫЫњЭ\ШЬљ\[Ы€H\ШЬљ\[ЫњЦМNВ€ЫЫњЭ]HHњ‘]QXLMJ
NВ‚€ЩК	ТS‘“ЙЛ	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€™\\[™И	Щ\ШЬљ\[ЫџH›И[Ь€H	Уќ[X™\Љ›Ш‹ќ[Ь€
KќСљ^Y
Љ_K
NВ‚€]ШZ]Ь[‘[\ЮYYJYЩKЬЉNВ‚€ЫЫњЭ^\Э[™ИH]ШZ][њЬXЭ^[њЩQ\ШЬљ\[ЫњКYЩK\ШЬљ\[ЫњКNВ€Y€
^\Э[™Л›[™Э
HВ€ЫЫњЭ^XЭH^\Э[™Л™љ[™

›ЭКHO€В€ЫЫњЭЩ[ИH›ЭЛЩ[ИЧNВ€ЫЫњЭ^XЭY[YHHњ“[Ы™^U^
›Ш‹ќ[ЬЉNВ€ЫЫњЭ\Х[YHHЩ[ЛњЫЫYJ
Щ[
HO€Эљ[™КЩ[
Kљ[ЫY\К^XЭY[YJJB€Эљ[™К›ЭЛќ^
Kљ[ЫY\К^XЭY[YJNВ€™]\›€\Х[YNВ€JNВ‚€Y€
Y^XЭ
HВ€›ЭИ™]И\њ›ЬЉ€°иH^\ЭH[Эљ[Y[ќИH°нќ\И\ЭHЫЫ\]0к›ЪXH›ИФ“KX\ИЫЫH[Ь€]™\™Щ[ќK€€
И[°йШ[Y[ќИ]]Ыpи]XЫИ›Ь]YXYИ\H]љ]\€\XЪYYK€
NВ€B‚€]ШZ]X\љФЭXШЩ\ЬК›Ш‹В€ЪО€ќYK€Ь‹€\ШЬљXШ[О€\ШЬљ\[Ы‹€[ЬЋ€ќ[X™\Љ›Ш‹ќ[Ь€
K€]N€]K€\XШ]WЩЭX\™€	СTРФ’PРSЧСWРУУTUSђТPWТђWСVTХPWУ“ЧСФ“IЛ€ЬљXYЧШYЫЬN€[ЩK€[љWЩЬ›N€^XЭќ^€™\љYљXШYЧЩ[N€™]И]J
KќТTУФЭљ[™К
K€JNВ€ЩК	ФХPРСTФЙЛ	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€°нќ\И°иH^\ЭXH›ИФ“NИ\XЪYYH›Ь]YXYK
NВ€™]\›ЋВ€B‚€Y€
–WФ•SЉHВ€]ШZ]\]S][Ъ
›Ш‹љYВ€Э]\О€	ФS‘S•IЛ€[љXЪXYЧЩ[N€ќ[€Ь›WЬ™]Ь››О€В€ћWЬќ[Ћ€ќYK€Ь‹€\ШЬљXШ[О€\ШЬљ\[Ы‹€[ЬЋ€ќ[X™\Љ›Ш‹ќ[Ь€
K€]N€]K€™\љYљXШYЧЩ^\Э[ќN€[ЩK€K€JNВ€ЩК	ТS‘“ЙЛ	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€–WФ•S‹™[љ[XH[\pйриЫИ™Z]K
NВ€™]\›ЋВ€B‚€]ШZ]ЫXЪРY^[њЩJYЩJNВ€ЫЫњЭљ[YH]ШZ]љ[^[њЩJYЩK›Ш‹\ШЬљ\[ЫЉNВ€]ШZ]Ш]™Q^[њЩJYЩJNВ‚€ЫЫњЭ™\љYљYYH]ШZ]™\љYћQ^[њЩJYЩKЬ‹›Ш‹\ШЬљ\[ЫњКNВ€Y€
]™\љYљYY›ЪКHВ€›ЭИ™]И\њ›ЬЉ€	СФ“H™XЪЭHИ›Ь›][0и\љ[ЛX\ИИ[°йШ[Y[ќИИ°нќ\И°иЫИ›ЪHШШ[^YИ›ИШZ^H	В€
И	ШЫЫH\ШЬљpйриЫИ
И°нќ\ИH™[ZXpйрнY\И
И‹€ШЭ[Y[ќИ
И[Ь€\Ь\YЬЛ€	В€
И	У°иЫИ™\›ШЩ\ЬЩHЩ[HЫЫ™™\љ\€ИШY\Э›И\H]љ]\€\XЪYYK‰В€
NВ€B‚€]ШZ]X\љФЭXШЩ\ЬК›Ш‹В€ЪО€ќYK€Ь‹€\ШЬљXШ[О€\ШЬљ\[Ы‹€[ЬЋ€љ[Yќ[YK€]N€љ[Y™]K€ЬљXYЧШYЫЬN€ќYK€™\љYљXШYЧЫ›ЧЩЬ›N€ќYK€[љWЩЬ›N€™\љYљYYњ›ЭПЛќ^ќ[€™\љYљXШYЧЩ[N€™]И]J
KќТTУФЭљ[™К
K€JNВ€ЩК	ФХPРСTФЙЛ	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€°нќ\И[°йШYИH™\љYљXШYИ›ИФ“K
NВџB‚\Ю[Иќ[Э[Ы€XZ[Љ
HВ€[њЭ\™Q\ЉРФ‘QS”ТХСTЉNВ€]ШZ]™XЫЭ™\”Э[T›ШЩ\ЬЪ[™К
NВ€ЫЫњЭ›ШњИH]ШZ]ШY[™[™Т›ШњК
NВ€Y€
Z›ШњЛ›[™Э
HВ€ЩК	ТS‘“ЙЛ	У™[љ[H°нќ\И[™[ќH\H[°йШ\‹‰КNВ€™]\›ЋВ€B‚€ЫЫњЭЫЫX›Ь]ЬњИH]ШZ]ШYЫЫX›Ь]ЬњК
NВ€]њ›ЭЬЩ\ЋВ€]ЭXШЩ\ЬИHВ€]\њ›ЬњИHВ‚€ћHВ€њ›ЭЬЩ\€H]ШZ]][Ъњ›ЭЬЩ\Љ
NВ€ЫЫњЭYЩHH]ШZ]њ›ЭЬЩ\‹›™]ФYЩJ
NВ€YЩKњЩ]Y][[Y[Э]
QђUSХSQSХU
NВ€YЩKњЩ]Y][]љYШ][Ы•[Y[Э]
Њ
NВ€Y€
P•QКHYЩK›ЫЉ	ШЫЫњЫЫIЛ
\ЩКHO€ЩК	Р”“ХФСT‰Л\ЩЛќ^

JJNВ€]ШZ]ЩЪ[ЉYЩJNВ‚€›Ь€
ЫЫњЭ›Ш€Щ€›ШњКHВ€ћHВ€]ШZ]›ШЩ\ЬТ›ШЉYЩK›Ш‹ЫЫX›Ь]ЬњКNВ€ЭXШЩ\ЬИ
ПHNВ€HШ]Ъ
\њ›ЬЉHВ€\њ›ЬњИ
ПHNВ€ЫЫњЭЪЭH]ШZ]ШЬ™Y[њЪЭ
YЩK›Ш‹	Щ\њ›ЙКNВ€ћHИ]ШZ]X\љС\њ›ЬЉ›Ш‹\њ›Ь‹ЪЭ
NИHШ]Ъ
X\љС\њ›Ь‘Z[\™JHВ€ЩК	СT”“Ф‰Л[H[И™YЪ\Э\€\њ›ИИ[°йШ[Y[ќИ	Ъ›Ш‹љYN€	ЫX\љС\њ›Ь‘Z[\™K›Y\ЬШYЩ_X
NВ€B€ЩК	СT”“Ф‰Л	Ъ›Ш‹ЫЫX›ЬYЬ—Ы›ЫY_N€	Щ\њ›Ь‹›Y\ЬШYЩ_X
NВ€ћHИ]ШZ]ЫЬЩQX[ЩЬКYЩJNИHШ]Ъ
КHЯB€B€B€Hљ[[HВ€Y€
њ›ЭЬЩ\ЉH]ШZ]њ›ЭЬЩ\‹ЫЬЩJ
NВ€]ШZ][њ]Y]YQ›ЫЭЭ\Y“™YYY

NВ€B‚€ЩК\њ›ЬњИИ	ХРT“‰И€	ФХPРСTФЙЛ	РYЩ[ќHH°нќ\ИЫЫЫpлYЛ‰ЛВ€›ШЩ\ЬШYЬО€›ШњЛ›[™Э€ЭXЩ\ЬЫО€ЭXШЩ\ЬЛ€\њ›ЬО€\њ›ЬњЛ€ћWЬќ[Ћ€–WФ•S‹€JNВ‚€Y€
\њ›ЬњИ€
HВ€›ШЩ\ЬЛ™^]ЫЩHHNВ€BџB‚›XZ[Љ
KШ]Ъ

\њ›ЬЉHO€В€ЩК	СT”“Ф‰Л\њ›И][›ИYЩ[ќHH°нќ\О€	Щ\њ›Ь‹›Y\ЬШYЩ_XИЭXЪО€\њ›Ь‹њЭXЪИJNВ€›ШЩ\ЬЛ™^]ЫЩHHNВџJNВ