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
const DEBUG = String(process.env.GRM_BONUS_CAIXA_DEBUG ?? 'false').toLowerCase() === 'true';
const DRY_RUN = String(process.env.GRM_BONUS_CAIXA_DRY_RUN ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Math.min(20, Number(process.env.GRM_BONUS_CAIXA_MAX_POR_EXECUCAO || 8)));
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_BONUS_CAIXA_TIMEOUT_MS || 45000));
const SCREENSHOT_DIR = process.env.GRM_BONUS_CAIXA_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/bonus-caixa';

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
  brMoneyText,
  selectExactStaffRow,
  clickCash,
  openEmployee,
  clickAddExpense,
  markField,
  chooseMovementType,
  saveExpense,
  movimentosCaixaGrm,
} = caixaUi;

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});


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

function brToIso(br) {
  const [dia, mes, ano] = String(br).split('/');
  return `${ano}-${mes}-${dia}`;
}

const CATEGORIA_BONUS = 'Bônus e Premiações';
const mesmoValor = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;

// Movimentos do Caixa (API) com a descrição desta competência, atual ou da versão antiga.
function movimentosDaCompetencia(movimentos, descriptions) {
  const alvos = descriptions.map(norm).filter(Boolean);
  return movimentos.filter((m) => alvos.some((alvo) => norm(m.descricao).includes(alvo)));
}

// Lançamento completo do Bônus: Bônus e Premiações + valor + N. Documento 0.
function ehLancamentoDoBonus(movimento, job) {
  return norm(movimento.tipoDespesa) === norm(CATEGORIA_BONUS)
    && mesmoValor(movimento.valor, job.valor)
    && movimento.documento === '0';
}

// Trava contra duplicidade: do mês da competência até o mês do lançamento, porque uma
// tentativa anterior pode ter sido gravada com o dia 15 de outro mês.
async function movimentosDoBonus(cpf, job, launchDate) {
  const movimentos = await movimentosCaixaGrm({ cpf, de: String(job.competencia).slice(0, 10), ate: brToIso(launchDate) });
  return movimentosDaCompetencia(movimentos, descriptionAliasesFor(job));
}

// Conferência pós-salvar pela API (a tela não mostra o lançamento quando a data é futura).
// O movimento novo tem a data do lançamento: basta reconsultar esse mês, sem cache.
async function verifyExpense(cpf, job, launchDate) {
  const mes = brToIso(launchDate);
  let ultimos = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(attempt * 1500);
    const movimentos = await movimentosCaixaGrm({ cpf, de: mes, ate: mes, semCache: true });
    ultimos = movimentosDaCompetencia(movimentos, descriptionAliasesFor(job));
    const exatos = ultimos.filter((m) => ehLancamentoDoBonus(m, job));
    if (exatos.length) return { ok: true, row: exatos[0], quantidade: exatos.length, attempt };
  }
  return { ok: false, row: null, rows: ultimos };
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
  const usable = [];

  for (const job of jobs) {
    try {
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

      usable.push(job);
    } catch (error) {
      // Isola o erro por colaborador: um item inapto/inconsistente não pode
      // derrubar o lote inteiro e impedir o reenfileiramento dos demais.
      log('ERROR', `${job.colaborador_nome}: removido do lote (${error.message}).`);
      try {
        await markError(job, error);
      } catch (markErrorFailure) {
        log('ERROR', `Falha ao registrar erro de pré-checagem para ${job.id}: ${markErrorFailure.message}`);
      }
    }
  }

  return usable;
}

async function loadCollaborators() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    // vw_colaboradores_atuais ordena por "tem lançamento PENDENTE/PROCESSANDO
    // agora" antes do nome — essa ordem muda em tempo real enquanto este
    // próprio agente processa o lote (status indo PENDENTE -> PROCESSANDO ->
    // LANCADO). Sem um order() estável e independente disso, o range() pode
    // pular ou repetir linhas entre uma página e outra, derrubando
    // colaboradores existentes da lista ("CPF não resolvido... 0
    // correspondência(s)" mesmo com o colaborador cadastrado).
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

  // Trava contra duplicidade pela API, antes de abrir a tela. Se a API falhar, o job vai para
  // ERRO sem lançar (nunca lança às cegas).
  const existing = await movimentosDoBonus(cpf, job, date);
  if (existing.length) {
    const exact = existing.find((m) => mesmoValor(m.valor, job.valor));

    if (!exact) {
      throw new Error(
        `Já existe movimento de Bônus desta competência no GRM, mas com valor divergente. `
        + `Lançamento automático bloqueado para evitar duplicidade. `
        + `Movimentos: ${JSON.stringify(existing.map((m) => ({ ofmCode: m.ofmCode, data: m.data, valor: m.valor, status: m.status })))}`
      );
    }

    await markSuccess(job, {
      ok: true,
      cpf,
      descricao: description,
      valor: Number(job.valor || 0),
      data: date,
      duplicate_guard: 'DESCRICAO_DA_COMPETENCIA_JA_EXISTIA_NO_GRM',
      verificado_via: 'api reports/finance/operatingFlow',
      criado_agora: false,
      ofmCode: exact.ofmCode,
      linha_grm: exact,
      verificado_em: new Date().toISOString(),
    });
    log('SUCCESS', `${job.colaborador_nome}: bônus já existia no GRM (ofmCode ${exact.ofmCode}); duplicidade bloqueada.`);
    return;
  }

  await openEmployee(page, cpf);

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

  const verified = await verifyExpense(cpf, job, filled.date || date);
  if (!verified.ok) {
    throw new Error(
      'GRM confirmou o salvamento, mas o lançamento do Bônus não apareceu no relatório de Caixa da API '
      + 'com Descrição + Bônus e Premiações + N. Documento 0 + Valor esperados. '
      + `Movimentos da competência encontrados: ${JSON.stringify(verified.rows.map((m) => ({ ofmCode: m.ofmCode, data: m.data, tipo: m.tipoDespesa, valor: m.valor, doc: m.documento })))}. `
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
    verificado_via: 'api reports/finance/operatingFlow',
    ofmCode: verified.row.ofmCode,
    linha_grm: verified.row,
    movimentos_iguais: verified.quantidade,
    verificado_em: new Date().toISOString(),
  });
  log('SUCCESS', `${job.colaborador_nome}: bônus lançado e verificado no GRM (ofmCode ${verified.row.ofmCode}).`);
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  await recoverStaleProcessing();
  const jobs = await loadPendingJobs();
  if (!jobs.length) {
    log('INFO', 'Nenhum Bônus utilizável nesta execução (lote vazio ou todos isolados por erro).');
    // loadPendingJobs() pode isolar o único item do lote (MAX_POR_EXECUCAO=1)
    // e devolver usable=[] mesmo havendo outros PENDENTE atrás dele na fila —
    // sem chamar enqueueFollowupIfNeeded aqui, esses itens ficam órfãos.
    await enqueueFollowupIfNeeded();
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
