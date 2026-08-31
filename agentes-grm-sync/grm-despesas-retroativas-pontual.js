#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL — não faz parte do SCRIPT_MAP/cron, roda uma única vez
 * manualmente. NÃO reescreve nem substitui grm-sync-despesas-retroativas.js:
 * esse continua rodando em produção com as regras de sempre (Almoço/Diária
 * dependentes da Programação). Este script é a exceção pontual pedida pelo
 * usuário em 31/08/2026 pra varrer um intervalo já fechado sem depender da
 * Programação e corrigir duplicados com data errada.
 *
 * Varre o intervalo GRM_DESPESAS_PONTUAL_DATA_DE..GRM_DESPESAS_PONTUAL_DATA_ATE
 * (padrão: 2026-08-01 a 2026-08-31), um dia de cada vez, na mesma sessão de
 * login do Puppeteer, e para cada dia, nessa ordem:
 *
 *  1) Almoço e Diária (Salário de Intermitente/Serviços Terceirizados):
 *     elegibilidade só por laudo/produção do dia (producao_snapshot), SEM
 *     depender da Programação do Painel.
 *  2) Café: regra inalterada (Programação + login georreferenciado 04h-07h).
 *  3) Segunda passada: aprova pendências de Almoço/Diária já existentes no
 *     GRM fora da lista de candidatos por laudo (ex.: criadas pelo motor
 *     AUTO do GRM) usando haveMovement=SIM como autorização.
 *  4) Em Almoço, Diária OU Café: se houver 2+ lançamentos na mesma data pro
 *     mesmo colaborador+categoria e uma das pendências tiver observação
 *     manual com data embutida (ex.: "Referente ao dia 26/08", "12/08/2026",
 *     "28/08- sexta feira, fulano"), recusa essa pendência com o motivo
 *     "data corrigida" e relança na data indicada pela observação — só se
 *     não existir lá um lançamento ativo (evita duplicar a despesa).
 *
 * Uso (rodar sempre primeiro em --dry-run e conferir o log/auditoria antes
 * de rodar de verdade):
 *
 *   node grm-despesas-retroativas-pontual.js --dry-run
 *   node grm-despesas-retroativas-pontual.js
 *
 * Variáveis de ambiente:
 *   GRM_DESPESAS_PONTUAL_DATA_DE=2026-08-01   (padrão)
 *   GRM_DESPESAS_PONTUAL_DATA_ATE=2026-08-31  (padrão)
 *   GRM_DESPESAS_PONTUAL_MAX_ACOES=1000       (padrão; soma de toda a
 *                                               execução, não por dia)
 *   GRM_DESPESAS_PONTUAL_CPF                  (opcional, restringe a 1
 *                                               colaborador — pra testar)
 *   GRM_DESPESAS_PONTUAL_TIPO                 (opcional, restringe a 1
 *                                               categoria — ALMOCO, CAFE,
 *                                               SALARIO DE INTERMITENTE,
 *                                               SERVICOS TERCEIRIZADOS)
 *
 * Auditoria: grava em grm_despesas_retroativas_auditoria (mesma tabela do
 * agente de produção), com diagnostico.execucao_pontual=true em toda linha,
 * pra dar pra distinguir depois quais ações vieram desse script avulso.
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

const VERSION = 'PONTUAL-V1-ALMOCO-DIARIA-SEM-PROGRAMACAO-DATA-CORRIGIDA';
const LOGIN_URL = 'https://www.grmserver.com.br/login';
const FLOW_URL = 'https://www.grmserver.com.br/report/finance/operatingFlow';
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_DESPESAS_PONTUAL_DRY_RUN || 'false').toLowerCase() === 'true';
const DATA_DE = process.env.GRM_DESPESAS_PONTUAL_DATA_DE || '2026-08-01';
const DATA_ATE = process.env.GRM_DESPESAS_PONTUAL_DATA_ATE || '2026-08-31';
const MAX_ACTIONS = Math.max(1, Number(process.env.GRM_DESPESAS_PONTUAL_MAX_ACOES || 1000));
const TARGET_CPF = digits(process.env.GRM_DESPESAS_PONTUAL_CPF || '');
const TARGET_EXPENSE = norm(process.env.GRM_DESPESAS_PONTUAL_TIPO || '');

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
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}

