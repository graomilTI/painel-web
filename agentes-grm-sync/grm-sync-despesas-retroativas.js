#!/usr/bin/env node
'use strict';

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

const VERSION = 'V4-CAFE-PROGRAMACAO-LOGIN-PONTO';
const LOGIN_URL = 'https://www.grmserver.com.br/login';
const FLOW_URL = 'https://www.grmserver.com.br/report/finance/operatingFlow';
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_DESPESAS_RETROATIVAS_DRY_RUN || 'false').toLowerCase() === 'true';
const MAX_ACTIONS = Math.max(1, Number(process.env.GRM_DESPESAS_RETROATIVAS_MAX_ACOES || 100));

let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.SB_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } },
    );
  }
  return supabase;
}

function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function assertDirectExpenseAllowed(expense, { cafeAuthorized = false } = {}) {
  const expenseName = String(expense?.oexName || '').trim();
  const key = norm(expenseName);
  if (key === 'CAFE' && cafeAuthorized !== true) {
    const error = new Error(
      `Despesa ${expenseName || key} bloqueada: Café exige Programação do Painel e login válido no ponto de embarque entre 04h e 07h no horário local.`,
    );
    error.code = 'CAFE_SEM_AUTORIZACAO_OPERACIONAL';
    throw error;
  }
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}

function yesterdaySaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const utc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

function isoToBr(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

function requiredExpenses(
  contractType,
  salary,
  expenseTypes,
  { programmed = true, hasLaudo = true, cafeAuthorized = false } = {},
) {
  const type = norm(contractType);
  const result = [];

  if (hasLaudo) {
    if (type === 'INTERMITENTE') {
      const item = expenseTypes.get('SALARIO DE INTERMITENTE');
      if (!item) throw new Error('Categoria Salário de Intermitente não encontrada no GRM.');
      result.push({ ...item, amount: Number(salary || 0) });
    } else if (type === 'DIARISTA') {
      const item = expenseTypes.get('SERVICOS TERCEIRIZADOS');
      if (!item) throw new Error('Categoria Serviços Terceirizados não encontrada no GRM.');
      result.push({ ...item, amount: Number(salary || 0) });
    }
    if (programmed) {
      const lunch = expenseTypes.get('ALMOCO');
      if (!lunch) throw new Error('Categoria Almoço não encontrada no GRM.');
      result.push({ ...lunch, amount: Number(lunch.oexMaxOperatingFlowValue || 30) });
    }
  }

  if (cafeAuthorized) {
    const coffee = expenseTypes.get('CAFE');
    if (!coffee) throw new Error('Categoria Café não encontrada no GRM.');
    result.push({ ...coffee, amount: Number(coffee.oexMaxOperatingFlowValue || 10) });
  }

  return result;
}

function decide(existing) {
  if (existing.some((row) => row.ofmStatus === 'A')) return { action: 'NONE' };
  const pending = existing.filter((row) => row.ofmStatus === 'P')
    .sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));
  if (pending.length) return { action: 'APPROVE', row: pending[0], duplicates: pending.length - 1 };
  return { action: 'CREATE' };
}

