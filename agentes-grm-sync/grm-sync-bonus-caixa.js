#!/usr/bin/env node
'use strict';

/*
 * GRM Server - Lançamento do Bônus de Classificação FOB no Caixa do colaborador.
 *
 * Fluxo confirmado para o Bônus:
 *   Funcionário -> abrir cadastro -> Despesas -> Adicionar
 *   -> Descrição / Valor / Data -> Salvar.
 *
 * A descrição é única por competência: BÔNUS CLASSIFICAÇÃO FOB MM/AAAA.
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

function brDateNow() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function competenceLabel(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) throw new Error(`Competência inválida: ${value}`);
  return `${match[2]}/${match[1]}`;
}

function descriptionFor(job) {
  return `BÔNUS CLASSIFICAÇÃO FOB ${competenceLabel(job.competencia)}`;
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
  const checkboxSelector = '[data-grm-bonus-staff-checkbox="1"]';
  const checked = await page.$eval(checkboxSelector, (el) => !!el.checked);
  if (!checked) {
    const control = await page.$('[data-grm-bonus-staff-control="1"]');
    if (control) await page.click('[data-grm-bonus-staff-control="1"]');
    else await page.click(checkboxSelector);
  }
  await sleep(350);
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

async function clickEdit(page) {
  const prepared = await page.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const buttons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');

    let edit = buttons.find((button) => {
      const signature = normalize([
        button.textContent,
        button.getAttribute('title'),
        button.getAttribute('aria-label'),
        typeof button.className === 'string' ? button.className : '',
        button.outerHTML,
      ].filter(Boolean).join(' '));
      return /\bEDITAR\b|PENCIL|EDIT OUTLINE|STAFF.*EDIT|EDIT.*STAFF/.test(signature)
        && !/HISTOR|DESATIV|XLS|UPLOAD/.test(signature);
    });

    if (!edit) {
      const search = [...document.querySelectorAll('input')]
        .find((input) => /nome.*email.*cpf/i.test(input.getAttribute('placeholder') || ''));
      if (search) {
        const rect = search.getBoundingClientRect();
        edit = buttons
          .filter((button) => {
            const b = button.getBoundingClientRect();
            return b.right <= rect.left + 20 && Math.abs(b.top - rect.top) < 100;
          })
          .filter((button) => !/XLS|UNAVAILABLE|DEACTIVATE|UPLOAD|ADD/.test(String(button.parentElement?.className || '').toUpperCase()))
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
      }
    }

    if (!edit) return null;
    edit.dataset.grmBonusEdit = '1';
    return '[data-grm-bonus-edit="1"]';
  });

  if (!prepared) throw new Error('Botão Editar do funcionário não localizado.');
  await page.click(prepared);
  if (!await waitEmployeeModal(page)) throw new Error('Editar foi acionado, mas o cadastro do funcionário não abriu.');
  await sleep(500);
}

async function openEmployee(page, cpf) {
  await openStaffPage(page);
  await setSearchCpf(page, cpf);
  await selectExactStaffRow(page, cpf);
  await clickEdit(page);
}

async function openExpensesSection(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const labels = [...document.querySelectorAll('*')]
      .filter((el) => visible(el) && el.children.length === 0 && normalize(el.textContent) === 'DESPESAS');
    const label = labels[labels.length - 1];
    if (!label) return null;
    const clickable = label.closest('button, [role="button"], .v-expansion-panel-title') || label.parentElement;
    if (!clickable) return null;
    clickable.dataset.grmBonusExpenses = '1';
    return '[data-grm-bonus-expenses="1"]';
  });
  if (!prepared) throw new Error('Seção Despesas do cadastro do funcionário não localizada.');
  await page.click(prepared);
  await sleep(500);
}

async function hasExpenseDescription(page, description) {
  return page.evaluate((expected) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const target = normalize(expected);
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const containers = [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
      .filter(visible);
    const scope = containers[containers.length - 1] || document.body;
    return normalize(scope.innerText || '').includes(target);
  }, description);
}

async function clickAddExpense(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9+]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

    const expensesLabel = [...document.querySelectorAll('*')]
      .filter((el) => visible(el) && el.children.length === 0 && normalize(el.textContent) === 'DESPESAS')
      .pop();
    if (!expensesLabel) return null;

    let section = expensesLabel.parentElement;
    while (section && section !== document.body) {
      const text = normalize(section.innerText || '');
      if (text.includes('DESPESAS') && section.querySelectorAll('button, [role="button"]').length) break;
      section = section.parentElement;
    }
    if (!section) return null;

    const buttons = [...section.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    let add = buttons.find((button) => {
      const key = normalize([
        button.textContent,
        button.getAttribute('title'),
        button.getAttribute('aria-label'),
        typeof button.className === 'string' ? button.className : '',
      ].filter(Boolean).join(' '));
      return key === 'ADICIONAR' || key === '+' || /\bADICIONAR\b|\bADD\b|PLUS/.test(key);
    });
    if (!add) return null;
    add.dataset.grmBonusAddExpense = '1';
    return '[data-grm-bonus-add-expense="1"]';
  });

  if (!prepared) throw new Error('Botão Adicionar de Despesas não localizado.');
  await page.click(prepared);
  await sleep(600);
}

async function markField(page, semantic) {
  const selector = await page.evaluate((fieldType) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const patterns = {
      descricao: /DESCRI[CÇ][AÃ]O|DESCRICAO/,
      valor: /^VALOR$|VALOR DA DESPESA|VALOR TOTAL/,
      data: /^DATA$|DATA DA DESPESA|DATA DO LAN[CÇ]AMENTO/,
    };
    const pattern = patterns[fieldType];
    if (!pattern) return null;

    const dialogs = [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
      .filter(visible);
    const scope = dialogs[dialogs.length - 1] || document.body;

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

async function fillExpense(page, job, description) {
  const descriptionField = await markField(page, 'descricao');
  const valueField = await markField(page, 'valor');
  const dateField = await markField(page, 'data');

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
  if (!valueOk) throw new Error(`Valor do bônus não permaneceu no formulário como ${expectedValue.toFixed(2)}.`);

  const today = brDateNow();
  await typeField(page, dateField, today);

  const descriptionObserved = await page.$eval(descriptionField, (el) => String(el.value || '').trim());
  if (norm(descriptionObserved) !== norm(description)) {
    throw new Error(`Descrição divergente no formulário: ${descriptionObserved}`);
  }

  return { date: today, value: expectedValue };
}

async function saveExpense(page) {
  const prepared = await page.evaluate(() => {
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const dialogs = [...document.querySelectorAll('[role="dialog"], .v-overlay__content, .v-dialog, [class*="modal"], [class*="dialog"]')]
      .filter(visible);
    const scope = dialogs[dialogs.length - 1] || document.body;
    const save = [...scope.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .find((button) => normalize(button.textContent) === 'SALVAR' && !button.disabled);
    if (!save) return null;
    save.dataset.grmBonusSaveExpense = '1';
    return '[data-grm-bonus-save-expense="1"]';
  });
  if (!prepared) throw new Error('Botão SALVAR da Despesa não localizado.');
  await page.click(prepared);
  await sleep(1000);
}

async function closeDialogs(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function verifyExpense(page, cpf, description) {
  await closeDialogs(page);
  await openEmployee(page, cpf);
  await openExpensesSection(page);
  await sleep(400);
  return hasExpenseDescription(page, description);
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
  return data || [];
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
  const description = descriptionFor(job);
  const date = brDateNow();

  log('INFO', `${job.colaborador_nome}: preparando ${description} no valor de ${Number(job.valor || 0).toFixed(2)}.`);

  await openEmployee(page, cpf);
  await openExpensesSection(page);

  if (await hasExpenseDescription(page, description)) {
    await markSuccess(job, {
      ok: true,
      cpf,
      descricao: description,
      valor: Number(job.valor || 0),
      data: date,
      duplicate_guard: 'DESCRICAO_JA_EXISTIA_NO_GRM',
      criado_agora: false,
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

  const verified = await verifyExpense(page, cpf, description);
  if (!verified) throw new Error('Despesa foi salva, mas a descrição do Bônus não apareceu na verificação do cadastro.');

  await markSuccess(job, {
    ok: true,
    cpf,
    descricao: description,
    valor: filled.value,
    data: filled.date,
    criado_agora: true,
    verificado_no_grm: true,
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
}

main().catch((error) => {
  log('ERROR', `Erro fatal no agente de Bônus: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
