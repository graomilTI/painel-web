#!/usr/bin/env node
'use strict';

const AGENT_VERSION = 'V12-LOTES-RESILIENTES';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
// O cPanel ainda executa Node 16. Versões recentes do supabase-js esperam as
// classes Fetch globais que só vêm nativas no Node 18+. O pacote já é
// dependência transitiva do próprio Supabase e mantém o agente compatível sem
// alterar o runtime dos demais workers.
if (typeof globalThis.Headers === 'undefined') {
  let nodeFetch;
  try {
    nodeFetch = require('node-fetch');
  } catch (_) {
    nodeFetch = require(require('path').join(
      __dirname,
      'node_modules/puppeteer/node_modules/node-fetch',
    ));
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

const STAFF_URL = process.env.GRM_LIBERACAO_DESPESAS_URL
  || 'https://www.grmserver.com.br/adm/team/staff';
const LOGIN_URL = process.env.GRMSERVER_LOGIN_URL
  || 'https://www.grmserver.com.br/login';

const DRY_RUN = String(
  process.env.GRM_LIBERACAO_DESPESAS_DRY_RUN ?? 'true',
).toLowerCase() !== 'false';

const HEADLESS = String(
  process.env.GRM_HEADLESS ?? 'true',
).toLowerCase() !== 'false';

const DEBUG = String(
  process.env.GRM_LIBERACAO_DESPESAS_DEBUG ?? 'false',
).toLowerCase() === 'true';

const MAX_PER_RUN = Math.max(
  1,
  Number(process.env.GRM_LIBERACAO_DESPESAS_MAX_POR_EXECUCAO || 2),
);

const SCREENSHOT_DIR = process.env.GRM_LIBERACAO_DESPESAS_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/liberacao-despesas';

const DEFAULT_TIMEOUT = Math.max(
  15000,
  Number(process.env.GRM_LIBERACAO_DESPESAS_TIMEOUT_MS || 45000),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;

const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
}
if (!GRM_USER || !GRM_PASSWORD) {
  throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${safeJson(extra)}`;
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

function todaySaoPaulo() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

async function activateTodayQueue() {
  const today = todaySaoPaulo();
  const now = new Date().toISOString();

  // A RPC antiga também inferia LIMPAR para colaboradores ausentes da fila da
  // versão mais recente. Em publicações parciais isso podia apagar regras que
  // continuavam desejadas. O worker agora apenas promove itens já publicados
  // para hoje e expira itens antigos; somente a Edge Function pode criar ações.
  const { data: activated, error: activateError } = await supabase
    .from('grm_despesas_fila')
    .update({
      status: 'PENDENTE',
      locked_at: null,
      finalizado_em: null,
      ultimo_erro: null,
    })
    .eq('status', 'AGENDADO')
    .eq('data_referencia', today)
    .select('id');

  if (activateError) throw activateError;

  const { data: expired, error: expireError } = await supabase
    .from('grm_despesas_fila')
    .update({
      status: 'EXPIRADO',
      locked_at: null,
      finalizado_em: now,
      ultimo_erro: `Bloqueado por data: fila anterior a ${today}.`,
    })
    .in('status', ['PENDENTE', 'ERRO', 'PROCESSANDO', 'AGENDADO'])
    .lt('data_referencia', today)
    .select('id');

  if (expireError) throw expireError;

  const result = {
    hoje_sao_paulo: today,
    agendados_ativados: activated?.length || 0,
    expirados: expired?.length || 0,
    limpezas_geradas: 0,
  };

  log('INFO', 'Ativação segura da fila diária concluída.', result);
  return result;
}

function autoObrigatorioPorTipo(tipo) {
  const key = norm(tipo);

  return key === 'ALMOCO'
    || key === 'SALARIO DE INTERMITENTE'
    || key === 'SERVICOS TERCEIRIZADOS';
}

// Trava de segurança: só Almoço, Salário de Intermitente e Serviços
// Terceirizados podem sair como AUTO no GRM. Qualquer outro tipo tem o AUTO
// zerado aqui, mesmo que job.regras (vindo de grm_despesas_tipos_config)
// tenha chegado com auto=true por engano/edição manual na tabela — a
// publicação (Edge Function) é a origem dos dados, mas este worker é quem
// efetivamente marca a caixinha no GRM, então não confia cegamente na fonte.
function desiredRules(rules) {
  return canonicalRules(
    (Array.isArray(rules) ? rules : []).map((rule) => ({
      ...rule,
      auto: autoObrigatorioPorTipo(rule?.tipo_despesa),
    })),
  );
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

    if (rule.tipo_despesa) {
      unique.set(norm(rule.tipo_despesa), rule);
    }
  }

  return [...unique.values()].sort((a, b) =>
    a.tipo_despesa.localeCompare(b.tipo_despesa, 'pt-BR'));
}

function rulesEqual(current, desired, autoLockedTypes) {
  // Exibir e Carga/NHE são definidos e, em algumas categorias, bloqueados
  // pelo próprio GRM. Eles não fazem parte do contrato deste agente: não são
  // alterados e também não podem transformar uma aplicação válida em
  // divergência. A conferência cobre somente os campos sob nossa gestão.
  //
  // AUTO entra na mesma exceção quando o próprio GRM trava a caixinha: a
  // despesa deve ser liberada (valor/máx. mov. aplicados) mesmo que o AUTO
  // não possa ser marcado — só nesse caso o campo sai da comparação.
  const locked = autoLockedTypes || new Set();
  const comparable = (rules) => canonicalRules(rules).map((rule) => ({
    tipo_despesa: rule.tipo_despesa,
    valor_maximo: rule.valor_maximo,
    auto: locked.has(norm(rule.tipo_despesa)) ? null : rule.auto,
    max_mov_dia: rule.max_mov_dia,
  }));

  return JSON.stringify(comparable(current))
    === JSON.stringify(comparable(desiredRules(desired)));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function screenshotPath(job, label) {
  ensureDir(SCREENSHOT_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(
    SCREENSHOT_DIR,
    `${stamp}_${digits(job.cpf)}_${label}.png`,
  );
}

async function takeScreenshot(page, job, label) {
  const file = screenshotPath(job, label);

  try {
    await page.screenshot({
      path: file,
      fullPage: true,
    });
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
    defaultViewport: {
      width: 1920,
      height: 1440,
    },
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

  await page.goto(LOGIN_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  const userSelector = 'input#input-v-2';
  const passwordSelector = 'input#input-v-5';

  await page.waitForSelector(userSelector, {
    timeout: DEFAULT_TIMEOUT,
  });
  await page.waitForSelector(passwordSelector, {
    timeout: DEFAULT_TIMEOUT,
  });

  await page.click(userSelector, { clickCount: 3 });
  await page.type(userSelector, GRM_USER, { delay: 15 });

  await page.click(passwordSelector, { clickCount: 3 });
  await page.type(passwordSelector, GRM_PASSWORD, { delay: 15 });

  await Promise.allSettled([
    page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout: 60000,
    }),
    page.click('button.submit-btn'),
  ]);

  await sleep(1500);
  log('SUCCESS', 'Login concluído.');
}

async function openStaffPage(page) {
  await page.goto(STAFF_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /CONTROLE DE FUNCION[ÁA]RIOS/i.test(text)
      || /Nome, Email ou CPF/i.test(text);
  }, {
    timeout: DEFAULT_TIMEOUT,
  });
}

async function setSearchCpf(page, cpf) {
  const found = await page.evaluate((cpfValue) => {
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const inputs = [...document.querySelectorAll('input')];

    const input = inputs.find((el) =>
      /nome.*email.*cpf/i.test(el.getAttribute('placeholder') || ''))
      || inputs.find((el) =>
        /cpf/i.test(el.getAttribute('placeholder') || ''));

    if (!input) return false;

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;

    if (setter) setter.call(input, onlyDigits(cpfValue));
    else input.value = onlyDigits(cpfValue);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();

    return true;
  }, cpf);

  if (!found) {
    throw new Error('Campo de busca Nome, Email ou CPF não localizado.');
  }

  await sleep(1200);
}

async function selectExactStaffRow(page, cpf) {
  const cpfDigits = digits(cpf);

  await page.waitForFunction((targetCpf) => {
    const onlyDigits = (value) =>
      String(value || '').replace(/\D/g, '');

    return [...document.querySelectorAll('tr')]
      .some((row) => onlyDigits(row.innerText).includes(targetCpf));
  }, {
    timeout: DEFAULT_TIMEOUT,
  }, cpfDigits);

  const prepared = await page.evaluate((targetCpf) => {
    const onlyDigits = (value) =>
      String(value || '').replace(/\D/g, '');

    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(targetCpf));

    if (rows.length !== 1) {
      return {
        ok: false,
        matches: rows.length,
      };
    }

    const row = rows[0];

    const cpfCells = [...row.querySelectorAll('td')]
      .filter((cell) => onlyDigits(cell.innerText) === targetCpf);

    if (!cpfCells.length) {
      return {
        ok: false,
        matches: rows.length,
        reason: 'CPF não apareceu de forma exata na linha.',
      };
    }

    const checkbox = row.querySelector('input[type="checkbox"]');

    if (!checkbox) {
      return {
        ok: false,
        matches: rows.length,
        reason: 'Checkbox da linha não encontrado.',
      };
    }

    const selectionControl = checkbox.closest(
      '.v-selection-control, .v-checkbox, label',
    ) || checkbox.parentElement;

    row.dataset.grmAgentExactStaffRow = 'true';
    checkbox.dataset.grmAgentStaffCheckbox = 'true';

    if (selectionControl) {
      selectionControl.dataset.grmAgentStaffSelectionControl = 'true';
    }

    return {
      ok: true,
      checked: !!checkbox.checked,
      hasSelectionControl: !!selectionControl,
      text: row.innerText,
    };
  }, cpfDigits);

  if (!prepared.ok) {
    throw new Error(
      `Funcionário não localizado de forma única pelo CPF (${safeJson(prepared)}).`,
    );
  }

  const checkboxSelector = '[data-grm-agent-staff-checkbox="true"]';
  const selectionControlSelector =
    '[data-grm-agent-staff-selection-control="true"]';

  const isChecked = await page.$eval(
    checkboxSelector,
    (checkbox) => !!checkbox.checked,
  );

  if (!isChecked) {
    const selectionControl = await page.$(selectionControlSelector);

    // Vuetify mantém a seleção da tabela no componente que envolve o input.
    // Clicar somente no <input> pode alterar checkbox.checked sem atualizar o
    // model da tabela; nesse estado o GRM não exibe a ação Editar.
    if (selectionControl) {
      await page.click(selectionControlSelector);
    } else {
      await page.click(checkboxSelector);
    }
  }

  await page.waitForFunction((selector) => {
    const checkbox = document.querySelector(selector);
    if (!checkbox) return false;

    const row = checkbox.closest('tr');
    const icon = row?.querySelector('.v-selection-control__input i');

    return checkbox.checked === true
      || /checkbox-marked|mdi-checkbox-marked/i.test(
        icon?.className || '',
      );
  }, {
    timeout: 5000,
  }, checkboxSelector);

  // A ação de edição é renderizada somente depois que o estado de seleção do
  // Vuetify foi atualizado. Esperar por ela também impede que um input apenas
  // visualmente marcado seja tratado como uma seleção válida.
  await page.waitForFunction(() => {
    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    return [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .some((button) => {
        const wrapperClass = typeof button.parentElement?.className === 'string'
          ? button.parentElement.className
          : '';
        const label = normalize([
          button.getAttribute('title'),
          button.getAttribute('aria-label'),
          button.textContent,
          wrapperClass,
        ].filter(Boolean).join(' '));

        return /(^|\s|-)EDIT(AR)?($|\s|-)/.test(label)
          || /STAFF.*EDIT|EDIT.*STAFF/.test(label);
      });
  }, {
    timeout: DEFAULT_TIMEOUT,
  });

  await sleep(300);

  return prepared;
}

async function waitEditModal(page, timeoutMs = 6000) {
  try {
    await page.waitForFunction(() => {
      const visible = (el) =>
        !!el
        && el.getClientRects().length > 0
        && getComputedStyle(el).visibility !== 'hidden'
        && getComputedStyle(el).display !== 'none';

      const containers = [
        ...document.querySelectorAll(
          '[role="dialog"], .v-overlay__content, .v-dialog, '
          + '[class*="modal"], [class*="dialog"]',
        ),
      ].filter(visible);

      return containers.some((container) => {
        const text = container.innerText || '';
        return /EDITAR FUNCION[ÁA]RIO/i.test(text)
          || /MOBILE\s*-\s*CONFIGURAÇÕES E PERMISSÕES/i.test(text)
          || /REGRAS DE CAIXA OPERACIONAL/i.test(text);
      });
    }, {
      timeout: timeoutMs,
    });

    return true;
  } catch {
    return false;
  }
}

async function clickEdit(page, cpf) {
  const targetCpf = digits(cpf);

  // Na interface atual o lápis Editar fica imediatamente antes do contêiner
  // .act-overflow. Portanto, subir a partir da busca até o menor ancestral com
  // vários botões encontra XLS e as demais ações, mas deixa o lápis de fora.
  // Localize primeiro o botão na barra completa pela posição e pelo ícone.
  const directEdit = await page.evaluate(() => {
    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const searchInput = [...document.querySelectorAll('input')]
      .find((input) =>
        /nome.*email.*cpf/i.test(
          input.getAttribute('placeholder') || '',
        ));

    if (!searchInput) return null;

    const searchRect = searchInput.getBoundingClientRect();
    const buttons = [
      ...document.querySelectorAll('button, [role="button"]'),
    ].filter(visible);

    const candidates = buttons
      .filter((button) =>
        !button.disabled
        && button.getAttribute('aria-disabled') !== 'true')
      .filter((button) => {
        const rect = button.getBoundingClientRect();

        return rect.right <= searchRect.left + 20
          && rect.left > 240
          && Math.abs(rect.top - searchRect.top) < 100;
      })
      .filter((button) => {
        const ancestry = [];
        let node = button;

        for (let depth = 0; node && depth < 4; depth += 1) {
          ancestry.push(
            typeof node.className === 'string' ? node.className : '',
          );
          node = node.parentElement;
        }

        const html = button.outerHTML;
        const signature = `${ancestry.join(' ')} ${html}`.toLowerCase();

        return /staff.*edit|edit.*staff|pencil|edit-outline/.test(signature);
      })
      .sort((a, b) =>
        a.getBoundingClientRect().left
        - b.getBoundingClientRect().left);

    if (!candidates.length) return null;

    const button = candidates[0];
    const rect = button.getBoundingClientRect();

    button.dataset.grmAgentDirectEdit = 'true';

    return {
      selector: '[data-grm-agent-direct-edit="true"]',
      x: rect.left,
      y: rect.top,
      html: button.outerHTML.slice(0, 5000),
    };
  });

  if (directEdit) {
    await page.click(directEdit.selector);
    await sleep(800);

    if (await waitEditModal(page, 10000)) {
      log('INFO', 'Cadastro aberto pelo lápis Editar.', directEdit);

      return {
        clicked: true,
        method: 'DIRECT_PENCIL_EDIT',
        ...directEdit,
      };
    }
  }

  // Fluxo real do GRM:
  // 1. seleciona a linha pelo checkbox;
  // 2. clica no ícone de lápis "Editar" da barra superior.
  //
  // O ícone do olho na última coluna apenas abre visualização e não serve
  // para editar as Regras de Caixa Operacional.
  const toolbarEdit = await page.evaluate((cpfValue) => {
    const onlyDigits = (value) =>
      String(value || '').replace(/\D/g, '');

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(cpfValue));

    if (rows.length !== 1) {
      return {
        clicked: false,
        reason: 'ROW_NOT_UNIQUE',
        matches: rows.length,
      };
    }

    const row = rows[0];
    const checkbox = row.querySelector('input[type="checkbox"]');

    if (!checkbox) {
      return {
        clicked: false,
        reason: 'CHECKBOX_NOT_FOUND',
      };
    }

    const searchInput = [...document.querySelectorAll('input')]
      .find((input) =>
        /nome.*email.*cpf/i.test(
          input.getAttribute('placeholder') || '',
        ));

    if (!searchInput) {
      return {
        clicked: false,
        reason: 'SEARCH_INPUT_NOT_FOUND',
      };
    }

    // Sobe a partir do campo de busca até encontrar a barra que contém
    // vários botões de ação, mantendo o menor contêiner possível.
    let toolbar = searchInput.parentElement;
    let best = null;

    while (toolbar && toolbar !== document.body) {
      const buttons = [
        ...toolbar.querySelectorAll('button, [role="button"]'),
      ].filter(visible);

      if (buttons.length >= 3) {
        best = {
          element: toolbar,
          buttons,
        };
        break;
      }

      toolbar = toolbar.parentElement;
    }

    if (!best) {
      return {
        clicked: false,
        reason: 'TOOLBAR_NOT_FOUND',
      };
    }

    const searchRect = searchInput.getBoundingClientRect();

    // Confirmado por diagnóstico real (CPF 00037200127, 2026-08-05): a barra
    // pode reordenar ou ocultar botões conforme o tipo/status do colaborador,
    // e o botão mais à esquerda às vezes é XLS, não Editar -- clicar nele só
    // abre um tooltip e o agente trava esperando um modal que nunca abre.
    // Excluímos aqui os wrappers de ações que já confirmamos NÃO serem
    // Editar (algumas potencialmente destrutivas, como desativar), em vez de
    // assumir posição fixa.
    const NON_EDIT_WRAPPER_CLASSES = [
      'act-staff-xls', 'act-staff-unavailable', 'act-checkin',
      'act-operational-flow', 'staff-history', 'staff-act-deactivate',
      'staff-act-upload', 'staff-act-add', 'staff-act-config',
      'staff-act-filter', 'staff-act-search',
    ];
    const hasNonEditWrapper = (button) => {
      let node = button;
      while (node && node !== best.element) {
        if (
          typeof node.className === 'string'
          && NON_EDIT_WRAPPER_CLASSES.some((cls) => node.className.includes(cls))
        ) return true;
        node = node.parentElement;
      }
      return false;
    };

    const candidates = best.buttons
      .filter((button) =>
        !button.disabled
        && button.getAttribute('aria-disabled') !== 'true')
      .filter((button) => {
        const rect = button.getBoundingClientRect();

        return rect.right <= searchRect.left + 20
          && Math.abs(rect.top - searchRect.top) < 100;
      })
      .filter((button) => !hasNonEditWrapper(button))
      .sort((a, b) =>
        a.getBoundingClientRect().left
        - b.getBoundingClientRect().left);

    if (!candidates.length) {
      return {
        clicked: false,
        reason: 'EDIT_CANDIDATE_NOT_FOUND',
        toolbarHtml: best.element.outerHTML.slice(0, 16000),
      };
    }

    // Dos botões restantes (já sem os wrappers conhecidos como não-Editar),
    // o mais à esquerda continua sendo o candidato mais provável ao lápis
    // Editar.
    const editButton = candidates[0];

    editButton.dataset.grmAgentEditButton = 'true';

    const rect = editButton.getBoundingClientRect();

    return {
      clicked: false,
      prepared: true,
      selector: '[data-grm-agent-edit-button="true"]',
      checked: checkbox.checked,
      candidates: candidates.length,
      x: rect.left,
      y: rect.top,
      className: typeof editButton.className === 'string'
        ? editButton.className
        : '',
      html: editButton.outerHTML.slice(0, 5000),
    };
  }, targetCpf);

  if (toolbarEdit.prepared) {
    await page.click(toolbarEdit.selector);
    await sleep(800);

    if (await waitEditModal(page, 10000)) {
      log(
        'INFO',
        'Cadastro aberto pelo botão Editar da barra superior.',
        toolbarEdit,
      );

      return {
        ...toolbarEdit,
        clicked: true,
        method: 'TOP_TOOLBAR_EDIT',
      };
    }
  }

  // Fallback por coordenadas do primeiro botão ativo na barra superior.
  const coordinateResult = await page.evaluate(() => {
    const searchInput = [...document.querySelectorAll('input')]
      .find((input) =>
        /nome.*email.*cpf/i.test(
          input.getAttribute('placeholder') || '',
        ));

    if (!searchInput) return null;

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    let toolbar = searchInput.parentElement;

    while (toolbar && toolbar !== document.body) {
      const buttons = [
        ...toolbar.querySelectorAll('button, [role="button"]'),
      ].filter(visible);

      if (buttons.length >= 3) {
        const searchRect = searchInput.getBoundingClientRect();

        const NON_EDIT_WRAPPER_CLASSES = [
          'act-staff-xls', 'act-staff-unavailable', 'act-checkin',
          'act-operational-flow', 'staff-history', 'staff-act-deactivate',
          'staff-act-upload', 'staff-act-add', 'staff-act-config',
          'staff-act-filter', 'staff-act-search',
        ];
        const hasNonEditWrapper = (button) => {
          let node = button;
          while (node && node !== toolbar) {
            if (
              typeof node.className === 'string'
              && NON_EDIT_WRAPPER_CLASSES.some((cls) => node.className.includes(cls))
            ) return true;
            node = node.parentElement;
          }
          return false;
        };

        const candidates = buttons
          .filter((button) =>
            !button.disabled
            && button.getAttribute('aria-disabled') !== 'true')
          .filter((button) => {
            const rect = button.getBoundingClientRect();

            return rect.right <= searchRect.left + 20
              && Math.abs(rect.top - searchRect.top) < 100;
          })
          .filter((button) => !hasNonEditWrapper(button))
          .sort((a, b) =>
            a.getBoundingClientRect().left
            - b.getBoundingClientRect().left);

        if (!candidates.length) return null;

        const rect = candidates[0].getBoundingClientRect();

        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          html: candidates[0].outerHTML.slice(0, 5000),
        };
      }

      toolbar = toolbar.parentElement;
    }

    return null;
  });

  if (coordinateResult) {
    await page.mouse.click(
      coordinateResult.x,
      coordinateResult.y,
    );

    await sleep(800);

    if (await waitEditModal(page, 10000)) {
      log(
        'INFO',
        'Cadastro aberto pelo botão Editar via coordenadas.',
        coordinateResult,
      );

      return {
        clicked: true,
        method: 'TOP_TOOLBAR_EDIT_COORDINATES',
        ...coordinateResult,
      };
    }
  }

  const diagnostic = await page.evaluate((cpfValue) => {
    const onlyDigits = (value) =>
      String(value || '').replace(/\D/g, '');

    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const rows = [...document.querySelectorAll('tr')]
      .filter((row) => onlyDigits(row.innerText).includes(cpfValue));

    const row = rows.length === 1 ? rows[0] : null;
    const checkbox = row?.querySelector('input[type="checkbox"]');

    const searchInput = [...document.querySelectorAll('input')]
      .find((input) =>
        /nome.*email.*cpf/i.test(
          input.getAttribute('placeholder') || '',
        ));

    let toolbar = searchInput?.parentElement || null;
    let toolbarData = null;

    while (toolbar && toolbar !== document.body) {
      const buttons = [
        ...toolbar.querySelectorAll('button, [role="button"]'),
      ].filter(visible);

      if (buttons.length >= 3) {
        toolbarData = {
          html: toolbar.outerHTML.slice(0, 20000),
          buttons: buttons.map((button, index) => ({
            index,
            disabled: !!button.disabled,
            ariaDisabled: button.getAttribute('aria-disabled'),
            text: normalize(button.textContent).slice(0, 100),
            title: button.getAttribute('title'),
            aria: button.getAttribute('aria-label'),
            cls: typeof button.className === 'string'
              ? button.className.slice(0, 250)
              : '',
            rect: (() => {
              const rect = button.getBoundingClientRect();

              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              };
            })(),
            html: button.outerHTML.slice(0, 5000),
          })),
        };

        break;
      }

      toolbar = toolbar.parentElement;
    }

    return {
      url: location.href,
      rowMatches: rows.length,
      rowText: row?.innerText?.slice(0, 2000) || null,
      checkboxChecked: checkbox?.checked ?? null,
      checkboxHtml: checkbox?.outerHTML?.slice(0, 2000) || null,
      toolbar: toolbarData,
      dialogs: [
        ...document.querySelectorAll(
          '[role="dialog"], .v-overlay__content, .v-dialog, '
          + '[class*="modal"], [class*="dialog"]',
        ),
      ]
        .filter(visible)
        .map((dialog) => ({
          text: dialog.innerText?.slice(0, 6000) || '',
          html: dialog.outerHTML.slice(0, 12000),
        }))
        .slice(0, 10),
    };
  }, targetCpf);

  const wrongButtonTooltip = (diagnostic.dialogs || [])
    .map((dialog) => dialog.text)
    .find((text) => /\bXLS\b/i.test(text) || /exportar/i.test(text));

  const hint = wrongButtonTooltip
    ? ` Provável causa: o clique caiu num botão diferente de Editar `
      + `(tooltip visível: "${wrongButtonTooltip.slice(0, 120)}"). `
      + 'A barra de ações deste colaborador pode ter Editar oculto/reordenado '
      + 'no GRM; revisar NON_EDIT_WRAPPER_CLASSES em clickEdit().'
    : '';

  throw new Error(
    'Botão Editar da barra superior não abriu o funcionário.'
    + hint
    + ` Diagnóstico: ${safeJson(diagnostic)}`,
  );
}

async function closeModal(page) {
  await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const dialogs = [
      ...document.querySelectorAll(
        '[role="dialog"], .v-overlay__content, .v-dialog, '
        + '[class*="modal"], [class*="dialog"]',
      ),
    ].filter(visible);

    const modal = dialogs.find((container) => {
      const text = normalize(container.innerText);

      return text.includes('EDITAR FUNCIONARIO')
        || text.includes('MOBILE CONFIGURACOES E PERMISSOES')
        || text.includes('REGRAS DE CAIXA OPERACIONAL');
    }) || dialogs[dialogs.length - 1];

    if (!modal) return;

    const buttons = [
      ...modal.querySelectorAll('button, [role="button"]'),
    ].filter(visible);

    const cancel = buttons.find((el) =>
      normalize(el.textContent) === 'CANCELAR');

    if (cancel) {
      cancel.click();
      return;
    }

    const close = buttons.find((el) => {
      const key = normalize([
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.textContent,
        typeof el.className === 'string' ? el.className : '',
      ].filter(Boolean).join(' '));

      return /\bFECHAR\b|\bCLOSE\b|\bV ICON CLOSE\b|\bMDI CLOSE\b/.test(key);
    });

    close?.click();
  });

  await sleep(400);
}

async function openCashRulesSection(page) {
  const found = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const labels = [...document.querySelectorAll('*')]
      .filter((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    const label = labels.find((el) => el.getClientRects().length > 0);

    if (!label) return false;

    label.scrollIntoView({
      block: 'center',
    });

    const clickable = label.closest(
      'button, [role="button"]',
    ) || label.parentElement;

    clickable?.click();
    return true;
  });

  if (!found) {
    throw new Error('Seção Regras de Caixa Operacional não localizada.');
  }

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';

    return /TIPO DE DESPESA/i.test(text)
      || /ESTE USU[ÁA]RIO AINDA N[ÃA]O POSSUI REGRAS DE CAIXA OPERACIONAL/i
        .test(text);
  }, {
    timeout: DEFAULT_TIMEOUT,
  });

  await sleep(400);
}

async function locateCashSection(page) {
  return page.evaluateHandle(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) return null;

    let section = label.parentElement;

    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      const hasTarget = text.includes('REGRAS DE CAIXA OPERACIONAL');
      const hasContent = text.includes('TIPO DE DESPESA')
        || text.includes('AINDA NAO POSSUI REGRAS');

      if (
        hasTarget
        && hasContent
        && section.getBoundingClientRect().height < window.innerHeight * 0.9
      ) {
        break;
      }

      section = section.parentElement;
    }

    return section || null;
  });
}

async function getCashSectionDiagnostic(page) {
  return page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) return null;

    let section = label.parentElement;

    while (section && section.parentElement) {
      const text = normalize(section.innerText);
      const hasTarget = text.includes('REGRAS DE CAIXA OPERACIONAL');
      const hasContent = text.includes('TIPO DE DESPESA')
        || text.includes('AINDA NAO POSSUI REGRAS');

      if (
        hasTarget
        && hasContent
        && section.getBoundingClientRect().height < window.innerHeight * 0.9
      ) {
        break;
      }

      section = section.parentElement;
    }

    if (!section) return null;

    return {
      text: section.innerText.slice(0, 6000),
      inputs: section.querySelectorAll('input').length,
      selects: section.querySelectorAll('select').length,
      buttons: [...section.querySelectorAll('button')]
        .map((button) => ({
          text: button.innerText,
          title: button.getAttribute('title'),
          aria: button.getAttribute('aria-label'),
        }))
        .slice(0, 40),
      html: section.outerHTML.slice(0, 12000),
    };
  });
}

async function readCashRules(page) {
  return page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const parseNumber = (value) => {
      const raw = String(value ?? '').trim();
      if (!raw) return 0;

      const cleaned = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;

      const number = Number(cleaned.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(number) ? number : 0;
    };

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) throw new Error('Seção de regras não encontrada.');

    let section = label.parentElement;
    while (section && section.parentElement) {
      const sectionText = normalize(section.innerText);
      if (
        sectionText.includes('TIPO DE DESPESA')
        && section.getBoundingClientRect().height < window.innerHeight * 0.9
      ) break;
      section = section.parentElement;
    }

    if (!section || normalize(section.innerText).includes('AINDA NAO POSSUI REGRAS')) {
      return [];
    }

    const rows = [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) => {
        const cells = row.querySelectorAll('td, [role="cell"]');
        return cells.length >= 6
          && row.querySelector('input, select, [role="combobox"]');
      });

    const rules = [];

    for (const row of rows) {
      const cells = [...row.querySelectorAll('td, [role="cell"]')];
      if (cells.length < 6) continue;

      const textInput = (cell) => [...cell.querySelectorAll(
        'input:not([type="checkbox"]), textarea, select, [role="combobox"]',
      )].find(visible);

      const checkbox = (cell) => [...cell.querySelectorAll('input[type="checkbox"]')]
        .find(visible);

      const typeField = textInput(cells[0]);
      let type = '';
      if (typeField?.tagName === 'SELECT') {
        type = typeField.selectedOptions?.[0]?.textContent || typeField.value || '';
      } else {
        type = typeField?.value || typeField?.textContent || cells[0].innerText || '';
      }
      type = String(type).trim();
      if (!type || normalize(type).includes('TIPO DE DESPESA')) continue;

      const moneyField = textInput(cells[2]);
      const maxMovField = textInput(cells[5]);

      rules.push({
        tipo_despesa: type,
        exibir: checkbox(cells[1])?.checked ?? true,
        valor_maximo: parseNumber(
          moneyField?.value
          || moneyField?.getAttribute?.('value')
          || cells[2].innerText,
        ),
        auto: checkbox(cells[3])?.checked ?? false,
        carga_nhe: checkbox(cells[4])?.checked ?? true,
        max_mov_dia: Math.max(0, Math.trunc(parseNumber(
          maxMovField?.value
          || maxMovField?.getAttribute?.('value')
          || cells[5].innerText,
        ) || 0)),
      });
    }

    return rules;
  });
}

async function getCashRowsCount(page) {
  return page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) return -1;

    let section = label.parentElement;

    while (section && section.parentElement) {
      const text = normalize(section.innerText);

      if (
        text.includes('TIPO DE DESPESA')
        && section.getBoundingClientRect().height < window.innerHeight * 0.9
      ) {
        break;
      }

      section = section.parentElement;
    }

    if (
      !section
      || normalize(section.innerText).includes('AINDA NAO POSSUI REGRAS')
    ) {
      return 0;
    }

    return [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) =>
        row.querySelector('input, select, [role="combobox"]'))
      .length;
  });
}

async function deleteCashRuleAtIndex(page, rowIndex) {
    const before = await getCashRowsCount(page);
    if (before <= 0 || rowIndex < 0 || rowIndex >= before) return;
    const prepared = await page.evaluate((requestedIndex) => {
      const normalize = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, ' ')
          .trim();

      const visible = (el) =>
        !!el
        && el.getClientRects().length > 0
        && getComputedStyle(el).visibility !== 'hidden'
        && getComputedStyle(el).display !== 'none';

      const label = [...document.querySelectorAll('*')]
        .find((el) =>
          el.children.length === 0
          && normalize(el.textContent)
            === 'REGRAS DE CAIXA OPERACIONAL');

      if (!label) {
        return { ok: false, reason: 'SECTION_NOT_FOUND' };
      }

      let section = label.parentElement;

      while (section && section.parentElement) {
        const sectionText = normalize(section.innerText);

        if (
          sectionText.includes('TIPO DE DESPESA')
          && section.getBoundingClientRect().height
            < window.innerHeight * 0.9
        ) {
          break;
        }

        section = section.parentElement;
      }

      if (!section) {
        return { ok: false, reason: 'SECTION_CONTAINER_NOT_FOUND' };
      }

      const rows = [...section.querySelectorAll('tr, [role="row"]')]
        .filter((row) =>
          row.querySelector('input, select, [role="combobox"]'));

      const row = rows[requestedIndex];

      if (!row) {
        return { ok: false, reason: 'RULE_ROW_NOT_FOUND' };
      }

      const cells = [...row.querySelectorAll('td')];
      const lastCell = cells[cells.length - 1] || row;

      const buttons = [
        ...lastCell.querySelectorAll('button, [role="button"]'),
      ].filter((button) =>
        visible(button)
        && !button.disabled
        && button.getAttribute('aria-disabled') !== 'true');

      let remove = buttons.find((button) => {
        const key = normalize([
          button.getAttribute('title'),
          button.getAttribute('aria-label'),
          button.getAttribute('data-testid'),
          typeof button.className === 'string'
            ? button.className
            : '',
          button.textContent,
          ...[...button.querySelectorAll('lord-icon, svg, use, i')]
            .map((icon) => [
              icon.getAttribute('src'),
              icon.getAttribute('href'),
              icon.getAttribute('data-icon'),
              typeof icon.className === 'string'
                ? icon.className
                : '',
            ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' '));

        return /EXCLUIR|REMOVER|DELETE|TRASH|LIXEIRA/.test(key);
      });

      if (!remove && buttons.length === 1) {
        remove = buttons[0];
      }

      if (!remove) {
        return {
          ok: false,
          reason: 'UNIQUE_DELETE_BUTTON_NOT_FOUND',
          buttons: buttons.length,
          rowText: row.innerText?.slice(0, 2000) || '',
          lastCellHtml: lastCell.outerHTML.slice(0, 10000),
        };
      }

      remove.dataset.grmAgentDeleteRule = 'true';

      return {
        ok: true,
        selector: '[data-grm-agent-delete-rule="true"]',
        rowText: row.innerText?.slice(0, 1000) || '',
        buttonHtml: remove.outerHTML.slice(0, 5000),
      };
    }, rowIndex);

    if (!prepared.ok) {
      throw new Error(
        'Botão seguro de exclusão da regra não foi localizado. '
        + `Diagnóstico: ${safeJson(prepared)}`,
      );
    }

    await page.click(prepared.selector);
    await sleep(350);

    const after = await getCashRowsCount(page);

    if (after >= before) {
      throw new Error(
        'A lixeira foi acionada, mas a quantidade de regras '
        + `não diminuiu (${before} -> ${after}).`,
      );
    }

    log(
      'INFO',
      `Regra removida com segurança (${before} -> ${after}).`,
      { row: prepared.rowText },
    );

    await sleep(250);
}

async function deleteAllCashRules(page) {
  let guard = 0;
  while (guard++ < 100) {
    const before = await getCashRowsCount(page);
    if (before <= 0) return;
    await deleteCashRuleAtIndex(page, before - 1);
  }

  throw new Error(
    'Limite de segurança excedido ao remover regras de Caixa Operacional.',
  );
}

async function addCashRuleRow(page) {
  const before = await getCashRowsCount(page);

  const prepared = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9+]+/g, ' ')
        .trim();

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent)
          === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) {
      return { ok: false, reason: 'SECTION_LABEL_NOT_FOUND' };
    }

    let header = label.parentElement;
    let chosen = null;

    while (header && header !== document.body) {
      const buttons = [
        ...header.querySelectorAll('button, [role="button"]'),
      ].filter((button) =>
        visible(button)
        && !button.disabled
        && button.getAttribute('aria-disabled') !== 'true');

      const plus = buttons.find((button) => {
        const key = normalize([
          button.textContent,
          button.getAttribute('title'),
          button.getAttribute('aria-label'),
          typeof button.className === 'string'
            ? button.className
            : '',
          ...[...button.querySelectorAll('lord-icon, svg, use, i')]
            .map((icon) => [
              icon.getAttribute('src'),
              icon.getAttribute('href'),
              icon.getAttribute('data-icon'),
              typeof icon.className === 'string'
                ? icon.className
                : '',
            ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' '));

        return key === '+'
          || /ADICIONAR|NOVA REGRA|PLUS|\bADD\b/.test(key);
      });

      if (plus) {
        chosen = plus;
        break;
      }

      if (
        buttons.length >= 1
        && normalize(header.innerText)
          .includes('REGRAS DE CAIXA OPERACIONAL')
        && header.getBoundingClientRect().height < 150
      ) {
        chosen = buttons[0];
        break;
      }

      header = header.parentElement;
    }

    if (!chosen) {
      return { ok: false, reason: 'ADD_BUTTON_NOT_FOUND' };
    }

    chosen.dataset.grmAgentAddRule = 'true';

    return {
      ok: true,
      selector: '[data-grm-agent-add-rule="true"]',
      html: chosen.outerHTML.slice(0, 5000),
    };
  });

  if (!prepared.ok) {
    throw new Error(
      'Botão + de Regras de Caixa Operacional não localizado. '
      + `Diagnóstico: ${safeJson(prepared)}`,
    );
  }

  await page.click(prepared.selector);
  await sleep(400);

  const after = await getCashRowsCount(page);

  if (after <= before) {
    throw new Error(
      'O botão + foi acionado, mas nenhuma nova regra apareceu '
      + `(${before} -> ${after}).`,
    );
  }

  await sleep(250);
}

async function chooseRuleType(page, rowIndex, typeText) {
  const descriptor = await page.evaluate((index) => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent) === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) return null;

    let section = label.parentElement;

    while (section && section.parentElement) {
      if (
        normalize(section.innerText).includes('TIPO DE DESPESA')
        && section.getBoundingClientRect().height < window.innerHeight * 0.9
      ) {
        break;
      }

      section = section.parentElement;
    }

    const rows = [...section.querySelectorAll('tr, [role="row"]')]
      .filter((row) =>
        row.querySelector('input, select, [role="combobox"]'));

    const row = rows[index];

    if (!row) return null;

    const native = row.querySelector('select');

    if (native) {
      native.dataset.grmAgentTarget = `type-${index}`;

      return {
        kind: 'select',
        selector: `[data-grm-agent-target="type-${index}"]`,
      };
    }

    const combo = row.querySelector(
      '[role="combobox"], input[type="text"]',
    );

    if (!combo) return null;

    combo.dataset.grmAgentTarget = `type-${index}`;

    return {
      kind: 'custom',
      selector: `[data-grm-agent-target="type-${index}"]`,
    };
  }, rowIndex);

  if (!descriptor) {
    throw new Error(
      `Campo Tipo de Despesa não localizado na linha ${rowIndex + 1}.`,
    );
  }

  if (descriptor.kind === 'select') {
    const options = await page.$eval(
      descriptor.selector,
      (select) => [...select.options].map((option) => ({
        value: option.value,
        text: option.textContent,
      })),
    );

    const match = options.find((option) =>
      norm(option.text) === norm(typeText));

    if (!match) {
      const error = new Error(
        `Tipo de despesa "${typeText}" não existe no seletor do GRM. `
          + `Opções disponíveis: ${options.map((option) => option.text).filter(Boolean).join(' | ') || 'nenhuma'}.`,
      );
      error.code = 'CATEGORIA_NAO_MAPEADA';
      error.requestedType = typeText;
      error.availableTypes = options.map((option) => option.text).filter(Boolean);
      throw error;
    }

    await page.select(descriptor.selector, match.value);
    return;
  }

  await page.click(descriptor.selector);
  await sleep(200);

  const input = await page.$(descriptor.selector);

  if (!input) {
    throw new Error(
      `Campo do tipo de despesa não permaneceu disponível para ${typeText}.`,
    );
  }

  await input.focus();

  await page.keyboard.down('Control');
  try {
    await page.keyboard.press('A');
  } finally {
    await page.keyboard.up('Control');
  }

  await input.type(typeText, {
    delay: 20,
  });

  let selected = false;
  let availableTypes = [];
  for (let attempt = 0; attempt < 4 && !selected; attempt += 1) {
    await sleep(attempt === 0 ? 350 : 500);

    const lookup = await page.evaluate((expected) => {
      const normalize = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, ' ')
          .trim();

      const options = [
        ...document.querySelectorAll(
          '[role="option"], li, .v-list-item, [class*="option"]',
        ),
      ].filter((el) => el.getClientRects().length > 0);

      const exact = options.find((el) =>
        normalize(el.textContent) === normalize(expected));

      const labels = [...new Set(options
        .map((el) => String(el.textContent || '').trim())
        .filter(Boolean))];

      if (!exact) return { selected: false, labels };

      exact.click();
      return { selected: true, labels };
    }, typeText);

    selected = lookup.selected;
    availableTypes = lookup.labels;
  }

  if (!selected) {
    const error = new Error(
      `Opção exata "${typeText}" não apareceu no dropdown do GRM. `
        + `Opções visíveis: ${availableTypes.join(' | ') || 'nenhuma'}.`,
    );
    error.code = 'CATEGORIA_NAO_MAPEADA';
    error.requestedType = typeText;
    error.availableTypes = availableTypes;
    throw error;
  }
}

// Confirma todos os nomes no seletor antes de remover qualquer regra atual.
// As linhas criadas aqui ficam somente no formulário e nunca são salvas: em
// sucesso, deleteAllCashRules() as remove junto com as linhas antigas; em erro,
// o modal é fechado e o cadastro do funcionário permanece intacto no GRM.
async function preflightDesiredRuleTypes(page, desired, currentCount) {
  for (let index = 0; index < desired.length; index += 1) {
    await addCashRuleRow(page);
    await chooseRuleType(page, currentCount + index, desired[index].tipo_despesa);
  }
}

async function fillCashRuleRow(page, rowIndex, rule) {
  await chooseRuleType(page, rowIndex, rule.tipo_despesa);

  const descriptor = await page.evaluate((index) => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

    const visible = (el) =>
      !!el
      && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none';

    const firstInput = (cell) => [
      ...cell.querySelectorAll(
        'input:not([type="checkbox"]), textarea',
      ),
    ].find(visible);

    const firstCheckbox = (cell) => [
      ...cell.querySelectorAll('input[type="checkbox"]'),
    ].find(visible);

    const label = [...document.querySelectorAll('*')]
      .find((el) =>
        el.children.length === 0
        && normalize(el.textContent)
          === 'REGRAS DE CAIXA OPERACIONAL');

    if (!label) {
      return {
        ok: false,
        reason: 'SECTION_NOT_FOUND',
      };
    }

    let section = label.parentElement;

    while (section && section.parentElement) {
      if (
        normalize(section.innerText)
          .includes('TIPO DE DESPESA')
        && section.getBoundingClientRect().height
          < window.innerHeight * 0.9
      ) {
        break;
      }

      section = section.parentElement;
    }

    const rows = [
      ...section.querySelectorAll('tr, [role="row"]'),
    ].filter((row) => {
      const cells = row.querySelectorAll(
        'td, [role="cell"]',
      );

      return cells.length >= 6
        && row.querySelector(
          'input, select, [role="combobox"]',
        );
    });

    const row = rows[index];

    if (!row) {
      return {
        ok: false,
        reason: 'ROW_NOT_FOUND',
        rows: rows.length,
      };
    }

    const cells = [
      ...row.querySelectorAll('td, [role="cell"]'),
    ];

    if (cells.length < 6) {
      return {
        ok: false,
        reason: 'COLUMN_COUNT_INVALID',
        cells: cells.length,
        rowHtml: row.outerHTML.slice(0, 16000),
      };
    }

    const money = firstInput(cells[2]);
    const maxMov = firstInput(cells[5]);
    const exibir = firstCheckbox(cells[1]);
    const auto = firstCheckbox(cells[3]);
    const carga = firstCheckbox(cells[4]);

    if (!money || !maxMov || money === maxMov) {
      return {
        ok: false,
        reason: money === maxMov
          ? 'SAME_NUMERIC_FIELD'
          : 'NUMERIC_FIELDS_NOT_FOUND',
        moneyFound: !!money,
        maxMovFound: !!maxMov,
        rowHtml: row.outerHTML.slice(0, 16000),
      };
    }

    money.dataset.grmAgentMoney = `money-${index}`;
    maxMov.dataset.grmAgentMaxMov = `max-${index}`;

    if (exibir) {
      exibir.dataset.grmAgentExibir = `exibir-${index}`;
    }
    if (auto) {
      auto.dataset.grmAgentAuto = `auto-${index}`;
    }
    if (carga) {
      carga.dataset.grmAgentCarga = `carga-${index}`;
    }

    return {
      ok: true,
      moneySelector:
        `[data-grm-agent-money="money-${index}"]`,
      maxSelector:
        `[data-grm-agent-max-mov="max-${index}"]`,
      exibirSelector: exibir
        ? `[data-grm-agent-exibir="exibir-${index}"]`
        : null,
      autoSelector: auto
        ? `[data-grm-agent-auto="auto-${index}"]`
        : null,
      cargaSelector: carga
        ? `[data-grm-agent-carga="carga-${index}"]`
        : null,
      moneyDisabled: !!money.disabled || !!money.readOnly,
      maxDisabled: !!maxMov.disabled || !!maxMov.readOnly,
      exibirDisabled: exibir
        ? !!exibir.disabled
          || exibir.getAttribute('aria-disabled') === 'true'
        : null,
      autoDisabled: auto
        ? !!auto.disabled
          || auto.getAttribute('aria-disabled') === 'true'
        : null,
      cargaDisabled: carga
        ? !!carga.disabled
          || carga.getAttribute('aria-disabled') === 'true'
        : null,
    };
  }, rowIndex);

  if (!descriptor.ok) {
    throw new Error(
      `Não foi possível identificar os campos da regra `
      + `${rule.tipo_despesa}: ${safeJson(descriptor)}`,
    );
  }

  const parseBrowserNumber = (value) => {
    const raw = String(value ?? '').trim();

    const cleaned = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw;

    const number = Number(
      cleaned.replace(/[^0-9.-]/g, ''),
    );

    return Number.isFinite(number) ? number : 0;
  };

  const readNumber = async (selector) => page.$eval(
    selector,
    (field) =>
      field.value
      || field.getAttribute('value')
      || '',
  ).then(parseBrowserNumber);

  const readCheckbox = async (selector) => {
    if (!selector) return null;

    return page.$eval(
      selector,
      (field) => !!field.checked,
    );
  };

  const selectAll = async (selector) => {
    await page.click(selector, {
      clickCount: 3,
    });

    await page.keyboard.down('Control');

    try {
      await page.keyboard.press('A');
    } finally {
      await page.keyboard.up('Control');
    }
  };

  const setTextAndVerify = async (
    selector,
    candidates,
    expected,
  ) => {
    let observed = null;

    for (const candidate of candidates) {
      await selectAll(selector);

      await page.keyboard.type(
        String(candidate),
        { delay: 25 },
      );

      await page.keyboard.press('Tab');
      await sleep(300);

      observed = await readNumber(selector);

      if (Math.abs(observed - expected) < 0.001) {
        return observed;
      }
    }

    throw new Error(
      `Campo ${selector} ficou com ${observed}; `
      + `esperado ${expected}.`,
    );
  };

  const expectedMoney = Number(
    rule.valor_maximo || 0,
  );

  if (descriptor.moneyDisabled) {
    const currentMoney = await readNumber(
      descriptor.moneySelector,
    );

    if (
      Math.abs(currentMoney - expectedMoney) >= 0.001
    ) {
      throw new Error(
        `Valor Máximo está bloqueado em ${currentMoney}; `
        + `esperado ${expectedMoney}.`,
      );
    }
  } else {
    const moneyCandidates = [
      expectedMoney.toFixed(2).replace('.', ','),
      String(Math.round(expectedMoney * 100)),
      expectedMoney.toFixed(2),
    ];

    await setTextAndVerify(
      descriptor.moneySelector,
      moneyCandidates,
      expectedMoney,
    );
  }

  const expectedMaxMov = Math.max(
    0,
    Number(rule.max_mov_dia || 0),
  );

  if (descriptor.maxDisabled) {
    const currentMax = await readNumber(
      descriptor.maxSelector,
    );

    if (
      Math.abs(currentMax - expectedMaxMov) >= 0.001
    ) {
      throw new Error(
        `Máx. Mov./Dia está bloqueado em ${currentMax}; `
        + `esperado ${expectedMaxMov}.`,
      );
    }
  } else {
    await setTextAndVerify(
      descriptor.maxSelector,
      [String(expectedMaxMov)],
      expectedMaxMov,
    );
  }

  const setCheckbox = async (
    selector,
    desired,
    disabled,
    label,
    allowLockedMismatch = false,
  ) => {
    if (!selector) return false;

    const checked = await readCheckbox(selector);

    if (disabled) {
      if (checked !== desired) {
        if (allowLockedMismatch) {
          log(
            'WARN',
            `${label} está bloqueado em ${checked} pelo GRM `
            + `(esperado ${desired}); despesa segue liberada mesmo assim.`,
          );

          return true;
        }

        throw new Error(
          `${label} está bloqueado em ${checked}; `
          + `esperado ${desired}.`,
        );
      }

      return false;
    }

    if (checked !== desired) {
      await page.click(selector);
      await sleep(150);
    }

    const confirmed = await readCheckbox(selector);

    if (confirmed !== desired) {
      throw new Error(
        `${label} ficou em ${confirmed}; `
        + `esperado ${desired}.`,
      );
    }

    return false;
  };

  // Quando o GRM trava o AUTO (checkbox desabilitado), a liberação da
  // despesa (valor/máx. mov.) segue mesmo assim — só o AUTO fica pendente
  // de ajuste manual do lado de lá. Ver rulesEqual().
  const autoLocked = await setCheckbox(
    descriptor.autoSelector,
    rule.auto === true,
    descriptor.autoDisabled,
    'AUTO',
    true,
  );

  const finalMoney = await readNumber(
    descriptor.moneySelector,
  );

  const finalMax = await readNumber(
    descriptor.maxSelector,
  );

  if (
    Math.abs(finalMoney - expectedMoney) >= 0.001
    || Math.abs(finalMax - expectedMaxMov) >= 0.001
  ) {
    throw new Error(
      `Valores do formulário divergentes: `
      + `dinheiro=${finalMoney}, máx/dia=${finalMax}.`,
    );
  }

  await sleep(250);

  return { autoLocked };
}

async function saveEmployee(page) {
  const clicked = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();

    const buttons = [
      ...document.querySelectorAll('button, [role="button"]'),
    ].filter((el) => el.getClientRects().length > 0);

    const save = buttons.find((el) =>
      normalize(el.textContent) === 'SALVAR');

    if (!save) return false;

    save.click();
    return true;
  });

  if (!clicked) {
    throw new Error('Botão SALVAR do funcionário não localizado.');
  }

  await page.waitForFunction(() =>
    !/EDITAR FUNCION[ÁA]RIO/i.test(document.body?.innerText || ''), {
    timeout: 60000,
  });

  await sleep(800);
}

async function inspectEmployee(page, job) {
  await openStaffPage(page);
  await setSearchCpf(page, job.cpf);

  const selected = await selectExactStaffRow(page, job.cpf);

  await clickEdit(page, job.cpf);
  await openCashRulesSection(page);

  const currentRules = canonicalRules(
    await readCashRules(page),
  );

  const diagnostic = await getCashSectionDiagnostic(page);

  return {
    selected,
    currentRules,
    diagnostic,
  };
}

async function applyEmployeeRules(page, job) {
  const desired = desiredRules(job.regras);
  const inspection = await inspectEmployee(page, job);

  log(
    'INFO',
    `CPF ${job.cpf}: regras atuais=${inspection.currentRules.length}, `
      + `desejadas=${desired.length}, ação=${job.acao}.`,
  );

  if (rulesEqual(inspection.currentRules, desired)) {
    await closeModal(page);

    return {
      changed: false,
      currentRules: inspection.currentRules,
      verifiedRules: inspection.currentRules,
      autoLockedTypes: [],
    };
  }

  const desiredByType = new Map(
    desired.map((rule) => [norm(rule.tipo_despesa), rule]),
  );
  const autoLockedTypes = new Set();

  // Remova de baixo para cima somente as categorias que deixaram de fazer
  // parte da programação desta data. Assim os índices restantes não mudam
  // antes de serem processados.
  let formRules = await readCashRules(page);
  const obsoleteIndexes = formRules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => !desiredByType.has(norm(rule.tipo_despesa)))
    .map(({ index }) => index)
    .sort((a, b) => b - a);

  for (const index of obsoleteIndexes) {
    await deleteCashRuleAtIndex(page, index);
  }

  // Atualize somente linhas divergentes e acrescente apenas categorias novas.
  for (const rule of desired) {
    formRules = await readCashRules(page);
    const index = formRules.findIndex((current) =>
      norm(current.tipo_despesa) === norm(rule.tipo_despesa));

    if (index >= 0) {
      if (!rulesEqual([formRules[index]], [rule])) {
        const { autoLocked } = await fillCashRuleRow(page, index, rule);
        if (autoLocked) autoLockedTypes.add(norm(rule.tipo_despesa));
      }
      continue;
    }

    await addCashRuleRow(page);
    const newIndex = await getCashRowsCount(page) - 1;
    const { autoLocked } = await fillCashRuleRow(page, newIndex, rule);
    if (autoLocked) autoLockedTypes.add(norm(rule.tipo_despesa));
  }

  formRules = canonicalRules(await readCashRules(page));

  if (!rulesEqual(formRules, desired, autoLockedTypes)) {
    const error = new Error(
      'Formulário do GRM ficou divergente antes de salvar; salvamento cancelado.',
    );
    error.code = 'FORM_DIVERGENTE';
    error.currentRules = inspection.currentRules;
    error.verifiedRules = formRules;
    throw error;
  }

  log('INFO', `CPF ${job.cpf}: formulário conferido antes de salvar.`, {
    regras: formRules,
  });

  await saveEmployee(page);

  const verification = await inspectEmployee(page, job);

  await closeModal(page);

  if (!rulesEqual(verification.currentRules, desired, autoLockedTypes)) {
    const error = new Error(
      'GRM ficou divergente depois de salvar as Regras de Caixa Operacional.',
    );

    error.code = 'DIVERGENTE';
    error.currentRules = inspection.currentRules;
    error.verifiedRules = verification.currentRules;

    throw error;
  }

  return {
    changed: true,
    currentRules: inspection.currentRules,
    verifiedRules: verification.currentRules,
    autoLockedTypes: [...autoLockedTypes],
  };
}

async function getLatestState(cpf, dataReferencia) {
  const { data, error } = await supabase
    .from('grm_despesas_estado_colaborador')
    .select('*')
    .eq('cpf', digits(cpf))
    .eq('data_referencia', String(dataReferencia || '').slice(0, 10))
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function claimNext(excludedIds = []) {
  const { data, error } = await supabase
    .rpc('claim_next_grm_despesa_fila', {
      p_excluir_ids: excludedIds,
    });

  if (error) throw error;

  return data && data.id ? data : null;
}

async function listDryRunJobs() {
  const { data, error } = await supabase
    .from('grm_despesas_fila')
    .select('*')
    .in('status', ['PENDENTE', 'ERRO'])
    .eq('data_referencia', todaySaoPaulo())
    .order('created_at', {
      ascending: true,
    })
    .limit(MAX_PER_RUN);

  if (error) throw error;

  return data || [];
}

async function updateQueue(id, patch) {
  const { error } = await supabase
    .from('grm_despesas_fila')
    .update(patch)
    .eq('id', id);

  if (error) throw error;
}

async function updateStateIfCurrent(job, patch) {
  const { error } = await supabase
    .from('grm_despesas_estado_colaborador')
    .update(patch)
    .eq('cpf', digits(job.cpf))
    .eq('data_referencia', String(job.data_referencia || '').slice(0, 10))
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
  const finalStatus = desiredRules(job.regras).length
    ? 'APLICADO'
    : 'LIMPO';

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
      auto_bloqueado_pelo_grm: result.autoLockedTypes?.length
        ? result.autoLockedTypes
        : null,
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
  const categoryNotMapped = error.code === 'CATEGORIA_NAO_MAPEADA';
  const exhausted = categoryNotMapped || attempts >= maxAttempts;

  const status = categoryNotMapped
    || (exhausted && error.code === 'DIVERGENTE')
    ? 'DIVERGENTE'
    : 'ERRO';

  await updateQueue(job.id, {
    status,
    tentativas: categoryNotMapped ? maxAttempts : attempts,
    locked_at: null,
    finalizado_em: exhausted ? new Date().toISOString() : null,
    ultimo_erro: error.message,
    screenshot_path: screenshot || null,
    diagnostico: {
      code: error.code || null,
      stack: String(error.stack || '').slice(0, 8000),
      regras_antes: error.currentRules || null,
      regras_confirmadas: error.verifiedRules || null,
      categoria_solicitada: error.requestedType || null,
      categorias_disponiveis: error.availableTypes || null,
    },
  });

  await updateStateIfCurrent(job, {
    status_aplicacao: status,
  });
}

async function recordDryRun(job, inspection, screenshot) {
  await updateQueue(job.id, {
    diagnostico: {
      dry_run: true,
      validado_em: new Date().toISOString(),
      regras_atuais: inspection.currentRules,
      regras_desejadas: desiredRules(job.regras),
      iguais: rulesEqual(inspection.currentRules, job.regras),
      secao: DEBUG ? inspection.diagnostic : undefined,
    },
    screenshot_path: screenshot || null,
  });
}

async function enqueueFollowupIfNeeded(force = false) {
  if (DRY_RUN) return;

  if (!force) {
    const { data: remainingRows, error: remainingError } = await supabase
      .from('grm_despesas_fila')
      .select('id,status,tentativas,max_tentativas,data_referencia')
      .in('status', ['PENDENTE', 'ERRO'])
      .eq('data_referencia', todaySaoPaulo())
      .limit(200);

    if (remainingError) {
      log(
        'WARN',
        `Não foi possível conferir fila restante: ${remainingError.message}`,
      );
      return;
    }

    const hasRemaining = (remainingRows || []).some((row) =>
      row.status === 'PENDENTE'
      || (
        row.status === 'ERRO'
        && Number(row.tentativas || 0)
          < Number(row.max_tentativas || 3)
      ));

    if (!hasRemaining) return;
  }

  const { data: pendingJob, error: pendingError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-liberacao-despesas')
    .eq('status', 'pendente')
    .limit(1);

  if (pendingError) return;

  if (!pendingJob?.length) {
    const { error } = await supabase
      .from('grm_sync_jobs')
      .insert({
        agente_id: 'sync-liberacao-despesas',
        status: 'pendente',
      });

    if (error) {
      log(
        'WARN',
        `Falha ao enfileirar continuação: ${error.message}`,
      );
    }
  }
}

async function processDryRun(page) {
  const jobs = await listDryRunJobs();

  if (!jobs.length) {
    log(
      'INFO',
      'DRY_RUN: nenhuma alteração pendente para validar.',
    );

    return {
      processed: 0,
      errors: 0,
    };
  }

  let errors = 0;

  for (const job of jobs) {
    let screenshot = null;

    try {
      const state = await getLatestState(job.cpf, job.data_referencia);

      if (
        !state
        || state.hash_desejado !== job.hash_desejado
        || state.versao_desejada_id !== job.versao_id
      ) {
        log(
          'INFO',
          `DRY_RUN: job ${job.id} está superado; `
            + 'será ignorado apenas em execução real.',
        );
        continue;
      }

      const inspection = await inspectEmployee(page, job);

      await preflightDesiredRuleTypes(
        page,
        desiredRules(job.regras),
        inspection.currentRules.length,
      );

      screenshot = DEBUG
        ? await takeScreenshot(page, job, 'dry-run')
        : null;

      await closeModal(page);
      await recordDryRun(job, inspection, screenshot);

      log(
        'SUCCESS',
        `DRY_RUN CPF ${job.cpf}: leitura concluída; nenhuma alteração feita.`,
        {
          atuais: inspection.currentRules,
          desejadas: desiredRules(job.regras),
        },
      );
    } catch (error) {
      errors += 1;

      screenshot = await takeScreenshot(
        page,
        job,
        'dry-run-erro',
      );

      await updateQueue(job.id, {
        diagnostico: {
          dry_run: true,
          erro: error.message,
          code: error.code || null,
          categoria_solicitada: error.requestedType || null,
          categorias_disponiveis: error.availableTypes || null,
          stack: String(error.stack || '').slice(0, 8000),
        },
        screenshot_path: screenshot,
      });

      log(
        'ERROR',
        `DRY_RUN CPF ${job.cpf}: ${error.message}`,
      );

      try {
        await closeModal(page);
      } catch (_) {
        // Modal já estava fechado ou não chegou a abrir.
      }
    }
  }

  return {
    processed: jobs.length,
    errors,
  };
}

async function processReal(page) {
  let processed = 0;
  let errors = 0;
  let configurationWarnings = 0;
  const attemptedIds = [];

  for (let index = 0; index < MAX_PER_RUN; index += 1) {
    // Um item com erro só pode ser tentado uma vez por execução. Assim ele
    // não consome o lote inteiro nem impede que os próximos CPFs avancem.
    const job = await claimNext(attemptedIds);

    if (!job) break;
    attemptedIds.push(job.id);

    const today = todaySaoPaulo();
    const jobDate = String(job.data_referencia || '').slice(0, 10);
    if (jobDate !== today) {
      await updateQueue(job.id, {
        status: jobDate > today ? 'AGENDADO' : 'EXPIRADO',
        locked_at: null,
        finalizado_em: jobDate < today ? new Date().toISOString() : null,
        ultimo_erro: `Bloqueado por data: fila ${jobDate || 'sem data'}; hoje ${today}.`,
      });
      log('WARN', `Job ${job.id} bloqueado pela regra de data.`, {
        data_referencia: jobDate,
        hoje: today,
      });
      continue;
    }

    processed += 1;
    let screenshot = null;

    try {
      const state = await getLatestState(job.cpf, job.data_referencia);

      if (
        !state
        || state.hash_desejado !== job.hash_desejado
        || state.versao_desejada_id !== job.versao_id
      ) {
        await markSuperseded(job, state);

        log(
          'INFO',
          `Job ${job.id} ignorado: versão superada.`,
        );

        continue;
      }

      const result = await applyEmployeeRules(page, job);

      screenshot = DEBUG
        ? await takeScreenshot(page, job, 'aplicado')
        : null;

      await markSuccess(job, result, screenshot);

      log(
        'SUCCESS',
        `CPF ${job.cpf}: ${
          desiredRules(job.regras).length
            ? 'regras aplicadas'
            : 'regras limpas'
        } e verificadas.`,
      );
    } catch (error) {
      if (error.code === 'CATEGORIA_NAO_MAPEADA') {
        configurationWarnings += 1;
      } else {
        errors += 1;
      }

      screenshot = await takeScreenshot(page, job, 'erro');

      await markFailure(job, error, screenshot);

      log(
        error.code === 'CATEGORIA_NAO_MAPEADA' ? 'WARN' : 'ERROR',
        `CPF ${job.cpf}: ${error.message}`,
      );

      try {
        await closeModal(page);
      } catch (_) {
        // Modal já estava fechado ou não chegou a abrir.
      }
    }
  }

  // Cada execução trata um lote curto para não disputar o limite de 20 min do
  // worker. Enquanto houver itens elegíveis, deixa o próximo lote enfileirado.
  await enqueueFollowupIfNeeded(
    processed === MAX_PER_RUN || errors > 0,
  );

  return {
    processed,
    errors,
    configurationWarnings,
  };
}

async function main() {
  ensureDir(SCREENSHOT_DIR);

  log(
    'INFO',
    `Iniciando agente de liberação de despesas ${AGENT_VERSION} `
      + `(data=${todaySaoPaulo()}, dry_run=${DRY_RUN}, max=${MAX_PER_RUN}).`,
  );

  let browser;

  try {
    await activateTodayQueue();
    browser = await launchBrowser();

    const page = await browser.newPage();

    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(60000);

    page.on('console', (message) => {
      if (DEBUG) {
        log('BROWSER', message.text());
      }
    });

    page.on('pageerror', (error) => {
      if (DEBUG) {
        log('BROWSER_ERROR', error.message);
      }
    });

    await login(page);

    const result = DRY_RUN
      ? await processDryRun(page)
      : await processReal(page);

    log(
      result.errors ? 'ERROR' : (result.configurationWarnings ? 'WARN' : 'SUCCESS'),
      'Agente concluído.',
      result,
    );

    if (!DRY_RUN && result.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  log(
    'ERROR',
    `Erro fatal: ${error.message}`,
    {
      stack: error.stack,
    },
  );

  process.exitCode = 1;
});
