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
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

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

// Automação de tela do Caixa compartilhada com os outros agentes *-caixa.js.
const caixaUi = require('./grm-caixa-ui');

caixaUi.configurar({ screenshotDir: SCREENSHOT_DIR, debug: DEBUG, defaultTimeout: DEFAULT_TIMEOUT });
const {
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
} = caixaUi;

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});


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
