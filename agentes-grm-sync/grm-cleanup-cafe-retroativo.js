#!/usr/bin/env node
'use strict';

/*
 * Limpeza pontual dos lançamentos indevidos de Café criados pelo agente
 * retroativo no Caixa Operacional do colaborador.
 *
 * REGRA DE SEGURANÇA:
 * - só remove linhas cuja descrição contenha EXATAMENTE a assinatura
 *   "Lançamento automático retroativo - Café";
 * - também exige que a própria linha identifique Café;
 * - nunca remove uma despesa de Café com outra observação/descrição;
 * - DRY_RUN é o padrão. Para excluir de verdade, use --real.
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
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

puppeteer.use(StealthPlugin());

const VERSION = 'V1-EXACT-DESCRIPTION';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL || 'https://www.grmserver.com.br/login';
const STAFF_URL = process.env.GRM_CLEANUP_CAFE_STAFF_URL || 'https://www.grmserver.com.br/adm/team/staff';
const TARGET_DESCRIPTION = 'Lançamento automático retroativo - Café';
const TARGET_DESCRIPTION_KEY = 'LANCAMENTO AUTOMATICO RETROATIVO CAFE';
const DRY_RUN = !process.argv.includes('--real');
const HEADLESS = String(process.env.GRM_HEADLESS ?? 'true').toLowerCase() !== 'false';
const MAX_COLLABORATORS = Math.max(1, Number(process.env.GRM_CLEANUP_CAFE_MAX_COLABORADORES || 250));
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_CLEANUP_CAFE_TIMEOUT_MS || 45000));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Credenciais do Supabase ausentes.');
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais do GRM ausentes.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

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
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}

async function loadTargets() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('grm_despesas_retroativas_auditoria')
      .select('cpf,colaborador,data_referencia,tipo_despesa,acao,ofm_code,dry_run,sucesso')
      .eq('tipo_despesa', 'Café')
      .eq('acao', 'CREATE')
      .eq('dry_run', false)
      .eq('sucesso', true)
      .not('ofm_code', 'is', null)
      .order('data_referencia', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const byCpf = new Map();
  for (const row of rows) {
    const cpf = digits(row.cpf);
    if (cpf.length !== 11) continue;
    const current = byCpf.get(cpf) || {
      cpf,
      colaborador: row.colaborador || cpf,
      datas: new Set(),
      ofm_codes: new Set(),
    };
    if (row.data_referencia) current.datas.add(String(row.data_referencia).slice(0, 10));
    if (row.ofm_code != null) current.ofm_codes.add(Number(row.ofm_code));
    byCpf.set(cpf, current);
  }

  return [...byCpf.values()]
    .map((row) => ({
      ...row,
      datas: [...row.datas].sort(),
      ofm_codes: [...row.ofm_codes].sort((a, b) => a - b),
    }))
    .slice(0, MAX_COLLABORATORS);
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
  await sleep(1000);
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
    return [...document.querySelectorAll('tr')]
      .some((row) => onlyDigits(row.innerText).includes(targetCpf));
  }, { timeout: DEFAULT_TIMEOUT }, cpf);

  const selected = await page.evaluate((targetCpf) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(targetCpf));
    if (rows.length !== 1) return { ok: false, matches: rows.length };
    const row = rows[0];
    const exact = [...row.querySelectorAll('td')]
      .some((cell) => onlyDigits(cell.innerText) === targetCpf);
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
    const text = document.body?.innerText || '';
    return /CAIXA OPERACIONAL/i.test(text) && /DESPESAS/i.test(text);
  }, { timeout: DEFAULT_TIMEOUT });
  await sleep(500);
}

async function openExpenses(page) {
  const prepared = await page.evaluate(() => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    document.querySelectorAll('[data-grm-cleanup-expenses]').forEach((el) => delete el.dataset.grmCleanupExpenses);
    const controls = [...document.querySelectorAll('button,[role="button"],[role="tab"],a,.v-tab,.v-list-item,.v-expansion-panel-title')]
      .filter(visible);
    let target = controls.find((el) => ['DESPESAS', 'DESPESA'].includes(normText(el.innerText || el.textContent)));
    if (!target) {
      const label = [...document.querySelectorAll('*')]
        .filter(visible)
        .find((el) => el.children.length === 0 && ['DESPESAS', 'DESPESA'].includes(normText(el.textContent)));
      target = label?.closest('button,[role="button"],[role="tab"],a,.v-tab,.v-list-item,.v-expansion-panel-title') || null;
    }
    if (!target) return null;
    target.dataset.grmCleanupExpenses = '1';
    return '[data-grm-cleanup-expenses="1"]';
  });
  if (!prepared) throw new Error('Seção Despesas não localizada.');
  await page.click(prepared);
  await sleep(800);
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

async function deleteFirstTarget(page) {
  const prepared = await page.evaluate(({ descriptionKey }) => {
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
    const buttons = [...row.querySelectorAll('button,[role="button"],a')]
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    const candidates = buttons.filter((el) => {
      const key = signature(el);
      return /EXCLUIR|REMOVER|DELETE|TRASH|LIXEIRA|BIN/.test(key);
    });
    if (candidates.length !== 1) {
      return {
        ok: false,
        reason: 'DELETE_CONTROL_NOT_UNIQUE',
        count: candidates.length,
        row: String(row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        controls: buttons.map((el) => signature(el)).slice(0, 20),
      };
    }
    candidates[0].dataset.grmCleanupDelete = '1';
    return {
      ok: true,
      selector: '[data-grm-cleanup-delete="1"]',
      row: String(row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
    };
  }, { descriptionKey: TARGET_DESCRIPTION_KEY });

  if (!prepared.ok) {
    if (prepared.reason === 'NO_TARGET') return false;
    throw new Error(`Controle seguro de exclusão não localizado: ${JSON.stringify(prepared)}`);
  }

  const before = (await inspectTargets(page)).length;
  await page.click(prepared.selector);
  await sleep(300);

  await page.evaluate(() => {
    const normText = (value) => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const visible = (el) => !!el && el.getClientRects().length > 0
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const dialogs = [...document.querySelectorAll('[role="dialog"],.v-overlay__content,.v-dialog,[class*="modal"],[class*="dialog"]')]
      .filter(visible)
      .filter((el) => /EXCLUIR|REMOVER|TEM CERTEZA|CONFIRMAR/i.test(el.innerText || ''));
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const buttons = [...dialog.querySelectorAll('button,[role="button"]')].filter(visible);
    const confirm = buttons.find((el) => ['EXCLUIR', 'REMOVER', 'SIM', 'CONFIRMAR'].includes(normText(el.innerText || el.textContent)));
    if (confirm) confirm.click();
  });

  await sleep(900);
  const after = (await inspectTargets(page)).length;
  if (after >= before) {
    throw new Error(`Exclusão não foi confirmada no GRM (${before} -> ${after}).`);
  }
  log('SUCCESS', 'Despesa retroativa de Café excluída.', { before, after, row: prepared.row });
  return true;
}

async function closeCurrent(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function processTarget(page, target) {
  await openStaffPage(page);
  await searchCpf(page, target.cpf);
  await selectExactStaff(page, target.cpf);
  await clickCash(page);
  await openExpenses(page);

  const found = await inspectTargets(page);
  if (!found.length) {
    await closeCurrent(page);
    return { found: 0, deleted: 0 };
  }

  log('INFO', `${target.colaborador}: ${found.length} lançamento(s) alvo localizado(s).`, {
    cpf: target.cpf,
    datas_auditadas: target.datas,
    dry_run: DRY_RUN,
  });

  if (DRY_RUN) {
    await closeCurrent(page);
    return { found: found.length, deleted: 0 };
  }

  let deleted = 0;
  let guard = 0;
  while ((await inspectTargets(page)).length > 0) {
    if (guard++ > 20) throw new Error('Limite de segurança de exclusões por colaborador excedido.');
    const changed = await deleteFirstTarget(page);
    if (!changed) break;
    deleted += 1;
  }

  const remaining = await inspectTargets(page);
  if (remaining.length) throw new Error(`${remaining.length} lançamento(s) alvo permaneceram após a limpeza.`);
  await closeCurrent(page);
  return { found: found.length, deleted };
}

async function main() {
  const targets = await loadTargets();
  log('INFO', `Cleanup ${VERSION} iniciado.`, {
    alvo: TARGET_DESCRIPTION,
    colaboradores_auditados: targets.length,
    dry_run: DRY_RUN,
  });

  const browser = await launchBrowser();
  const summary = {
    colaboradores: 0,
    encontrados: 0,
    excluidos: 0,
    sem_alvo: 0,
    erros: 0,
  };

  try {
    const page = await browser.newPage();
    await login(page);
    for (const target of targets) {
      summary.colaboradores += 1;
      try {
        const result = await processTarget(page, target);
        summary.encontrados += result.found;
        summary.excluidos += result.deleted;
        if (!result.found) summary.sem_alvo += 1;
      } catch (error) {
        summary.erros += 1;
        log('ERROR', `${target.colaborador} / ${target.cpf}: ${error.message}`);
        await closeCurrent(page).catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  log(summary.erros ? 'WARN' : 'SUCCESS', 'Cleanup concluído.', summary);
  if (summary.erros) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  norm,
  TARGET_DESCRIPTION,
  TARGET_DESCRIPTION_KEY,
};