async function queryAll(table, select, configure) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = getSupabase().from(table).select(select).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function loadCandidates(date) {
  const [programmed, alimentation, production, contracts] = await Promise.all([
    queryAll(
      'programacao_colaboradores',
      'programacao_id,colaborador_id,nome_colaborador,coordenacao,supervisao,data_referencia',
      (q) => q.eq('data_referencia', date),
    ),
    queryAll(
      'programacao_alimentacao',
      'programacao_id,colaborador_id,nome_colaborador,cafe,data_referencia',
      (q) => q.eq('data_referencia', date).eq('cafe', true),
    ),
    queryAll('producao_snapshot', 'funcionario,data,os,cargas,tons', (q) => q.eq('data', date)),
    queryAll('colaborador_cruzamento', 'colaborador_id,cpf,nome,tipo_contrato,salario,atualizado_em', (q) => q.order('atualizado_em', { ascending: false })),
  ]);

  // Laudo continua sendo o gatilho das despesas já existentes (salário/serviço
  // e almoço). Café é uma exceção intencional: pode entrar sem laudo, desde que
  // esteja marcado na Programação e passe pela validação de login/geofence.
  const laudoNames = new Set(production.map((row) => norm(row.funcionario)).filter(Boolean));
  const cafeByName = new Map(
    alimentation
      .filter((row) => row.cafe === true)
      .map((row) => [norm(row.nome_colaborador), row]),
  );
  const cafeNames = new Set([...cafeByName.keys()].filter(Boolean));
  const candidateNames = new Set([...laudoNames, ...cafeNames]);

  const programmedIds = new Set(programmed.map((row) => String(row.colaborador_id || '')).filter(Boolean));
  const programmedNames = new Set(programmed.map((row) => norm(row.nome_colaborador)).filter(Boolean));
  const programmedByName = new Map(programmed.map((row) => [norm(row.nome_colaborador), row]));

  const contractsById = new Map();
  const contractsByName = new Map();
  for (const row of contracts) {
    const id = String(row.colaborador_id || '');
    if (id && !contractsById.has(id)) contractsById.set(id, row);
    const name = norm(row.nome);
    if (name && !contractsByName.has(name)) contractsByName.set(name, row);
  }

  const unique = new Map();
  for (const name of candidateNames) {
    const cafeItem = cafeByName.get(name);
    const programmedItem = programmedByName.get(name);
    const referenceItem = cafeItem || programmedItem;
    const contract = contractsById.get(String(referenceItem?.colaborador_id || '')) || contractsByName.get(name);
    if (!contract || !['DIARISTA', 'INTERMITENTE', 'EFETIVO'].includes(norm(contract.tipo_contrato))) continue;

    const isProgrammed = programmedIds.has(String(contract.colaborador_id || '')) || programmedNames.has(name);
    const hasLaudo = laudoNames.has(name);
    const cafeProgrammed = !!cafeItem;

    // Mantém a regra anterior para despesas base de efetivo; a inclusão sem
    // laudo só existe para Café explicitamente marcado na Programação.
    if (norm(contract.tipo_contrato) === 'EFETIVO' && hasLaudo && !isProgrammed) continue;
    if (!hasLaudo && !cafeProgrammed) continue;

    unique.set(digits(contract.cpf) || name, {
      ...contract,
      nameKey: name,
      programmed: isProgrammed,
      hasLaudo,
      cafeProgrammed,
      programacaoId: String(cafeItem?.programacao_id || programmedItem?.programacao_id || ''),
      programacaoColaboradorId: String(cafeItem?.colaborador_id || programmedItem?.colaborador_id || contract.colaborador_id || ''),
    });
  }

  return {
    candidates: [...unique.values()],
    programmed: programmed.length,
    production: laudoNames.size,
    cafesProgramados: alimentation.length,
  };
}

async function validateCafeAuthorization(candidate, date) {
  if (!candidate.cafeProgrammed || !candidate.programacaoId) return false;

  const { data, error } = await getSupabase().rpc('grm_cafe_login_valido', {
    p_data: date,
    p_programacao_id: candidate.programacaoId,
    p_versao_id: null,
    p_colaborador_id: candidate.programacaoColaboradorId || String(candidate.colaborador_id || ''),
    p_cpf: digits(candidate.cpf),
    p_nome: candidate.nome,
  });

  if (error) throw error;
  return data === true;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button.submit-btn'),
  ]);
  await page.goto(FLOW_URL, { waitUntil: 'networkidle2', timeout: 60000 });
}

