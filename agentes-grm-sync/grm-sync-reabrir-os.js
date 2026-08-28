#!/usr/bin/env node
/*
 * GRM Server - Reabertura auditada de Ordens de Serviço
 *
 * Fonte: public.grm_reabertura_os_fila.
 * Cada execução trata no máximo uma O.S. por segurança.
 * O agente nasce em DRY-RUN e só executa alteração com --real ou
 * GRM_REABRIR_OS_DRY_RUN=false.
 */

process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = process.env.TMP || '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMP;
process.env.TMPDIR = process.env.TMPDIR || process.env.TMP;
process.env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || process.env.TMP;
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || '/home/grao100/chrome-runtime/cache';
process.env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || '/home/grao100/chrome-runtime/config';
process.env.MALLOC_ARENA_MAX = process.env.MALLOC_ARENA_MAX || '2';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const SERVICE_ORDER_URL = 'https://www.grmserver.com.br/operation/serviceOrder';
const LOGIN_URL = 'https://www.grmserver.com.br/login';
const AGENT_ID = 'sync-reabrir-os';
const EXEC_TABLE = 'grm_reabertura_os_execucoes';

const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SB_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

const ENV_DRY_RUN = boolFromEnv('GRM_REABRIR_OS_DRY_RUN', true);
const ENV_DEBUG = boolFromEnv('GRM_REABRIR_OS_DEBUG', false) || boolFromEnv('GRM_DEBUG', false);
const ENV_PRIORITY_MAX = integerFromEnv('GRM_REABRIR_OS_PRIORIDADE_MAX', 1, 1, 2);
const ENV_CHAIN = boolFromEnv('GRM_REABRIR_OS_ENCADEAR', false);
const ENV_TIMEOUT_MS = integerFromEnv('GRM_REABRIR_OS_TIMEOUT_MS', 12 * 60 * 1000, 60_000, 30 * 60 * 1000);

let supabase = null;
let browserAtual = null;

function log(level, message) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function integerFromEnv(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--real') out.dryRun = false;
    else if (arg === '--debug') out.debug = true;
    else if (arg === '--os') out.os = argv[++i];
    else if (arg === '--prioridade-max') out.priorityMax = Number.parseInt(argv[++i], 10);
  }
  return out;
}

