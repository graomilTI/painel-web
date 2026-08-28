#!/usr/bin/env node
'use strict';

/*
 * GRM Server - Lançamento do Bônus de Classificação FOB no Caixa do colaborador.
 *
 * Fluxo confirmado para o Bônus:
 *   Funcionário -> abrir cadastro -> Despesas -> Adicionar
 *   -> Descrição / Valor / Data -> Salvar.
 *
 * A descrição é única por competência: Bônus de Tons <mês> - <ano>.
 * Antes de adicionar, o agente procura essa descrição no cadastro. Se já existir,
 * apenas confirma o lançamento no Supabase e NÃO cria uma segunda movimentação.
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
  if (!year || !month) throw new Error('Não foi possível calcular a data de lançamento do Bônus.');

  return `15/${month}/${year}`;
}

const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
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
  if (!match) throw new Error(`Competência inválida: ${job.competencia}`);

  const ano = match[1];
  const mesNumero = Number(match[2]);
  const mes = MESES_PT_BR[mesNumero - 1];
  if (!mes) throw new Error(`Mês inválido na competência: ${job.competencia}`);

  return { ano, mes, mesNumero };
}

function descriptionFor(job) {
  const { ano, mes } = competenceParts(job);
  // Mesmo padrão usado no fluxo manual validado no GRM.
  return `Bônus toneladas ${mes} / ${ano}`;
}

function descriptionAliasesFor(job) {
  const { ano, mes } = competenceParts(job);
  // Inclui a descrição da versão anterior para bloquear duplicidade caso
  // alguma tentativa antiga tenha sido persistida pelo GRM.
  return [
    descriptionFor(job),
    `Bônus de Tons ${mes} - ${ano}`,
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

async function waitEmployeeModal(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => {
      const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      return [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
        .filter(visible)
        .some((el) => /EDITAR FUNCION[ÁA]RIO|DESPESAS|CONFIGURAÇÕES E PERMISSÕES/i.test(el.innerText || ''));
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

    // 1. Controle clicável cujo próprio texto é EXATAMENTE DESPESAS.
    const direct = [...scope.querySelectorAll(clickableSelector)]
      .filter(visible)
      .filter((el) => !['I', 'SVG', 'PATH'].includes(el.tagName))
      .filter((el) => {
        const text = normalize(el.innerText || el.textContent || '');
        return text === 'DESPESAS' || text === 'DESPESA';
      });

    let clickable = direct[direct.length - 1] || null;

    // 2. Procura um rótulo folha exatamente DESPESAS e sobe até o controle.
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
      `Seção DESPESAS exata não localizada no cadastro. Diagnóstico: ${
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
  const expectedCategory = norm('Bônus e Premiações');
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

async function chooseSelectByLabel(page, labelText, expectedOption) {
  const selector = await page.evaluate((labelWanted) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden';
    const target = normalize(labelWanted);

    document
      .querySelectorAll('[data-grm-bonus-select-field]')
      .forEach((el) => delete el.dataset.grmBonusSelectField);

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )]
      .filter(visible)
      .filter((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''))
      .sort((a, b) =>
        b.querySelectorAll('input,textarea,select,[role="combobox"]').length
        - a.querySelectorAll('input,textarea,select,[role="combobox"]').length
      );
    const scope = dialogs[0] || document.body;

    const labels = [...scope.querySelectorAll('label,.v-label,[class*="label"]')]
      .filter(visible)
      .filter((el) => normalize(el.textContent || '') === target);

    let control = null;
    for (const label of labels) {
      control = label.closest('.v-input,.v-field,.v-select,.v-autocomplete,[class*="field"]');
      if (control) break;
    }

    if (!control) {
      const inputs = [...scope.querySelectorAll('input,[role="combobox"]')].filter(visible);
      control = inputs.find((el) => {
        const signature = normalize([
          el.getAttribute('aria-label'),
          el.getAttribute('placeholder'),
          el.getAttribute('name'),
        ].filter(Boolean).join(' '));
        return signature === target || signature.includes(target);
      }) || null;
    }

    const clickable = control?.matches('input,button,[role="combobox"]')
      ? control
      : control?.querySelector('input,button,[role="combobox"]') || control;

    if (!clickable) return null;
    clickable.dataset.grmBonusSelectField = target;
    return '[data-grm-bonus-select-field]';
  }, labelText);

  if (!selector) throw new Error(`Campo ${labelText} não localizado no formulário do GRM.`);
  await page.click(selector);
  await sleep(350);

  const option = await page.evaluate((wanted) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden';
    const target = normalize(wanted);

    document
      .querySelectorAll('[data-grm-bonus-select-option]')
      .forEach((el) => delete el.dataset.grmBonusSelectOption);

    const candidates = [...document.querySelectorAll(
      '[role="option"],.v-list-item,li'
    )]
      .filter(visible)
      .filter((el) => normalize(el.innerText || el.textContent) === target);

    const candidate = candidates[candidates.length - 1];
    if (!candidate) return null;
    candidate.dataset.grmBonusSelectOption = '1';
    return '[data-grm-bonus-select-option="1"]';
  }, expectedOption);

  if (!option) throw new Error(
    `Opção ${expectedOption} não localizada no campo ${labelText}.`
  );

  await page.click(option);
  await sleep(300);
}

async function fillExpense(page, job, description) {
  await chooseMovementType(page, 'Comprovante');

  // No GRM estes campos aparecem quando o movimento é Comprovante.
  await chooseSelectByLabel(page, 'Tipo da Despesa', 'Bônus e Premiações');
  await chooseSelectByLabel(page, 'Tipo de Documento', 'Cupom Fiscal');

  const descriptionField = await markField(page, 'descricao');
  const valueField = await markField(page, 'valor');
  const dateField = await markField(page, 'data');
  const documentField = await markField(page, 'documento');

  await typeField(page, descriptionField, description);
  await typeField(page, documentField, '0');

  const expectedValue = Number(job.valor || 0);
  const valueCandidates = [
    expectedValue.toFixed(2).replace('.', ','),
    String(Math.round(expectedValue * 100)),
    expectedValue.toFixed(2),
  ];
  let valueOk = false;
  for (const candidate of valueCandidates) {
    await typeField(page, valueField, candidate);
    const observed = await page.$eval(
      valueField,
      (el) => el.value || el.getAttribute('value') || ''
    );
    if (Math.abs(parseBrowserNumber(observed) - expectedValue) < 0.001) {
      valueOk = true;
      break;
    }
  }
  if (!valueOk) {
    throw new Error(
      `Valor do bônus não permaneceu no formulário como ${expectedValue.toFixed(2)}.`
    );
  }

  const launchDate = brDateDia15();
  await typeField(page, dateField, launchDate);

  const observed = await page.evaluate((selectors) => {
    const value = (selector) => {
      const el = document.querySelector(selector);
      return String(el?.value || el?.getAttribute?.('value') || '').trim();
    };
    const form = [...document.querySelectorAll(
      '[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]'
    )].find((el) => /ADICIONAR MOVIMENTO/i.test(el.innerText || ''));
    return {
      descricao: value(selectors.description),
      documento: value(selectors.document),
      textoFormulario: String(form?.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  }, {
    description: descriptionField,
    document: documentField,
  });

  if (norm(observed.descricao) !== norm(description)) {
    throw new Error(`Descrição divergente no formulário: ${observed.descricao}`);
  }
  if (String(observed.documento).trim() !== '0') {
    throw new Error(`N. Documento divergente no formulário: ${observed.documento}`);
  }
  if (!norm(observed.textoFormulario).includes(norm('Bônus e Premiações'))) {
    throw new Error('Tipo da Despesa não permaneceu como Bônus e Premiações.');
  }
  if (!norm(observed.textoFormulario).includes(norm('Cupom Fiscal'))) {
    throw new Error('Tipo de Documento não permaneceu como Cupom Fiscal.');
  }
  if (!norm(observed.textoFormulario).includes(norm('Comprovante'))) {
    throw new Error('Tipo do movimento não permaneceu como Comprovante.');
  }

  return { date: launchDate, value: expectedValue };
}

async function saveExpense(page) {
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

  const confirmation = await page.evaluate(() => {
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

  // O GRM mantém o formulário aberto em algumas versões mesmo após gravar.
  // A mensagem oficial "Registro cadastrado... com sucesso" é confirmação
  // suficiente para seguir à verificação do movimento no Caixa.
  if (confirmation.signalType === 'success') {
    log('SUCCESS', 'GRM confirmou o cadastro do movimento.', confirmation);
    return { ...confirmation, confirmedBy: 'GRM_SUCCESS_MESSAGE' };
  }

  if (confirmation.signalType === 'error') {
    throw new Error(`GRM recusou o salvamento do Bônus: ${confirmation.errorMessage}`);
  }

  if (confirmation.formStillOpen) {
    throw new Error(
      `GRM não confirmou o salvamento do Bônus.`
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

async function verifyExpense(page, cpf, job, descriptions) {
  await closeDialogs(page);
  await openEmployee(page, cpf);

  const primary = descriptions[0];
  let lastRows = [];
  let lastVerification = null;

  // O movimento pode levar alguns segundos para aparecer na tabela após a
  // mensagem de sucesso. Fazemos tentativas somente de leitura, sem salvar
  // novamente, para não criar duplicidade.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(attempt === 1 ? 700 : 1200);
    const rows = await inspectExpenseDescriptions(page, descriptions);
    lastRows = rows;
    const verification = verifyMovementRow(rows, job, primary);
    lastVerification = verification;

    if (verification.exact) {
      return { ok: true, row: verification.exactRow, attempt };
    }

    // Se uma descrição antiga existir, ela também bloqueia duplicidade. Para
    // confirmar sucesso exigimos o valor e os campos visíveis do movimento.
    if (rows.length) {
      const legacyExact = rows.find((row) => {
        const cells = row.cells || [];
        const expectedValue = brMoneyText(job.valor);
        const hasCategory = cells.some((cell) => norm(cell) === norm('Bônus e Premiações'))
          || norm(row.text).includes(norm('Bônus e Premiações'));
        const hasValue = cells.some((cell) => String(cell).includes(expectedValue))
          || String(row.text).includes(expectedValue);
        const hasDocumentZero = cells.some((cell) => String(cell).trim() === '0');
        return hasCategory && hasValue && hasDocumentZero;
      });
      if (legacyExact) {
        return { ok: true, row: legacyExact, legacy: true, attempt };
      }
    }
  }

  return {
    ok: false,
    row: lastVerification?.exactRow || null,
    rows: lastRows,
  };
}

async function recoverStaleProcessing() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('bonus_caixa_lancamentos')
    .update({ status: 'PENDENTE', iniciado_em: null, updated_at: new Date().toISOString() })
    .eq('status', 'PROCESSANDO')
    .lt('iniciado_em', cutoff);
  if (error) log('WARN', `Falha ao recuperar PROCESSANDO antigo: ${error.message}`);
}

async function loadPendingJobs() {
  const { data, error } = await supabase
    .from('bonus_caixa_lancamentos')
    .select('*')
    .eq('status', 'PENDENTE')
    .order('solicitado_em', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;
  const jobs = data || [];
  const byCompetence = new Map();

  for (const job of jobs) {
    const competence = String(job.competencia || '').slice(0, 10);
    if (!byCompetence.has(competence)) {
      const { data: production, error: productionError } = await supabase
        .rpc('bonus_producao_competencia', { p_competencia: competence });
      if (productionError) throw productionError;
      byCompetence.set(competence, new Map(
        (production || []).map((row) => [
          nameKey(row.colaborador || row.colaborador_nome || row.nome),
          row,
        ]),
      ));
    }

    const current = byCompetence.get(competence).get(nameKey(job.colaborador_nome));
    if (!current || norm(current.status) !== 'APTO') {
      throw new Error(
        `Bônus atual não está Apto para ${job.colaborador_nome} na competência ${competence}.`,
      );
    }

    const currentTons = Number(current.tons || 0);
    const currentValue = Number(current.valor || 0);
    if (
      Math.abs(Number(job.tons || 0) - currentTons) > 0.001
      || Math.abs(Number(job.valor || 0) - currentValue) > 0.001
    ) {
      const { error: refreshError } = await supabase
        .from('bonus_caixa_lancamentos')
        .update({
          tons: currentTons,
          valor: currentValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'PENDENTE');
      if (refreshError) throw refreshError;
      log('INFO', `${job.colaborador_nome}: fila atualizada com a produção vigente.`, {
        tons_anterior: Number(job.tons || 0),
        tons_atual: currentTons,
        valor_anterior: Number(job.valor || 0),
        valor_atual: currentValue,
      });
      job.tons = currentTons;
      job.valor = currentValue;
    }
  }

  return jobs;
}

async function loadCollaborators() {
  const { data, error } = await supabase
    .from('vw_colaboradores_atuais')
    .select('nome,cpf,ativo,situacao')
    .limit(2000);
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
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
    .from('bonus_caixa_lancamentos')
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
    .from('bonus_caixa_lancamentos')
    .select('id')
    .eq('status', 'PENDENTE')
    .limit(1);
  if (error || !remaining?.length) return;

  const { data: queued, error: queuedError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-bonus-caixa')
    .eq('status', 'pendente')
    .limit(1);
  if (queuedError || queued?.length) return;

  const { error: insertError } = await supabase.from('grm_sync_jobs').insert({
    agente_id: 'sync-bonus-caixa',
    status: 'pendente',
    payload: { origem: 'bonus_caixa_continuacao' },
  });
  if (insertError) log('WARN', `Falha ao enfileirar continuação: ${insertError.message}`);
}

async function processJob(page, job, collaborators) {
  await markProcessing(job);
  const cpf = resolveCpf(job, collaborators);
  const descriptions = descriptionAliasesFor(job);
  const description = descriptions[0];
  const date = brDateDia15();

  log('INFO', `${job.colaborador_nome}: preparando ${description} no valor de ${Number(job.valor || 0).toFixed(2)}.`);

  await openEmployee(page, cpf);

  const existing = await inspectExpenseDescriptions(page, descriptions);
  if (existing.length) {
    const exact = existing.find((row) => {
      const cells = row.cells || [];
      const expectedValue = brMoneyText(job.valor);
      const hasValue = cells.some((cell) => String(cell).includes(expectedValue))
        || String(row.text).includes(expectedValue);
      return hasValue;
    });

    if (!exact) {
      throw new Error(
        `Já existe movimento de Bônus desta competência no GRM, mas com valor divergente. `
        + `Lançamento automático bloqueado para evitar duplicidade.`
      );
    }

    await markSuccess(job, {
      ok: true,
      cpf,
      descricao: description,
      valor: Number(job.valor || 0),
      data: date,
      duplicate_guard: 'DESCRICAO_DA_COMPETENCIA_JA_EXISTIA_NO_GRM',
      criado_agora: false,
      linha_grm: exact.text,
      verificado_em: new Date().toISOString(),
    });
    log('SUCCESS', `${job.colaborador_nome}: bônus já existia no GRM; duplicidade bloqueada.`);
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
  const filled = await fillExpense(page, job, description);
  await saveExpense(page);

  const verified = await verifyExpense(page, cpf, job, descriptions);
  if (!verified.ok) {
    throw new Error(
      'GRM fechou o formulário, mas o lançamento do Bônus não foi localizado no Caixa '
      + 'com Descrição + Bônus e Premiações + N. Documento 0 + Valor esperados. '
      + 'Não reprocesse sem conferir o cadastro para evitar duplicidade.'
    );
  }

  await markSuccess(job, {
    ok: true,
    cpf,
    descricao: description,
    valor: filled.value,
    data: filled.date,
    criado_agora: true,
    verificado_no_grm: true,
    linha_grm: verified.row?.text || null,
    verificado_em: new Date().toISOString(),
  });
  log('SUCCESS', `${job.colaborador_nome}: bônus lançado e verificado no GRM.`);
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  await recoverStaleProcessing();
  const jobs = await loadPendingJobs();
  if (!jobs.length) {
    log('INFO', 'Nenhum Bônus pendente para lançar.');
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

  log(errors ? 'WARN' : 'SUCCESS', 'Agente de Bônus concluído.', {
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
  log('ERROR', `Erro fatal no agente de Bônus: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
