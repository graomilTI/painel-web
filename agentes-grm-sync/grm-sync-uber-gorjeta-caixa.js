#!/usr/bin/env node
'use strict';

/*
 * GRM Server - Lançamento automático da gorjeta do Uber como Adiantamento no Caixa do colaborador.
 *
 * Fila: uber_gorjeta_caixa_lancamentos (preenchida por gatilho em conferencia_uber_corridas
 * assim que a importação diária do Uber traz uma gorjeta, external_id "<corrida>:TIP:<instante>").
 * Só gorjetas novas: as que já existiam em 06/10/2026 entraram como CANCELADO. Este agente só
 * executa o que já está na fila, no valor integral, sem aprovação prévia (decisão do usuário).
 *
 * Fluxo no GRM (mesmo do Adiantamento de desconto de auditoria, validado ao vivo em 10/09/2026):
 * Funcionário -> abrir cadastro -> Caixa -> Despesas -> Adicionar -> Tipo = Adiantamento ->
 * Descrição / Valor / Data -> Salvar. A Data é o dia da corrida e a Descrição é única por
 * gorjeta ("Gorjeta Uber - dd/mm/aaaa hh:mm - corrida xxxxxxxx"), porque a trava de duplicidade
 * confere a descrição no relatório de Caixa da API do GRM antes de lançar (e de novo depois de
 * salvar). Não pela lista da tela: ela só mostra uma janela de datas e a data do lançamento é o
 * dia da corrida. Regras puras em grm-uber-gorjeta-caixa-regras.js.
 *
 * O colaborador é resolvido pelo e-mail do Uber (e-mail pessoal/da empresa do cadastro) e pelo
 * nome; se os dois apontam para pessoas diferentes o lançamento é bloqueado (ERRO), para o
 * dinheiro não cair no Caixa errado.
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
const DEBUG = String(process.env.GRM_UBER_GORJETA_CAIXA_DEBUG ?? 'false').toLowerCase() === 'true';
// Fluxo validado ao vivo em 10/09/2026 (ver comentário acima) — padrão FALSE.
const DRY_RUN = String(process.env.GRM_UBER_GORJETA_CAIXA_DRY_RUN ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Math.min(20, Number(process.env.GRM_UBER_GORJETA_CAIXA_MAX_POR_EXECUCAO || 8)));
const DEFAULT_TIMEOUT = Math.max(15000, Number(process.env.GRM_UBER_GORJETA_CAIXA_TIMEOUT_MS || 45000));
const SCREENSHOT_DIR = process.env.GRM_UBER_GORJETA_CAIXA_SCREENSHOT_DIR
  || '/home/grao100/painel-scripts/grm-sync/logs/uber-gorjeta-caixa';

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
  movimentosCaixaGrm,
  openEmployee,
  clickAddExpense,
  chooseMovementType,
  markField,
  saveExpense,
  openExpensesSection,
} = caixaUi;
const regras = require('./grm-uber-gorjeta-caixa-regras');

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
  const descricao = String(job.descricao_grm || '').trim();
  if (descricao) return descricao.slice(0, 250);
  return `Gorjeta Uber - ${String(job.data_gorjeta || '')} - ${String(job.external_id || '').slice(0, 8)}`.slice(0, 250);
}

// Data do Adiantamento = dia da corrida (YYYY-MM-DD no banco -> DD/MM/AAAA no GRM).
function launchDateFor(job) {
  const match = String(job.data_gorjeta || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return todayBrDate();
  return `${match[3]}/${match[2]}/${match[1]}`;
}



// Movimentos do colaborador no mês da data do lançamento (= dia da corrida), pela API do GRM.
// A lista do Caixa na tela só mostra uma janela de datas: corridas antigas (ou futuras) caem
// fora dela e a trava contra duplicidade ficaria cega (ver grm-caixa-ui, caso do Bônus).
async function movimentosDoMes(cpf, job, semCache = false) {
  const [dia, mes, ano] = launchDateFor(job).split('/');
  const dataIso = `${ano}-${mes}-${dia}`;
  return movimentosCaixaGrm({ cpf, de: dataIso, ate: dataIso, semCache });
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

  const launchDate = launchDateFor(job);
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


// Conferência pós-salvar pela API.
async function verifyExpense(cpf, job) {
  const description = descriptionFor(job);
  let ultimos = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(attempt * 1500);
    ultimos = await movimentosDoMes(cpf, job, true);
    const avaliacao = regras.avaliarExistenteApi(ultimos, description, job.valor);
    if (avaliacao.acao === 'JA_EXISTE') return { ok: true, row: avaliacao.row, attempt };
  }
  const alvo = regras.norm(description);
  return { ok: false, row: null, rows: ultimos.filter((m) => regras.norm(m.descricao) === alvo) };
}

async function recoverStaleProcessing() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('uber_gorjeta_caixa_lancamentos')
    .update({ status: 'PENDENTE', iniciado_em: null, updated_at: new Date().toISOString() })
    .eq('status', 'PROCESSANDO')
    .lt('iniciado_em', cutoff);
  if (error) log('WARN', `Falha ao recuperar PROCESSANDO antigo: ${error.message}`);
}

async function loadPendingJobs() {
  const { data, error } = await supabase
    .from('uber_gorjeta_caixa_lancamentos')
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
    // order() estável: sem ele o range() pode pular/repetir linhas enquanto outros agentes
    // mudam a ordem da view em tempo real (ver comentário no agente do Bônus).
    const { data, error } = await supabase
      .from('vw_colaboradores_atuais')
      .select('nome,cpf,ativo,situacao,email_pessoal,email_empresa')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const byName = new Map();
  const byEmail = new Map();
  const add = (map, key, row, cpf) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.some((item) => item.cpf === cpf)) list.push({ ...row, cpf });
  };
  for (const row of rows) {
    const cpf = digits(row.cpf);
    if (!cpf) continue;
    add(byName, nameKey(row.nome), row, cpf);
    add(byEmail, emailKey(row.email_pessoal), row, cpf);
    add(byEmail, emailKey(row.email_empresa), row, cpf);
  }
  return { byName, byEmail };
}

function emailKey(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function pickUniqueCpf(matches) {
  const active = matches.filter((item) => item.ativo !== false && !/INATIV|DESLIG/i.test(String(item.situacao || '')));
  const preferred = active.length ? active : matches;
  return preferred.length === 1 ? preferred[0].cpf : null;
}

function resolveCpf(job, collaborators) {
  const porEmail = pickUniqueCpf(collaborators.byEmail.get(emailKey(job.colaborador_email)) || []);
  const porNome = pickUniqueCpf(collaborators.byName.get(nameKey(job.colaborador_nome)) || []);
  if (porEmail && porNome && porEmail !== porNome) {
    throw new Error(`E-mail e nome de ${job.colaborador_nome} apontam para cadastros diferentes no GRM; lançamento bloqueado para não cair no Caixa errado.`);
  }
  const cpf = porEmail || porNome;
  if (!cpf) {
    throw new Error(`CPF não resolvido de forma única para ${job.colaborador_nome} (${job.colaborador_email || 'sem e-mail'}) pelo e-mail nem pelo nome.`);
  }
  return cpf;
}

async function updateLaunch(id, patch) {
  const { error } = await supabase
    .from('uber_gorjeta_caixa_lancamentos')
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
    .from('uber_gorjeta_caixa_lancamentos')
    .select('id')
    .eq('status', 'PENDENTE')
    .limit(1);
  if (error || !remaining?.length) return;

  const { data: queued, error: queuedError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-uber-gorjeta-caixa')
    .eq('status', 'pendente')
    .limit(1);
  if (queuedError || queued?.length) return;

  const { error: insertError } = await supabase.from('grm_sync_jobs').insert({
    agente_id: 'sync-uber-gorjeta-caixa',
    status: 'pendente',
    payload: { origem: 'uber_gorjeta_caixa_continuacao' },
  });
  if (insertError) log('WARN', `Falha ao enfileirar continuação: ${insertError.message}`);
}

async function processJob(page, job, collaborators) {
  await markProcessing(job);
  const cpf = resolveCpf(job, collaborators);
  const description = descriptionFor(job);
  const date = launchDateFor(job);

  log('INFO', `${job.colaborador_nome}: preparando Adiantamento "${description}" no valor de ${Number(job.valor || 0).toFixed(2)}.`);

  // Trava contra duplicidade pela API, antes de abrir a tela. Se a API falhar, o job vai para
  // ERRO sem lançar (nunca lança às cegas).
  const avaliacao = regras.avaliarExistenteApi(await movimentosDoMes(cpf, job), description, job.valor);
  if (avaliacao.acao === 'DIVERGENTE') {
    throw new Error(
      'Já existe movimento com esta descrição no GRM, mas com valor divergente. Lançamento automático bloqueado para evitar duplicidade. '
      + `Movimentos: ${JSON.stringify(avaliacao.rows.map((m) => ({ ofmCode: m.ofmCode, data: m.data, valor: m.valor, status: m.status })))}`
    );
  }
  if (avaliacao.acao === 'JA_EXISTE') {
    await markSuccess(job, {
      ok: true,
      cpf,
      descricao: description,
      valor: Number(job.valor || 0),
      data: date,
      duplicate_guard: 'DESCRICAO_JA_EXISTIA_NO_GRM',
      verificado_via: 'api reports/finance/operatingFlow',
      criado_agora: false,
      ofmCode: avaliacao.row.ofmCode,
      linha_grm: avaliacao.row,
      verificado_em: new Date().toISOString(),
    });
    log('SUCCESS', `${job.colaborador_nome}: adiantamento já existia no GRM (ofmCode ${avaliacao.row.ofmCode}); duplicidade bloqueada.`);
    return;
  }

  await openEmployee(page, cpf);
  await openExpensesSection(page);

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
  await saveExpense(page, 'Adiantamento');

  const verified = await verifyExpense(cpf, job);
  if (!verified.ok) {
    throw new Error(
      'GRM confirmou o salvamento, mas o lançamento do Adiantamento não apareceu no relatório de Caixa da API '
      + 'com a Descrição e Valor esperados. '
      + `Movimentos com a descrição: ${JSON.stringify(verified.rows.map((m) => ({ ofmCode: m.ofmCode, data: m.data, tipo: m.tipo, valor: m.valor })))}. `
      + 'Não reprocesse sem conferir o cadastro para evitar duplicidade.'
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
    verificado_via: 'api reports/finance/operatingFlow',
    ofmCode: verified.row.ofmCode,
    linha_grm: verified.row,
    verificado_em: new Date().toISOString(),
  });
  log('SUCCESS', `${job.colaborador_nome}: adiantamento lançado e verificado no GRM (ofmCode ${verified.row.ofmCode}).`);
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  await recoverStaleProcessing();
  const jobs = await loadPendingJobs();
  if (!jobs.length) {
    log('INFO', 'Nenhuma gorjeta do Uber pendente para lançar no Caixa.');
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
    // DRY_RUN devolve a linha pra PENDENTE; sem esta trava o job de continuação deixaria o worker
    // real lançar de verdade o item de teste.
    if (!DRY_RUN) await enqueueFollowupIfNeeded();
  }

  log(errors ? 'WARN' : 'SUCCESS', 'Agente de gorjeta do Uber no Caixa concluído.', {
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
  log('ERROR', `Erro fatal no agente de gorjeta do Uber no Caixa: ${error.message}`, { stack: error.stack });
  process.exitCode = 1;
});