function stripAccents(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(value) {
  return stripAccents(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normOs(value) {
  let text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/^\d+(\.0+)?$/.test(text)) text = text.replace(/\.0+$/, '');
  if (text.includes('/')) text = text.split('/')[0].trim();
  const digits = text.replace(/[^0-9]/g, '');
  return digits || text;
}

function assertConfig() {
  const missing = [];
  if (!GRM_USER) missing.push('GRMSERVER_USER');
  if (!GRM_PASSWORD) missing.push('GRMSERVER_PASSWORD');
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);

  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureAgentEnabled() {
  const { data, error } = await supabase
    .from('grm_sync_agent_settings')
    .select('enabled')
    .eq('agent_id', AGENT_ID)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar configuração do agente: ${error.message}`);
  if (!data?.enabled) throw new Error(`${AGENT_ID} está desativado em grm_sync_agent_settings.`);
}

async function claimQueueItem(config) {
  const { data, error } = await supabase.rpc('claim_next_grm_reabertura_os', {
    p_os: config.onlyOs || null,
    p_prioridade_max: config.priorityMax,
  });
  if (error) throw new Error(`Falha ao reservar O.S. da fila: ${error.message}`);
  if (!data?.id) return null;
  return data;
}

async function finishQueueItem(item, status, errorMessage = null, observation = null) {
  if (!item?.id) return;
  const { error } = await supabase.rpc('finalizar_grm_reabertura_os', {
    p_fila_id: item.id,
    p_status: status,
    p_erro: errorMessage || null,
    p_observacao: observation || null,
  });
  if (error) log('WARN', `Falha ao atualizar fila da O.S. ${item.os}: ${error.message}`);
}

async function createExecution(item, dryRun) {
  const { data, error } = await supabase
    .from(EXEC_TABLE)
    .insert({ fila_id: item.id, os: item.os, dry_run: dryRun, status: 'INICIADO' })
    .select('id')
    .single();
  if (error) throw new Error(`Falha ao abrir auditoria da reabertura: ${error.message}`);
  return data.id;
}

async function finishExecution(id, patch) {
  if (!id) return;
  const { error } = await supabase
    .from(EXEC_TABLE)
    .update({ ...patch, finalizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) log('WARN', `Falha ao finalizar auditoria ${id}: ${error.message}`);
}

async function screenshot(page, name) {
  try {
    const dir = process.env.GRM_REABRIR_OS_DEBUG_DIR || path.join(os.tmpdir(), 'grm-reabrir-os-debug');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, name);
    await page.screenshot({ path: filePath, fullPage: false });
    log('DEBUG', `Screenshot salvo em ${filePath}`);
  } catch (error) {
    log('WARN', `Não foi possível salvar screenshot: ${error.message}`);
  }
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value), { delay: 20 });
}

async function login(page) {
  log('INFO', 'Iniciando login no GRM Server...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 30000 });
  await clearAndType(page, 'input#input-v-2', GRM_USER);
  await clearAndType(page, 'input#input-v-5', GRM_PASSWORD);
  await page.click('button.submit-btn');

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await wait(1000);
    if (!page.url().includes('/login')) {
      log('SUCCESS', 'Login realizado com sucesso.');
      return;
    }
  }
  throw new Error('Login falhou: a página permaneceu em /login após 45 segundos.');
}

async function clickFieldByLabel(page, label) {
  const box = await page.evaluate((wantedLabel) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const wanted = norm(wantedLabel);
    const fields = Array.from(document.querySelectorAll('.v-input, .v-field, .v-select, .v-autocomplete'));
    const field = fields.find((item) => {
      const rect = item.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const text = norm(`${item.innerText || item.textContent || ''} ${item.querySelector('input')?.value || ''}`);
      return text.startsWith(wanted) || text.includes(`${wanted} `);
    });
    if (!field) return null;
    const rect = field.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, label);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

async function selectOpenOption(page, target) {
  await wait(450);
  return page.evaluate((wantedText) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const wanted = norm(wantedText);
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    for (let i = overlays.length - 1; i >= 0; i -= 1) {
      const options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
      const option = options.find((item) => {
        const text = norm(item.innerText || item.textContent || '');
        return text === wanted || text.includes(wanted) || wanted.includes(text);
      });
      if (option) {
        option.click();
        return String(option.innerText || option.textContent || '').trim();
      }
    }
    return null;
  }, target);
}

async function ensureFiltersVisible(page) {
  const visible = await page.evaluate(() => {
    function norm(value) {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    }
    return Array.from(document.querySelectorAll('.v-input, .v-field, .v-select, .v-autocomplete')).some((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width && rect.height && norm(item.innerText || item.textContent || '').includes('SITUACAO');
    });
  });
  if (visible) return;
  const button = await page.$('.serviceOrder-act-filter button, .serviceOrder-act-filter');
  if (!button) throw new Error('Botão de filtros da Ordem de Serviço não encontrado.');
  await button.click();
  await wait(700);
}

async function ensureFilter(page, label, target) {
  await ensureFiltersVisible(page);
  const current = await page.evaluate((wantedLabel) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const wanted = norm(wantedLabel);
    const fields = Array.from(document.querySelectorAll('.v-input, .v-field, .v-select, .v-autocomplete'));
    const field = fields.find((item) => {
      const rect = item.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const text = norm(item.innerText || item.textContent || '');
      return text.startsWith(wanted) || text.includes(`${wanted} `);
    });
    if (!field) return null;
    const input = field.querySelector('input');
    return `${field.innerText || ''} ${input ? input.value || '' : ''}`.trim();
  }, label);

  if (current && normText(current).includes(normText(target))) return;
  const opened = await clickFieldByLabel(page, label);
  if (!opened) throw new Error(`Filtro "${label}" não encontrado.`);
  const selected = await selectOpenOption(page, target);
  if (!selected) throw new Error(`Opção "${target}" não encontrada no filtro "${label}".`);
  log('INFO', `Filtro ${label} ajustado para ${selected}.`);
  await wait(650);
}

async function clickSearch(page) {
  const clicked = await page.evaluate(() => {
    const element = document.querySelector('.serviceOrder-act-search button, .serviceOrder-act-search');
    if (!element) return false;
    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button') || element;
    button.click();
    return true;
  });
  if (!clicked) throw new Error('Botão de pesquisa da Ordem de Serviço não encontrado.');
}

async function openServiceOrderPage(page, situation) {
  if (!page.url().includes('/operation/serviceOrder')) {
    await page.goto(SERVICE_ORDER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  }
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await wait(1700);
  await ensureFilter(page, 'Situação', situation);
  try {
    await ensureFilter(page, 'Financeiro', 'Não Faturadas');
  } catch (error) {
    log('WARN', `Não foi possível fixar Financeiro=Não Faturadas: ${error.message}`);
  }
  await clickSearch(page);
  await wait(1500);
}

async function findOsInput(page) {
  const handle = await page.evaluateHandle(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find((input) => {
      const field = input.closest('.v-input, .v-field');
      const labelText = `${field ? field.innerText || '' : ''} ${input.placeholder || ''}`.trim();
      return labelText.trim().startsWith('O.S') || input.placeholder === 'O.S.';
    }) || inputs.find((input) => input.placeholder === 'Filtrar Pesquisa');
  });
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    throw new Error('Campo O.S. não encontrado.');
  }
  return element;
}

async function searchOs(page, osNumber) {
  const input = await findOsInput(page);
  const isTableFilter = await page.evaluate((el) => el.placeholder === 'Filtrar Pesquisa', input);
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(String(osNumber), { delay: 25 });
  await input.dispose();
  await wait(250);
  if (!isTableFilter) await clickSearch(page);
  await wait(1500);

  return page.evaluate((wantedOs) => {
    function normOs(value) {
      const text = String(value || '').trim().replace(/\.0+$/, '');
      const digits = text.replace(/[^0-9]/g, '');
      return digits || text;
    }
    const cells = Array.from(document.querySelectorAll('tbody td'));
    const osCell = cells.find((td) => normOs(td.textContent) === normOs(wantedOs));
    if (!osCell) return { found: false };
    const row = osCell.closest('tr');
    return { found: true, rowText: row ? row.innerText : '' };
  }, String(osNumber));
}

async function selectOsRow(page, osNumber) {
  const target = await page.evaluate((wantedOs) => {
    function normOs(value) {
      const text = String(value || '').trim().replace(/\.0+$/, '');
      const digits = text.replace(/[^0-9]/g, '');
      return digits || text;
    }
    const osCell = Array.from(document.querySelectorAll('tbody td'))
      .find((td) => normOs(td.textContent) === normOs(wantedOs));
    const row = osCell && osCell.closest('tr');
    if (!row) return { ok: false, reason: 'linha-nao-encontrada' };
    const candidates = [
      row.querySelector('.v-selection-control'),
      row.querySelector('.v-checkbox-btn'),
      row.querySelector('.v-selection-control__wrapper'),
      row.querySelector('[role="checkbox"]'),
      row.querySelector('input[type="checkbox"]'),
      row.querySelector('td:first-child'),
    ].filter(Boolean);
    const control = candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height;
    });
    if (!control) return { ok: false, reason: 'checkbox-nao-encontrado' };
    const rect = control.getBoundingClientRect();
    const input = row.querySelector('input[type="checkbox"]');
    return {
      ok: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      checked: Boolean(input && input.checked),
    };
  }, String(osNumber));

  if (!target?.ok) throw new Error(`Não foi possível selecionar a O.S. ${osNumber}: ${target?.reason || 'motivo desconhecido'}.`);
  if (!target.checked) {
    await page.mouse.click(target.x, target.y);
    await wait(650);
  }
}

async function visibleToolbarButtons(page) {
  return page.evaluate(() => {
    function compact(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    }
    return Array.from(document.querySelectorAll('button'))
      .map((button, domIndex) => {
        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.top < 30 || rect.top > 190) return null;
        let parent = button.parentElement;
        const ancestry = [];
        for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
          ancestry.push(compact(`${parent.className || ''} ${parent.getAttribute('data-action') || ''}`));
        }
        const icon = button.querySelector('lord-icon');
        return {
          domIndex,
          text: compact(button.innerText || button.textContent || ''),
          title: button.getAttribute('title') || '',
          ariaLabel: button.getAttribute('aria-label') || '',
          className: compact(button.className || ''),
          ancestry: ancestry.join(' | '),
          lordIcon: icon ? icon.getAttribute('src') || '' : '',
          disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('v-btn--disabled')),
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
  });
}

async function activeTooltipText(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="tooltip"], .v-tooltip, .v-tooltip__content, .v-overlay--active'));
    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) return '';
        return String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .join(' | ');
  });
}

async function findReopenAction(page) {
  const buttons = await visibleToolbarButtons(page);
  const direct = buttons.find((item) =>
    normText(`${item.text} ${item.title} ${item.ariaLabel} ${item.className} ${item.ancestry}`).includes('REABRIR')
  );
  if (direct) return { ...direct, method: 'atributo', tooltip: '' };

  for (const item of buttons) {
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
    await wait(300);
    const tooltip = await activeTooltipText(page);
    if (normText(tooltip).includes('REABRIR')) {
      return { ...item, method: 'tooltip', tooltip };
    }
  }

  log('ERROR', `Botões visíveis sem ação Reabrir identificada: ${JSON.stringify(buttons)}`);
  return null;
}

async function findReopenModal(page) {
  return page.evaluate(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
    const modal = roots.find((root) => norm(root.innerText || root.textContent || '').includes('REABRIR'));
    if (!modal) return null;
    return {
      text: String(modal.innerText || modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      buttons: Array.from(modal.querySelectorAll('button')).map((button) => ({
        text: String(button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
        disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
      })),
    };
  });
}

async function clickReopenConfirm(page) {
  const handle = await page.evaluateHandle(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
    const modal = roots.find((root) => norm(root.innerText || root.textContent || '').includes('REABRIR'));
    if (!modal) return false;
    return Array.from(modal.querySelectorAll('button')).find((button) => {
      const text = norm(button.innerText || button.textContent || '');
      const rect = button.getBoundingClientRect();
      const enabled = !button.disabled && button.getAttribute('aria-disabled') !== 'true';
      return enabled && rect.width && rect.height && (text === 'REABRIR' || text.includes('REABRIR OS'));
    }) || false;
  });
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    const diagnostic = await findReopenModal(page);
    throw new Error(`Modal de reabertura aberto, mas botão REABRIR não foi identificado. Modal: ${JSON.stringify(diagnostic)}`);
  }
  await element.click({ delay: 100 });
  await handle.dispose();
}

async function waitModalClosed(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const modal = await findReopenModal(page);
    if (!modal) return;
    await wait(450);
  }
  throw new Error('O modal de reabertura não fechou após a confirmação.');
}

async function verifyOpen(page, osNumber) {
  await openServiceOrderPage(page, 'Abertas');
  const result = await searchOs(page, osNumber);
  return result.found;
}

async function processItem(page, item, config) {
  await openServiceOrderPage(page, 'Abertas');
  if ((await searchOs(page, item.os)).found) {
    return { status: 'JA_REABERTA', details: { motivo: 'A O.S. já aparece em Abertas no GRM.' } };
  }

  await openServiceOrderPage(page, 'Finalizadas');
  const closed = await searchOs(page, item.os);
  if (!closed.found) {
    throw new Error('A O.S. não aparece nem em Abertas nem em Finalizadas/Não Faturadas. Reabertura automática bloqueada.');
  }

  await selectOsRow(page, item.os);
  const action = await findReopenAction(page);
  if (!action) throw new Error('A ação Reabrir OS não foi identificada de forma segura na barra do GRM.');
  if (action.disabled) throw new Error('A ação Reabrir OS está desabilitada no GRM para esta O.S.');

  log('INFO', `Ação Reabrir identificada por ${action.method}${action.tooltip ? ` (${action.tooltip})` : ''}.`);

  if (config.dryRun) {
    return {
      status: 'DRY_RUN_OK',
      details: { action_method: action.method, tooltip: action.tooltip || null, row: closed.rowText || null },
    };
  }

  await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2);
  await wait(800);

  const modal = await findReopenModal(page);
  if (modal) {
    log('INFO', `Modal de reabertura detectado: ${modal.text}`);
    await clickReopenConfirm(page);
    await waitModalClosed(page, 45000);
  } else {
    log('INFO', 'Ação Reabrir não exibiu modal; verificando diretamente o estado da O.S.');
  }

  const opened = await verifyOpen(page, item.os);
  if (!opened) {
    throw new Error('A ação de reabertura foi acionada, mas a O.S. não apareceu em Abertas na validação final.');
  }

  return { status: 'REABERTA', details: { action_method: action.method, modal: modal || null } };
}

async function main() {
  assertConfig();
  const args = parseArgs(process.argv.slice(2));
  const config = {
    dryRun: args.dryRun == null ? ENV_DRY_RUN : args.dryRun,
    debug: Boolean(args.debug || ENV_DEBUG),
    onlyOs: args.os ? normOs(args.os) : null,
    priorityMax: Number.isFinite(args.priorityMax) ? Math.max(1, Math.min(2, args.priorityMax)) : ENV_PRIORITY_MAX,
  };

  await ensureAgentEnabled();
  const item = await claimQueueItem(config);
  if (!item) {
    log('INFO', `Nenhuma O.S. pendente na fila para prioridade <= ${config.priorityMax}${config.onlyOs ? ` / O.S. ${config.onlyOs}` : ''}.`);
    return;
  }

  let executionId = null;
  let browser = null;
  let queueFinished = false;

  try {
    executionId = await createExecution(item, config.dryRun);
    log('INFO', `=== Reabertura O.S. ${item.os} | prioridade ${item.prioridade} | ${config.dryRun ? 'DRY-RUN' : 'REAL'} ===`);
    log('INFO', `Motivos: ${(item.motivos || []).join(', ')} | serviço: ${item.servico || '?'} | remanescente: ${item.remanescente ?? '?'}.`);

    browser = await puppeteer.launch({
      headless: process.env.GRM_HEADLESS === 'new' ? 'new' : true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      dumpio: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--noerrdialogs',
        '--disable-breakpad',
        '--disable-crashpad',
        '--disable-crash-reporter',
        '--disable-gpu',
        '--disable-software-rasterizer',
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
      defaultViewport: { width: 1680, height: 900 },
    });
    browserAtual = browser;
    const page = await browser.newPage();
    await page.setViewport({ width: 1680, height: 900 });
    page.setDefaultTimeout(30000);

    await login(page);
    const result = await processItem(page, item, config);

    if (config.debug) await screenshot(page, `os-${item.os}-${result.status.toLowerCase()}.png`);

    if (result.status === 'DRY_RUN_OK') {
      await finishQueueItem(item, 'PENDENTE_REABERTURA', null, 'Dry-run validou presença da O.S. e identificou a ação Reabrir; nenhuma alteração no GRM.');
      queueFinished = true;
      await finishExecution(executionId, { status: 'DRY_RUN_OK', detalhes: result.details || {} });
      log('SUCCESS', `O.S. ${item.os}: dry-run concluído sem alteração.`);
      return;
    }

    await finishQueueItem(item, result.status, null, result.status === 'JA_REABERTA'
      ? 'O.S. já estava aberta no GRM no momento da execução.'
      : 'Reaberta automaticamente para corrigir finalização indevida do agente.');
    queueFinished = true;
    await finishExecution(executionId, { status: result.status, detalhes: result.details || {} });
    log('SUCCESS', `O.S. ${item.os}: ${result.status}.`);

    if (!config.dryRun && ENV_CHAIN && result.status === 'REABERTA') {
      const { data, error } = await supabase.rpc('enqueue_grm_reabertura_os');
      if (error) log('WARN', `Não foi possível enfileirar a próxima reabertura: ${error.message}`);
      else log('INFO', `Próxima reabertura: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    const message = String(error.stack || error.message || error);
    log('ERROR', message);
    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[pages.length - 1];
        if (page) await screenshot(page, `erro-os-${item.os}.png`);
      } catch (_) {}
    }
    if (!queueFinished) await finishQueueItem(item, 'ERRO_REABERTURA', message.slice(0, 3000), 'Falha técnica na tentativa automática de reabertura.');
    await finishExecution(executionId, { status: 'ERRO', erro: message.slice(0, 4000) }).catch(() => {});
    process.exitCode = 1;
  } finally {
    browserAtual = null;
    if (browser) await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
      log('ERROR', String(error.stack || error.message || error));
      process.exit(1);
    });

  setTimeout(() => {
    log('ERROR', `Timeout geral de ${ENV_TIMEOUT_MS}ms atingido.`);
    if (browserAtual) browserAtual.close().catch(() => {});
    process.exit(1);
  }, ENV_TIMEOUT_MS).unref();
}

module.exports = { normText, normOs };