async function api(page, path, body, multipart = false) {
  return page.evaluate(async ({ apiPath, payload, useMultipart }) => {
    let token = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      try { const value = JSON.parse(localStorage.getItem(localStorage.key(i))); if (value?.userToken) token = value.userToken; } catch (_) {}
    }
    const headers = { Authorization: `Bearer ${token}` };
    let requestBody;
    if (useMultipart) {
      requestBody = new FormData();
      Object.entries(payload).forEach(([key, value]) => requestBody.append(key, value == null ? '' : String(value)));
    } else {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(payload);
    }
    const response = await fetch(apiPath, { method: 'POST', headers, body: requestBody });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch (_) { json = { text }; }
    if (!response.ok || json?.result === false) throw new Error(`${response.status}: ${text.slice(0, 500)}`);
    return json;
  }, { apiPath: path, payload: body, useMultipart: multipart });
}

async function loadGrmData(page, date) {
  const br = isoToBr(date);
  const [report, staff, types] = await Promise.all([
    api(page, '/api/reports/finance/operatingFlow', { ofmDateFrom: br, ofmDateTo: br, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList' }),
    api(page, '/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }),
    api(page, '/api/oFlowExpenseType/getRecords', { oexStatus: 'A' }),
  ]);
  return {
    movements: report.searchData || [],
    staff: staff.searchData || [],
    expenseTypes: new Map((types.searchData || []).map((row) => [norm(row.oexName), row])),
  };
}

function findStaff(candidate, staff) {
  const cpf = digits(candidate.cpf);
  return staff.find((row) => digits(row.staCPF) === cpf)
    || staff.find((row) => norm(row.staName) === candidate.nameKey);
}

async function approve(page, row) {
  return api(page, '/api/oFlow/approve', { ofmCode: Number(row.ofmCode), reproveReason: '', type: 'A' });
}

async function create(page, staff, expense, date, { cafeAuthorized = false } = {}) {
  assertDirectExpenseAllowed(expense, { cafeAuthorized });
  return api(page, '/api/oFlow/setRecord', {
    ofmType: 'D', staCode: Number(staff.staCode), ofmDate: isoToBr(date),
    ofmDescription: `Lançamento automático retroativo - ${expense.oexName}`,
    ofmValue: Number(expense.amount).toFixed(2), oexCode: Number(expense.oexCode),
    odtCode: 1, ofmDocument: '0', moreThenOneCompany: 'N', scpCode: 1,
  }, true);
}

async function recordAudit(row) {
  const { error } = await getSupabase().from('grm_despesas_retroativas_auditoria').insert(row);
  if (error) throw error;
}

async function main() {
  if (!process.env.GRMSERVER_USER || !process.env.GRMSERVER_PASSWORD) throw new Error('Credenciais GRM ausentes.');
  const date = process.env.GRM_DESPESAS_RETROATIVAS_DATA || yesterdaySaoPaulo();
  const source = await loadCandidates(date);
  log('INFO', `Agente ${VERSION}: base ${date}.`, {
    programados: source.programmed,
    cafes_programados: source.cafesProgramados,
    com_producao: source.production,
    elegiveis: source.candidates.length,
    dry_run: DRY_RUN,
  });

  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const summary = {
    checked: 0,
    unchanged: 0,
    approve: 0,
    create: 0,
    errors: 0,
    unresolved: 0,
    adiados: 0,
    cafe_programado: 0,
    cafe_autorizado_login: 0,
    cafe_bloqueado_login: 0,
  };
  let actionCount = 0;
  try {
    const page = await browser.newPage();
    await login(page);
    const grm = await loadGrmData(page, date);
    for (const candidate of source.candidates) {
      let cafeAuthorized = false;
      if (candidate.cafeProgrammed) {
        summary.cafe_programado += 1;
        cafeAuthorized = await validateCafeAuthorization(candidate, date);
        if (cafeAuthorized) summary.cafe_autorizado_login += 1;
        else summary.cafe_bloqueado_login += 1;
      }

      const expenses = requiredExpenses(
        candidate.tipo_contrato,
        candidate.salario,
        grm.expenseTypes,
        {
          programmed: candidate.programmed,
          hasLaudo: candidate.hasLaudo,
          cafeAuthorized,
        },
      );

      if (!expenses.length) continue;

      const staff = findStaff(candidate, grm.staff);
      if (!staff) {
        summary.unresolved += 1;
        log('WARN', 'Colaborador não localizado no GRM.', { nome: candidate.nome, cpf: candidate.cpf });
        continue;
      }

      for (const expense of expenses) {
        summary.checked += 1;
        const existing = grm.movements.filter((row) => Number(row.staCode) === Number(staff.staCode)
          && Number(row.oexCode) === Number(expense.oexCode) && row.ofmType === 'D');
        const decision = decide(existing);
        const audit = {
          data_referencia: date, cpf: digits(candidate.cpf), colaborador: candidate.nome,
          sta_code: Number(staff.staCode), tipo_contrato: candidate.tipo_contrato,
          tipo_despesa: expense.oexName, oex_code: Number(expense.oexCode), valor: expense.amount,
          acao: decision.action, dry_run: DRY_RUN,
          diagnostico: {
            laudo: candidate.hasLaudo,
            programado: candidate.programmed,
            cafe_programado: candidate.cafeProgrammed,
            cafe_login_valido_04_07: cafeAuthorized,
            existentes: existing.map((r) => ({ ofmCode: r.ofmCode, status: r.ofmStatus, valor: r.ofmValue })),
            duplicados_pendentes: decision.duplicates || 0,
          },
        };
        try {
          assertDirectExpenseAllowed(expense, { cafeAuthorized });
          if (decision.action === 'NONE') summary.unchanged += 1;
          else if (actionCount >= MAX_ACTIONS) {
            // Trava de segurança intencional (evita rajada grande de ações num único run),
            // não é uma falha: fica pendente e é retomado na próxima execução do agente.
            summary.adiados += 1;
            audit.sucesso = false;
            audit.erro = `Limite de ${MAX_ACTIONS} ações atingido nesta execução; adiado para a próxima.`;
            log('WARN', `${candidate.nome} / ${expense.oexName}: ${audit.erro}`);
            await recordAudit(audit);
            continue;
          }
          else if (decision.action === 'APPROVE') {
            summary.approve += 1; actionCount += 1;
            audit.ofm_code = Number(decision.row.ofmCode);
            if (!DRY_RUN) await approve(page, decision.row);
          } else {
            if (!(Number(expense.amount) > 0)) throw new Error(`Valor inválido para ${expense.oexName}: ${expense.amount}`);
            summary.create += 1; actionCount += 1;
            if (!DRY_RUN) {
              await create(page, staff, expense, date, { cafeAuthorized });
              const refreshed = await api(page, '/api/reports/finance/operatingFlow', { ofmDateFrom: isoToBr(date), ofmDateTo: isoToBr(date), ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList' });
              const created = (refreshed.searchData || []).filter((row) => Number(row.staCode) === Number(staff.staCode) && Number(row.oexCode) === Number(expense.oexCode)).sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
              if (!created) throw new Error('Lançamento não apareceu na conferência após criação.');
              audit.ofm_code = Number(created.ofmCode);
              if (created.ofmStatus === 'P') await approve(page, created);
              grm.movements.push({ ...created, ofmStatus: 'A' });
            }
          }
          audit.sucesso = true;
        } catch (error) {
          summary.errors += 1; audit.sucesso = false; audit.erro = error.message; log('ERROR', `${candidate.nome} / ${expense.oexName}: ${error.message}`);
        }
        await recordAudit(audit);
      }
    }
  } finally { await browser.close(); }
  log(summary.errors ? 'WARN' : 'SUCCESS', 'Execução concluída.', summary);
  if (summary.errors) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
module.exports = {
  norm,
  yesterdaySaoPaulo,
  requiredExpenses,
  decide,
  assertDirectExpenseAllowed,
  validateCafeAuthorization,
};