function isoToBr(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

function dateRange(fromIso, toIso) {
  const dates = [];
  let cursor = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Intervalo de datas inválido: ${fromIso}..${toIso}`);
  }
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function assertDirectExpenseAllowed(
  expense,
  {
    cafeAuthorized = false,
    hasLaudo = false,
  } = {},
) {
  const expenseName = String(expense?.oexName || '').trim();
  const key = norm(expenseName);

  if (key === 'CAFE' && cafeAuthorized !== true) {
    const error = new Error(
      `Despesa ${expenseName || key} bloqueada: Café exige Programação do Painel e login válido no ponto de embarque entre 04h e 07h no horário local.`,
    );
    error.code = 'CAFE_SEM_AUTORIZACAO_OPERACIONAL';
    throw error;
  }

  if (key === 'ALMOCO' && hasLaudo !== true) {
    const error = new Error(
      `Despesa ${expenseName || key} bloqueada: Almoço exige laudo/produção do colaborador na mesma data (independe da Programação).`,
    );
    error.code = 'ALMOCO_SEM_LAUDO';
    throw error;
  }

  if (['SALARIO DE INTERMITENTE', 'SERVICOS TERCEIRIZADOS'].includes(key) && hasLaudo !== true) {
    const error = new Error(
      `Despesa ${expenseName || key} bloqueada: diária exige laudo/produção do colaborador na mesma data (independe da Programação).`,
    );
    error.code = 'DIARIA_SEM_LAUDO';
    throw error;
  }
}

function requiredExpenses(
  contractType,
  salary,
  expenseTypes,
  {
    hasLaudo = true,
    cafeAuthorized = false,
  } = {},
) {
  const type = norm(contractType);
  const result = [];

  // Diária: basta laudo/produção do colaborador na data — não depende da
  // Programação do Painel.
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
  }

  // Almoço: basta laudo/produção do colaborador na data — não depende da
  // Programação do Painel.
  if (hasLaudo) {
    const lunch = expenseTypes.get('ALMOCO');
    if (!lunch) throw new Error('Categoria Almoço não encontrada no GRM.');
    result.push({ ...lunch, amount: Number(lunch.oexMaxOperatingFlowValue || 30) });
  }

  // Café mantém a regra especial: Programação + cafe=true + login/geofence 04h-07h.
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

function addToIndex(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
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
      'programacao_id,colaborador_id,nome_colaborador,cafe,almoco,data_referencia',
      (q) => q.eq('data_referencia', date),
    ),
    queryAll('producao_snapshot', 'funcionario,data,os,cargas,tons', (q) => q.eq('data', date)),
    queryAll('colaborador_cruzamento', 'colaborador_id,cpf,nome,tipo_contrato,salario,atualizado_em', (q) => q.order('atualizado_em', { ascending: false })),
  ]);

  const laudoNames = new Set(production.map((row) => norm(row.funcionario)).filter(Boolean));
  const cafeRows = alimentation.filter((row) => row.cafe === true);
  const cafeNames = new Set(cafeRows.map((row) => norm(row.nome_colaborador)).filter(Boolean));
  const candidateNames = new Set([...laudoNames, ...cafeNames]);

  const programmedByName = new Map();
  const programmedById = new Map();
  for (const row of programmed) {
    addToIndex(programmedByName, norm(row.nome_colaborador), row);
    addToIndex(programmedById, String(row.colaborador_id || ''), row);
  }

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
    const namedPrograms = programmedByName.get(name) || [];
    const namedFood = alimentation.filter((row) => norm(row.nome_colaborador) === name);
    const referenceItem = namedPrograms[0] || namedFood[0];
    const contract = contractsById.get(String(referenceItem?.colaborador_id || '')) || contractsByName.get(name);
    if (!contract || !['DIARISTA', 'INTERMITENTE', 'EFETIVO'].includes(norm(contract.tipo_contrato))) continue;

    const contractId = String(contract.colaborador_id || '');
    const programCandidates = [
      ...(programmedById.get(contractId) || []),
      ...namedPrograms,
    ];
    const programmedItem = programCandidates[0] || null;
    const isProgrammed = !!programmedItem;

    const foodItem = isProgrammed
      ? alimentation.find((row) => String(row.programacao_id || '') === String(programmedItem.programacao_id || '')
        && (String(row.colaborador_id || '') === contractId || norm(row.nome_colaborador) === name))
      : null;

    const hasLaudo = laudoNames.has(name);
    const cafeProgrammed = isProgrammed && foodItem?.cafe === true;

    // Sem laudo, somente Café explicitamente programado pode manter o candidato.
    if (!hasLaudo && !cafeProgrammed) continue;

    unique.set(digits(contract.cpf) || name, {
      ...contract,
      nameKey: name,
      programmed: isProgrammed,
      hasLaudo,
      cafeProgrammed,
      programacaoId: String(foodItem?.programacao_id || programmedItem?.programacao_id || ''),
      programacaoColaboradorId: String(foodItem?.colaborador_id || programmedItem?.colaborador_id || contract.colaborador_id || ''),
    });
  }

  return {
    candidates: [...unique.values()].filter((candidate) =>
      !TARGET_CPF || digits(candidate.cpf) === TARGET_CPF),
    programmed: programmed.length,
    production: laudoNames.size,
    cafesProgramados: cafeRows.length,
  };
}

async function validateCafeAuthorization(candidate, date) {
  if (!candidate.programmed || !candidate.cafeProgrammed || !candidate.programacaoId) return false;

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

// Extrai da observação/descrição de um lançamento a data à qual ele
// realmente se refere, quando o texto foi digitado manualmente indicando
// uma correção retroativa (ex.: "28/08- sexta feira, fulano", "12/08/2026",
// "Referente ao dia 26/08", "Referente a diaria dia 29"). Só considera uma
// data válida se ela for estritamente anterior à data do lançamento em si
// (referenceIsoDate) — uma correção retroativa sempre aponta para o passado.
function extractCorrectedDate(description, referenceIsoDate) {
  const text = String(description || '');
  const [refYear, refMonth] = referenceIsoDate.split('-').map(Number);

  const buildIfValid = (year, month, day) => {
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return iso < referenceIsoDate ? iso : null;
  };

  const full = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (full) return buildIfValid(Number(full[3]), Number(full[2]), Number(full[1]));

  const short = text.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/);
  if (short) return buildIfValid(refYear, Number(short[2]), Number(short[1]));

  const dayOnly = text.match(/\bdia\s+(\d{1,2})\b/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const sameMonth = buildIfValid(refYear, refMonth, day);
    if (sameMonth) return sameMonth;
    // Dia maior que a data de referência no mesmo mês: só faz sentido no mês anterior.
    const prevMonth = refMonth === 1 ? 12 : refMonth - 1;
    const prevYear = refMonth === 1 ? refYear - 1 : refYear;
    return buildIfValid(prevYear, prevMonth, day);
  }

  return null;
}

// Separa um grupo de lançamentos (mesmo colaborador+categoria, mesma data)
// entre pendências com data corrigida detectável na observação e o restante
// (que segue o fluxo normal de decide()).
function partitionDuplicates(rows, date) {
  if (rows.length < 2) return { correctable: [], remaining: rows };
  const correctable = [];
  const remaining = [];
  for (const row of rows) {
    if (String(row.ofmStatus).toUpperCase() === 'P') {
      const description = row.ofmDescription || row.description || row.descricao || '';
      const correctedDate = extractCorrectedDate(description, date);
      if (correctedDate) { correctable.push({ row, correctedDate }); continue; }
    }
    remaining.push(row);
  }
  return { correctable, remaining };
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

async function reprove(page, row, reason) {
  return api(page, '/api/oFlow/approve', { ofmCode: Number(row.ofmCode), reproveReason: reason, type: 'N' });
}

async function createRaw(page, staff, expense, date) {
  return api(page, '/api/oFlow/setRecord', {
    ofmType: 'D', staCode: Number(staff.staCode), ofmDate: isoToBr(date),
    ofmDescription: `Lançamento automático retroativo - ${expense.oexName}`,
    ofmValue: Number(expense.amount).toFixed(2), oexCode: Number(expense.oexCode),
    odtCode: 1, ofmDocument: '0', moreThenOneCompany: 'N', scpCode: 1,
  }, true);
}

async function create(
  page,
  staff,
  expense,
  date,
  {
    cafeAuthorized = false,
    hasLaudo = false,
  } = {},
) {
  assertDirectExpenseAllowed(expense, { cafeAuthorized, hasLaudo });
  return createRaw(page, staff, expense, date);
}

async function fetchMovementsForDate(page, isoDate) {
  const br = isoToBr(isoDate);
  const report = await api(page, '/api/reports/finance/operatingFlow', {
    ofmDateFrom: br, ofmDateTo: br, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList',
  });
  return report.searchData || [];
}

async function recordAudit(row) {
  const { error } = await getSupabase().from('grm_despesas_retroativas_auditoria').insert({
    ...row,
    diagnostico: { ...(row.diagnostico || {}), execucao_pontual: true, versao_pontual: VERSION },
  });
  if (error) throw error;
}

function useBudget(budget) {
  if (budget.count >= budget.max) return false;
  budget.count += 1;
  return true;
}

// Trata uma pendência duplicada cuja observação indica que ela foi lançada
// na data errada: recusa com "data corrigida" e relança na data indicada
// pela observação, desde que não exista ali um lançamento ativo (P/A) da
// mesma categoria para o mesmo colaborador (evita duplicar a despesa).
async function applyCorrection(page, date, row, staffRow, correctedDate, budget) {
  const baseIdentity = {
    cpf: digits(staffRow?.staCPF),
    colaborador: row.staName || staffRow?.staName || `staCode ${row.staCode}`,
    sta_code: Number(row.staCode),
    tipo_despesa: row.oexName,
    oex_code: Number(row.oexCode),
    valor: Number(row.ofmValue || 0),
    dry_run: DRY_RUN,
  };
  const descricaoOriginal = row.ofmDescription || row.description || row.descricao || '';

  if (!useBudget(budget)) {
    await recordAudit({
      ...baseIdentity,
      data_referencia: date,
      acao: 'ADIADO',
      ofm_code: Number(row.ofmCode),
      sucesso: false,
      erro: `Limite de ${budget.max} ações atingido nesta execução; correção de data adiada.`,
      diagnostico: { criterio: 'DUPLICADO_OBSERVACAO_DATA_RETROATIVA', descricao_original: descricaoOriginal, data_corrigida: correctedDate },
    });
    log('WARN', `${baseIdentity.colaborador} / ${baseIdentity.tipo_despesa}: limite de ações atingido, correção de data adiada.`);
    return;
  }

  const reprovalAudit = {
    ...baseIdentity,
    data_referencia: date,
    acao: 'REPROVE',
    ofm_code: Number(row.ofmCode),
    diagnostico: {
      criterio: 'DUPLICADO_OBSERVACAO_DATA_RETROATIVA',
      descricao_original: descricaoOriginal,
      data_corrigida: correctedDate,
      motivo_recusa: 'data corrigida',
    },
  };
  try {
    if (!DRY_RUN) await reprove(page, row, 'data corrigida');
    reprovalAudit.sucesso = true;
  } catch (error) {
    reprovalAudit.sucesso = false;
    reprovalAudit.erro = error.message;
    await recordAudit(reprovalAudit);
    log('ERROR', `${baseIdentity.colaborador} / ${baseIdentity.tipo_despesa}: falha ao recusar duplicado (data corrigida): ${error.message}`);
    return;
  }
  await recordAudit(reprovalAudit);
  log('INFO', `${baseIdentity.colaborador} / ${baseIdentity.tipo_despesa}: duplicado recusado (data corrigida), relançando em ${correctedDate}.`);

  const relaunchAudit = {
    ...baseIdentity,
    data_referencia: correctedDate,
    diagnostico: {
      criterio: 'RELANCAMENTO_DATA_CORRIGIDA',
      data_original_recusada: date,
      ofm_code_recusado: Number(row.ofmCode),
    },
  };

  try {
    const targetMovements = DRY_RUN ? [] : await fetchMovementsForDate(page, correctedDate);
    const alreadyThere = targetMovements.some((r) => Number(r.staCode) === Number(row.staCode)
      && Number(r.oexCode) === Number(row.oexCode)
      && r.ofmType === 'D'
      && String(r.ofmStatus).toUpperCase() !== 'N');

    if (alreadyThere) {
      relaunchAudit.acao = 'SKIP_DUPLICADO';
      relaunchAudit.sucesso = true;
      await recordAudit(relaunchAudit);
      log('INFO', `${baseIdentity.colaborador} / ${baseIdentity.tipo_despesa}: já existe lançamento ativo em ${correctedDate}; não recriado.`);
      return;
    }

    relaunchAudit.acao = 'CREATE';
    if (!DRY_RUN) {
      if (!staffRow) throw new Error('Colaborador não localizado no GRM para relançamento.');
      await createRaw(page, staffRow, { oexName: row.oexName, oexCode: row.oexCode, amount: Number(row.ofmValue || 0) }, correctedDate);
      const refreshed = await fetchMovementsForDate(page, correctedDate);
      const created = refreshed
        .filter((r) => Number(r.staCode) === Number(row.staCode) && Number(r.oexCode) === Number(row.oexCode))
        .sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
      if (!created) throw new Error('Lançamento na data corrigida não apareceu na conferência após criação.');
      relaunchAudit.ofm_code = Number(created.ofmCode);
      if (created.ofmStatus === 'P') await approve(page, created);
    }
    relaunchAudit.sucesso = true;
  } catch (error) {
    relaunchAudit.sucesso = false;
    relaunchAudit.erro = error.message;
    log('ERROR', `${baseIdentity.colaborador} / ${baseIdentity.tipo_despesa}: falha ao relançar em ${correctedDate}: ${error.message}`);
  }
  await recordAudit(relaunchAudit);
}

// Segunda passada do dia: aprova pendências de Almoço/Diária já existentes
// no GRM fora da lista de candidatos por laudo (ex.: criadas pelo motor
// AUTO) usando haveMovement=SIM como autorização — também sem Programação.
// Café fica de fora da aprovação automática aqui (mantém autorização
// operacional própria), mas ainda participa da correção de "data corrigida".
async function processMovementFallback(page, grm, date, visitedKeys, budget) {
  const AUTO_APPROVE_CATEGORIES = new Set(['ALMOCO', 'SALARIO DE INTERMITENTE', 'SERVICOS TERCEIRIZADOS']);
  const CORRECTION_CATEGORIES = new Set([...AUTO_APPROVE_CATEGORIES, 'CAFE']);

  const groups = new Map();
  for (const row of grm.movements) {
    if (row.ofmType !== 'D' || !CORRECTION_CATEGORIES.has(norm(row.oexName))) continue;
    const key = `${Number(row.staCode)}|${Number(row.oexCode)}`;
    if (visitedKeys.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const summary = {
    grupos: groups.size, corrigidos: 0, ja_aprovados: 0, aprovados: 0, sem_pendente_elegivel: 0, adiados: 0, erros: 0,
  };

  for (const rows of groups.values()) {
    const staffRow = grm.staff.find((row) => Number(row.staCode) === Number(rows[0].staCode));
    const { correctable, remaining } = partitionDuplicates(rows, date);
    for (const { row, correctedDate } of correctable) {
      await applyCorrection(page, date, row, staffRow, correctedDate, budget);
      summary.corrigidos += 1;
    }

    if (!AUTO_APPROVE_CATEGORIES.has(norm(rows[0].oexName))) continue;

    const approved = remaining.some((row) => String(row.ofmStatus || '').toUpperCase() === 'A');
    if (approved) { summary.ja_aprovados += 1; continue; }

    const eligiblePending = remaining
      .filter((row) => String(row.ofmStatus || '').toUpperCase() === 'P' && String(row.haveMovement || '').toUpperCase() === 'S')
      .sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));

    if (!eligiblePending.length) { summary.sem_pendente_elegivel += 1; continue; }

    const chosen = eligiblePending[0];
    const audit = {
      data_referencia: date,
      cpf: digits(staffRow?.staCPF),
      colaborador: chosen.staName || staffRow?.staName || `staCode ${chosen.staCode}`,
      sta_code: Number(chosen.staCode),
      tipo_despesa: chosen.oexName,
      oex_code: Number(chosen.oexCode),
      valor: Number(chosen.ofmValue || 0),
      acao: 'APPROVE',
      dry_run: DRY_RUN,
      ofm_code: Number(chosen.ofmCode),
      diagnostico: { criterio: 'EMBARQUE_SIM_SEM_PROGRAMACAO', haveMovement: chosen.haveMovement },
    };
    if (!useBudget(budget)) {
      summary.adiados += 1;
      audit.acao = 'ADIADO';
      audit.sucesso = false;
      audit.erro = `Limite de ${budget.max} ações atingido nesta execução; adiado.`;
      log('WARN', `${audit.colaborador} / ${audit.tipo_despesa}: ${audit.erro}`);
      await recordAudit(audit);
      continue;
    }
    try {
      if (!DRY_RUN) await approve(page, chosen);
      audit.sucesso = true;
      summary.aprovados += 1;
    } catch (error) {
      audit.sucesso = false;
      audit.erro = error.message;
      summary.erros += 1;
      log('ERROR', `${audit.colaborador} / ${audit.tipo_despesa}: ${error.message}`);
    }
    await recordAudit(audit);
  }

  return summary;
}

async function processDate(page, date, budget) {
  const source = await loadCandidates(date);
  const summary = {
    data: date,
    elegiveis: source.candidates.length,
    checked: 0,
    unchanged: 0,
    approve: 0,
    create: 0,
    corrigidos_data: 0,
    errors: 0,
    unresolved: 0,
    adiados: 0,
    cafe_programado: 0,
    cafe_autorizado_login: 0,
    cafe_bloqueado_login: 0,
  };
  const visitedKeys = new Set();

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
      { hasLaudo: candidate.hasLaudo, cafeAuthorized },
    ).filter((expense) => !TARGET_EXPENSE || norm(expense.oexName) === TARGET_EXPENSE);

    if (!expenses.length) continue;

    const staff = findStaff(candidate, grm.staff);
    if (!staff) {
      summary.unresolved += 1;
      log('WARN', `${date}: colaborador não localizado no GRM.`, { nome: candidate.nome, cpf: candidate.cpf });
      continue;
    }

    for (const expense of expenses) {
      summary.checked += 1;
      visitedKeys.add(`${Number(staff.staCode)}|${Number(expense.oexCode)}`);
      const existingAll = grm.movements.filter((row) => Number(row.staCode) === Number(staff.staCode)
        && Number(row.oexCode) === Number(expense.oexCode) && row.ofmType === 'D');

      const { correctable, remaining } = partitionDuplicates(existingAll, date);
      for (const { row, correctedDate } of correctable) {
        await applyCorrection(page, date, row, staff, correctedDate, budget);
        summary.corrigidos_data += 1;
      }

      const decision = decide(remaining);
      const audit = {
        data_referencia: date, cpf: digits(candidate.cpf), colaborador: candidate.nome,
        sta_code: Number(staff.staCode), tipo_contrato: candidate.tipo_contrato,
        tipo_despesa: expense.oexName, oex_code: Number(expense.oexCode), valor: expense.amount,
        acao: decision.action, dry_run: DRY_RUN,
        diagnostico: {
          laudo: candidate.hasLaudo,
          cafe_programado: candidate.cafeProgrammed,
          cafe_login_valido_04_07: cafeAuthorized,
          existentes: existingAll.map((r) => ({ ofmCode: r.ofmCode, status: r.ofmStatus, valor: r.ofmValue })),
          corrigidos_data: correctable.map(({ row, correctedDate }) => ({ ofmCode: row.ofmCode, data_corrigida: correctedDate })),
          duplicados_pendentes: decision.duplicates || 0,
        },
      };
      try {
        assertDirectExpenseAllowed(expense, { cafeAuthorized, hasLaudo: candidate.hasLaudo });
        if (decision.action === 'NONE') summary.unchanged += 1;
        else if (!useBudget(budget)) {
          summary.adiados += 1;
          audit.sucesso = false;
          audit.erro = `Limite de ${budget.max} ações atingido nesta execução; adiado.`;
          log('WARN', `${date}: ${candidate.nome} / ${expense.oexName}: ${audit.erro}`);
          await recordAudit(audit);
          continue;
        }
        else if (decision.action === 'APPROVE') {
          summary.approve += 1;
          audit.ofm_code = Number(decision.row.ofmCode);
          if (!DRY_RUN) await approve(page, decision.row);
        } else {
          if (!(Number(expense.amount) > 0)) throw new Error(`Valor inválido para ${expense.oexName}: ${expense.amount}`);
          summary.create += 1;
          if (!DRY_RUN) {
            await create(page, staff, expense, date, { cafeAuthorized, hasLaudo: candidate.hasLaudo });
            const refreshed = await fetchMovementsForDate(page, date);
            const created = refreshed.filter((row) => Number(row.staCode) === Number(staff.staCode) && Number(row.oexCode) === Number(expense.oexCode)).sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
            if (!created) throw new Error('Lançamento não apareceu na conferência após criação.');
            audit.ofm_code = Number(created.ofmCode);
            if (created.ofmStatus === 'P') await approve(page, created);
            grm.movements.push({ ...created, ofmStatus: 'A' });
          }
        }
        audit.sucesso = true;
      } catch (error) {
        summary.errors += 1; audit.sucesso = false; audit.erro = error.message;
        log('ERROR', `${date}: ${candidate.nome} / ${expense.oexName}: ${error.message}`);
      }
      await recordAudit(audit);
    }
  }

  const fallbackSummary = await processMovementFallback(page, grm, date, visitedKeys, budget);
  summary.fallback = fallbackSummary;
  summary.errors += fallbackSummary.erros;

  log(summary.errors ? 'WARN' : 'SUCCESS', `Dia ${date} concluído.`, summary);
  return summary;
}

async function main() {
  if (!process.env.GRMSERVER_USER || !process.env.GRMSERVER_PASSWORD) throw new Error('Credenciais GRM ausentes.');
  const dates = dateRange(DATA_DE, DATA_ATE);
  const budget = { count: 0, max: MAX_ACTIONS };

  log('INFO', `Execução pontual ${VERSION} iniciada.`, {
    de: DATA_DE, ate: DATA_ATE, dias: dates.length, dry_run: DRY_RUN, max_acoes: MAX_ACTIONS,
    cpf_alvo: TARGET_CPF || null, tipo_alvo: TARGET_EXPENSE || null,
  });

  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const totals = {
    dias_processados: 0, checked: 0, unchanged: 0, approve: 0, create: 0,
    corrigidos_data: 0, errors: 0, unresolved: 0, adiados: 0,
    fallback_aprovados: 0, fallback_corrigidos: 0, fallback_adiados: 0,
  };

  try {
    const page = await browser.newPage();
    await login(page);

    for (const date of dates) {
      if (budget.count >= budget.max) {
        log('WARN', `Limite de ${budget.max} ações atingido; interrompendo antes de ${date}. Rode de novo (ele retoma pelo estado real do GRM) pra continuar.`);
        break;
      }
      const daySummary = await processDate(page, date, budget);
      totals.dias_processados += 1;
      totals.checked += daySummary.checked;
      totals.unchanged += daySummary.unchanged;
      totals.approve += daySummary.approve;
      totals.create += daySummary.create;
      totals.corrigidos_data += daySummary.corrigidos_data;
      totals.errors += daySummary.errors;
      totals.unresolved += daySummary.unresolved;
      totals.adiados += daySummary.adiados;
      totals.fallback_aprovados += daySummary.fallback.aprovados;
      totals.fallback_corrigidos += daySummary.fallback.corrigidos;
      totals.fallback_adiados += daySummary.fallback.adiados;
    }
  } finally {
    await browser.close();
  }

  log(totals.errors ? 'WARN' : 'SUCCESS', 'Execução pontual concluída.', { ...totals, acoes_usadas: budget.count, acoes_max: budget.max, dry_run: DRY_RUN });
  if (totals.errors) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
module.exports = {
  norm,
  dateRange,
  requiredExpenses,
  decide,
  assertDirectExpenseAllowed,
  validateCafeAuthorization,
  extractCorrectedDate,
  partitionDuplicates,
};
