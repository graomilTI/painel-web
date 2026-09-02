#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const VERSION = 'V6.1-API-DIRETA-ALMOCO-PROGRAMACAO-JANTA-19H-LOCAL';
const GRM_BASE_URL = String(
  process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/',
).replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};
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

function assertDirectExpenseAllowed(
  expense,
  { cafeAuthorized = false, jantaAuthorized = false } = {},
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
  if (key === 'JANTA' && jantaAuthorized !== true) {
    const error = new Error(
      `Despesa ${expenseName || key} bloqueada: Janta exige Programação do Painel e ao menos um laudo lançado a partir das 19h no horário local do ponto de embarque.`,
    );
    error.code = 'JANTA_SEM_AUTORIZACAO_OPERACIONAL';
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

const AMAZONAS_UTC5 = new Set([
  'ATALAIA DO NORTE', 'BENJAMIN CONSTANT', 'BOCA DO ACRE', 'EIRUNEPE', 'ENVIRA',
  'GUAJARA', 'IPIXUNA', 'ITAMARATI', 'JUTAI', 'LABREA', 'PAUINI',
  'SAO PAULO DE OLIVENCA', 'TABATINGA', 'TONANTINS',
]);

function pointOffsetFromSaoPauloHours(uf, city) {
  const state = norm(uf);
  const cityKey = norm(city);
  if (state === 'AC') return -2;
  if (state === 'AM' && AMAZONAS_UTC5.has(cityKey)) return -2;
  if (['AM', 'MT', 'MS', 'RO', 'RR'].includes(state)) return -1;
  if (state === 'PE' && cityKey.includes('FERNANDO DE NORONHA')) return 1;
  return 0;
}

function registerDateAtPoint(value, uf, city) {
  const match = String(value || '').trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const offsetHours = pointOffsetFromSaoPauloHours(uf, city);
  const base = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6] || 0),
  );
  const local = new Date(base + offsetHours * 60 * 60 * 1000);
  const ymd = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}:${String(local.getUTCSeconds()).padStart(2, '0')}`;
  return { ymd, time, hour: local.getUTCHours(), offsetHours };
}

function requiredExpenses(
  contractType,
  salary,
  expenseTypes,
  {
    programmed = true,
    almocoProgrammed = false,
    hasLaudo = true,
    cafeAuthorized = false,
    jantaAuthorized = false,
  } = {},
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
    if (almocoProgrammed) {
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

  if (jantaAuthorized) {
    const dinner = expenseTypes.get('JANTA');
    if (!dinner) throw new Error('Categoria Janta não encontrada no GRM.');
    result.push({ ...dinner, amount: Number(dinner.oexMaxOperatingFlowValue || 30) });
  }

  return result;
}

// "orphans" são pendências (status P) que sobram além da que a decisão
// resolve — seja porque já existe uma aprovada (NONE ignora as demais) ou
// porque só a primeira pendência é aprovada aqui (APPROVE). Ficam sem
// aprovação nem recusa a menos que alguém as trate — o chamador é
// responsável por recusá-las (ver reprove() em main()).
function decide(existing) {
  const pending = existing.filter((row) => row.ofmStatus === 'P')
    .sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));
  if (existing.some((row) => row.ofmStatus === 'A')) return { action: 'NONE', orphans: pending };
  if (pending.length) return { action: 'APPROVE', row: pending[0], orphans: pending.slice(1) };
  return { action: 'CREATE', orphans: [] };
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

function rowsByName(rows, predicate) {
  const result = new Map();
  for (const row of rows.filter(predicate)) {
    const name = norm(row.nome_colaborador);
    if (!name) continue;
    result.set(name, [...(result.get(name) || []), row]);
  }
  return result;
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
      'programacao_id,colaborador_id,nome_colaborador,cafe,almoco,janta,data_referencia',
      (q) => q.eq('data_referencia', date),
    ),
    queryAll('producao_snapshot', 'funcionario,data,os,cargas,tons', (q) => q.eq('data', date)),
    queryAll('colaborador_cruzamento', 'colaborador_id,cpf,nome,tipo_contrato,salario,atualizado_em', (q) => q.order('atualizado_em', { ascending: false })),
  ]);

  const laudoNames = new Set(production.map((row) => norm(row.funcionario)).filter(Boolean));
  const cafeRowsByName = rowsByName(alimentation, (row) => row.cafe === true);
  const almocoRowsByName = rowsByName(alimentation, (row) => row.almoco === true);
  const jantaRowsByName = rowsByName(alimentation, (row) => row.janta === true);
  const cafeNames = new Set([...cafeRowsByName.keys()]);
  const jantaNames = new Set([...jantaRowsByName.keys()]);
  const candidateNames = new Set([...laudoNames, ...cafeNames, ...jantaNames]);

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
    const cafeItems = cafeRowsByName.get(name) || [];
    const almocoItems = almocoRowsByName.get(name) || [];
    const jantaItems = jantaRowsByName.get(name) || [];
    const cafeItem = cafeItems[0];
    const almocoItem = almocoItems[0];
    const jantaItem = jantaItems[0];
    const programmedItem = programmedByName.get(name);
    const referenceItem = cafeItem || almocoItem || jantaItem || programmedItem;
    const contract = contractsById.get(String(referenceItem?.colaborador_id || '')) || contractsByName.get(name);
    if (!contract || !['DIARISTA', 'INTERMITENTE', 'EFETIVO'].includes(norm(contract.tipo_contrato))) continue;

    const isProgrammed = programmedIds.has(String(contract.colaborador_id || '')) || programmedNames.has(name);
    const hasLaudo = laudoNames.has(name);
    const cafeProgrammed = cafeItems.length > 0;
    const almocoProgrammed = almocoItems.length > 0;
    const jantaProgrammed = jantaItems.length > 0;

    if (norm(contract.tipo_contrato) === 'EFETIVO' && hasLaudo && !isProgrammed) continue;
    if (!hasLaudo && !cafeProgrammed && !jantaProgrammed) continue;

    unique.set(digits(contract.cpf) || name, {
      ...contract,
      nameKey: name,
      programmed: isProgrammed,
      hasLaudo,
      cafeProgrammed,
      almocoProgrammed,
      jantaProgrammed,
      programacaoId: String(cafeItem?.programacao_id || programmedItem?.programacao_id || ''),
      programacaoColaboradorId: String(cafeItem?.colaborador_id || programmedItem?.colaborador_id || contract.colaborador_id || ''),
      jantaProgramacaoIds: [...new Set(jantaItems.map((row) => String(row.programacao_id || '')).filter(Boolean))],
      jantaColaboradorIds: [...new Set(jantaItems.map((row) => String(row.colaborador_id || '')).filter(Boolean))],
    });
  }

  return {
    candidates: [...unique.values()],
    programmed: programmed.length,
    production: laudoNames.size,
    cafesProgramados: alimentation.filter((row) => row.cafe === true).length,
    almocosProgramados: alimentation.filter((row) => row.almoco === true).length,
    jantasProgramadas: alimentation.filter((row) => row.janta === true).length,
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

async function validateJantaAuthorization(candidate, date) {
  const baseResult = {
    authorized: false,
    reason: 'JANTA_NAO_PROGRAMADA',
    laudo: null,
    os: null,
    cadastro_grm: null,
    cadastro_local: null,
    uf: null,
    cidade: null,
    offset_horas: null,
  };
  if (!candidate.jantaProgrammed || !candidate.jantaProgramacaoIds?.length) return baseResult;

  const teamRows = await queryAll(
    'programacao_equipe',
    'programacao_id,os_id,colaborador_id,nome_colaborador,confirmado',
    (q) => q.in('programacao_id', candidate.jantaProgramacaoIds).eq('confirmado', true),
  );
  const acceptedIds = new Set([
    String(candidate.colaborador_id || ''),
    String(candidate.programacaoColaboradorId || ''),
    ...(candidate.jantaColaboradorIds || []),
  ].filter(Boolean));
  const cpf = digits(candidate.cpf);
  const matchingTeam = teamRows.filter((row) => {
    const rowId = String(row.colaborador_id || '');
    return acceptedIds.has(rowId)
      || (cpf.length === 11 && digits(rowId) === cpf)
      || norm(row.nome_colaborador) === candidate.nameKey;
  });
  const osIds = [...new Set(matchingTeam.map((row) => String(row.os_id || '')).filter(Boolean))];
  if (!osIds.length) return { ...baseResult, reason: 'SEM_OS_CONFIRMADA_NA_PROGRAMACAO' };

  const osRows = await queryAll(
    'operacional_os',
    'id,numero_os,embarque,ponto_embarque_id',
    (q) => q.in('id', osIds),
  );
  const pointIds = [...new Set(osRows.map((row) => String(row.ponto_embarque_id || '')).filter(Boolean))];
  const pointRows = pointIds.length
    ? await queryAll(
      'operacional_pontos_embarque',
      'id,uf,cidade,nome_local',
      (q) => q.in('id', pointIds),
    )
    : [];
  const pointsById = new Map(pointRows.map((row) => [String(row.id), row]));
  const targetByOs = new Map();
  for (const row of osRows) {
    const numero = digits(row.numero_os);
    if (!numero) continue;
    const point = pointsById.get(String(row.ponto_embarque_id || '')) || {};
    targetByOs.set(numero, {
      numeroOs: numero,
      uf: String(point.uf || '').trim(),
      cidade: String(point.cidade || '').trim(),
      local: String(point.nome_local || row.embarque || '').trim(),
    });
  }
  const osNumbers = [...targetByOs.keys()];
  if (!osNumbers.length) return { ...baseResult, reason: 'OS_SEM_NUMERO' };

  const loads = await queryAll(
    'grm_cargas_importacoes',
    'data_classificacao,os,colaborador,laudo,dados_json',
    (q) => q.eq('data_classificacao', date).in('os', osNumbers),
  );
  const validLoads = [];
  for (const row of loads) {
    if (norm(row.colaborador) !== candidate.nameKey) continue;
    const laudo = String(row.laudo || row.dados_json?.loaLaudo || '').trim();
    if (!laudo) continue;
    const target = targetByOs.get(digits(row.os));
    if (!target) continue;
    const registerDate = String(row.dados_json?.loaRegisterDate || '').trim();
    if (!registerDate) continue;
    const uf = String(row.dados_json?.staAbreviation || target.uf || '').trim().toUpperCase();
    const cidade = String(row.dados_json?.citName || target.cidade || '').trim();
    const local = registerDateAtPoint(registerDate, uf, cidade);
    if (!local || local.ymd !== date || local.hour < 19) continue;
    validLoads.push({
      laudo,
      os: target.numeroOs,
      cadastro_grm: registerDate,
      cadastro_local: `${local.ymd} ${local.time}`,
      uf,
      cidade,
      offset_horas: local.offsetHours,
    });
  }

  if (!validLoads.length) return { ...baseResult, reason: 'SEM_LAUDO_APOS_19H_LOCAL' };
  validLoads.sort((a, b) => String(b.cadastro_local).localeCompare(String(a.cadastro_local)));
  return {
    authorized: true,
    reason: 'PROGRAMADA_E_LAUDO_APOS_19H_LOCAL',
    ...validLoads[0],
  };
}

async function grmRequest(path, body, token = null, multipart = false) {
  const endpoint = String(path || '').replace(/^\/+/, '').replace(/^api\//, '');
  const headers = {
    ...GRM_WEB_HEADERS,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  let requestBody;

  if (multipart) {
    if (typeof FormData === 'undefined') {
      throw new Error(`FormData indisponível no ${process.version}; execute este agente com Node.js 22.`);
    }
    const form = new FormData();
    Object.entries(body || {}).forEach(([key, value]) => {
      form.append(key, value == null ? '' : String(value));
    });
    requestBody = form;
  } else {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(body || {});
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(`${GRM_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Timeout de 30s no endpoint GRM ${endpoint}.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`GRM ${endpoint} retornou conteúdo inválido (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok || json?.result === false) {
    throw new Error(`GRM ${endpoint} HTTP ${response.status}: ${json?.message || text.slice(0, 500)}`);
  }
  return json;
}

async function login() {
  log('INFO', 'Autenticando diretamente na API do GRM.');
  const response = await grmRequest('user/login', {
    userEmail: process.env.GRMSERVER_USER,
    userPass: process.env.GRMSERVER_PASSWORD,
    loginInfo: {
      ip: '',
      browser: 'GRM API Agent',
      browserVersion: '1.0',
      engine: 'Node.js',
      engineVersion: process.version,
      platform: process.platform,
      screenSize: '',
      windowSize: '',
    },
  });
  if (!response.token) throw new Error('Login GRM concluído sem token.');
  log('SUCCESS', 'Login direto na API do GRM concluído.');
  return response.token;
}

async function api(token, path, body, multipart = false) {
  return grmRequest(path, body, token, multipart);
}

async function loadGrmData(token, date) {
  const br = isoToBr(date);
  const [report, staff, types] = await Promise.all([
    api(token, '/api/reports/finance/operatingFlow', { ofmDateFrom: br, ofmDateTo: br, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList' }),
    api(token, '/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }),
    api(token, '/api/oFlowExpenseType/getRecords', { oexStatus: 'A' }),
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

async function approve(token, row) {
  return api(token, '/api/oFlow/approve', {
    ofmCode: Number(row.ofmCode), reproveReason: '', type: 'A',
  });
}

async function reprove(token, row, reason) {
  return api(token, '/api/oFlow/approve', {
    ofmCode: Number(row.ofmCode), reproveReason: reason, type: 'N',
  });
}

async function create(
  token,
  staff,
  expense,
  date,
  { cafeAuthorized = false, jantaAuthorized = false } = {},
) {
  assertDirectExpenseAllowed(expense, { cafeAuthorized, jantaAuthorized });
  return api(token, '/api/oFlow/setRecord', {
    ofmType: 'D',
    staCode: Number(staff.staCode),
    ofmDate: isoToBr(date),
    ofmDescription: `Lançamento automático retroativo - ${expense.oexName}`,
    ofmValue: Number(expense.amount).toFixed(2),
    oexCode: Number(expense.oexCode),
    odtCode: 1,
    ofmDocument: '0',
    moreThenOneCompany: 'N',
    scpCode: 1,
  }, true);
}

async function recordAudit(row) {
  const { error } = await getSupabase().from('grm_despesas_retroativas_auditoria').insert(row);
  if (error) throw error;
}

async function main() {
  if (!process.env.GRMSERVER_USER || !process.env.GRMSERVER_PASSWORD) {
    throw new Error('Credenciais GRM ausentes.');
  }
  const date = process.env.GRM_DESPESAS_RETROATIVAS_DATA || yesterdaySaoPaulo();
  const source = await loadCandidates(date);
  log('INFO', `Agente ${VERSION}: base ${date}.`, {
    programados: source.programmed,
    cafes_programados: source.cafesProgramados,
    almocos_programados: source.almocosProgramados,
    jantas_programadas: source.jantasProgramadas,
    com_producao: source.production,
    elegiveis: source.candidates.length,
    dry_run: DRY_RUN,
  });

  const token = await login();
  const grm = await loadGrmData(token, date);
  const summary = {
    checked: 0,
    unchanged: 0,
    approve: 0,
    create: 0,
    errors: 0,
    unresolved: 0,
    adiados: 0,
    cafe_programado: 0,
    almoco_programado: 0,
    cafe_autorizado_login: 0,
    cafe_bloqueado_login: 0,
    janta_programada: 0,
    janta_autorizada_laudo_19h: 0,
    janta_bloqueada_laudo_19h: 0,
    orfas_recusadas: 0,
  };
  let actionCount = 0;

  for (const candidate of source.candidates) {
    let cafeAuthorized = false;
    if (candidate.cafeProgrammed) {
      summary.cafe_programado += 1;
      cafeAuthorized = await validateCafeAuthorization(candidate, date);
      if (cafeAuthorized) summary.cafe_autorizado_login += 1;
      else summary.cafe_bloqueado_login += 1;
    }

    let jantaValidation = {
      authorized: false,
      reason: candidate.jantaProgrammed ? 'NAO_VALIDADA' : 'JANTA_NAO_PROGRAMADA',
    };
    if (candidate.jantaProgrammed) {
      summary.janta_programada += 1;
      jantaValidation = await validateJantaAuthorization(candidate, date);
      if (jantaValidation.authorized) summary.janta_autorizada_laudo_19h += 1;
      else summary.janta_bloqueada_laudo_19h += 1;
    }
    const jantaAuthorized = jantaValidation.authorized === true;

    if (candidate.almocoProgrammed) summary.almoco_programado += 1;

    const expenses = requiredExpenses(
      candidate.tipo_contrato,
      candidate.salario,
      grm.expenseTypes,
      {
        programmed: candidate.programmed,
        almocoProgrammed: candidate.almocoProgrammed,
        hasLaudo: candidate.hasLaudo,
        cafeAuthorized,
        jantaAuthorized,
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
        data_referencia: date,
        cpf: digits(candidate.cpf),
        colaborador: candidate.nome,
        sta_code: Number(staff.staCode),
        tipo_contrato: candidate.tipo_contrato,
        tipo_despesa: expense.oexName,
        oex_code: Number(expense.oexCode),
        valor: expense.amount,
        acao: decision.action,
        dry_run: DRY_RUN,
        diagnostico: {
          laudo: candidate.hasLaudo,
          programado: candidate.programmed,
          almoco_programado: candidate.almocoProgrammed,
          cafe_programado: candidate.cafeProgrammed,
          cafe_login_valido_04_07: cafeAuthorized,
          janta_programada: candidate.jantaProgrammed,
          janta_laudo_apos_19h_local: jantaValidation,
          existentes: existing.map((r) => ({ ofmCode: r.ofmCode, status: r.ofmStatus, valor: r.ofmValue })),
          duplicados_pendentes: (decision.orphans || []).length,
        },
      };

      try {
        assertDirectExpenseAllowed(expense, { cafeAuthorized, jantaAuthorized });
        if (decision.action === 'NONE') {
          summary.unchanged += 1;
        } else if (actionCount >= MAX_ACTIONS) {
          summary.adiados += 1;
          audit.sucesso = false;
          audit.erro = `Limite de ${MAX_ACTIONS} ações atingido nesta execução; adiado para a próxima.`;
          log('WARN', `${candidate.nome} / ${expense.oexName}: ${audit.erro}`);
          await recordAudit(audit);
          continue;
        } else if (decision.action === 'APPROVE') {
          summary.approve += 1;
          actionCount += 1;
          audit.ofm_code = Number(decision.row.ofmCode);
          if (!DRY_RUN) await approve(token, decision.row);
        } else {
          if (!(Number(expense.amount) > 0)) {
            throw new Error(`Valor inválido para ${expense.oexName}: ${expense.amount}`);
          }
          summary.create += 1;
          actionCount += 1;
          if (!DRY_RUN) {
            await create(token, staff, expense, date, { cafeAuthorized, jantaAuthorized });
            const refreshed = await api(token, '/api/reports/finance/operatingFlow', {
              ofmDateFrom: isoToBr(date),
              ofmDateTo: isoToBr(date),
              ofmStatusReport: ['P', 'A', 'N'],
              reportType: 'flowList',
            });
            const created = (refreshed.searchData || [])
              .filter((row) => Number(row.staCode) === Number(staff.staCode)
                && Number(row.oexCode) === Number(expense.oexCode))
              .sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
            if (!created) throw new Error('Lançamento não apareceu na conferência após criação.');
            audit.ofm_code = Number(created.ofmCode);
            if (created.ofmStatus === 'P') await approve(token, created);
            grm.movements.push({ ...created, ofmStatus: 'A' });
          }
        }
        audit.sucesso = true;
      } catch (error) {
        summary.errors += 1;
        audit.sucesso = false;
        audit.erro = error.message;
        log('ERROR', `${candidate.nome} / ${expense.oexName}: ${error.message}`);
      }
      await recordAudit(audit);

      // Recusa pendências duplicadas que sobraram (já existe uma aprovada, ou
      // só a primeira pendência foi aprovada acima) — sem isso ficavam
      // paradas em GRM como risco de pagamento em dobro se alguém aprovasse
      // manualmente depois.
      for (const orphan of decision.orphans || []) {
        const orphanAudit = {
          data_referencia: date,
          cpf: digits(candidate.cpf),
          colaborador: candidate.nome,
          sta_code: Number(staff.staCode),
          tipo_contrato: candidate.tipo_contrato,
          tipo_despesa: expense.oexName,
          oex_code: Number(expense.oexCode),
          valor: Number(orphan.ofmValue) || 0,
          acao: 'REPROVE',
          dry_run: DRY_RUN,
          diagnostico: {
            motivo: 'pendencia_orfa_apos_dedupe',
            decisao_original: decision.action,
          },
        };
        try {
          if (actionCount >= MAX_ACTIONS) {
            summary.adiados += 1;
            orphanAudit.sucesso = false;
            orphanAudit.erro = `Limite de ${MAX_ACTIONS} ações atingido nesta execução; adiado para a próxima.`;
            log('WARN', `${candidate.nome} / ${expense.oexName}: recusa de pendência órfã (ofm ${orphan.ofmCode}) adiada.`);
          } else {
            actionCount += 1;
            orphanAudit.ofm_code = Number(orphan.ofmCode);
            if (!DRY_RUN) {
              await reprove(token, orphan, 'Recusa automática: pendência duplicada para a mesma despesa/dia.');
            }
            summary.orfas_recusadas += 1;
            orphanAudit.sucesso = true;
          }
        } catch (error) {
          summary.errors += 1;
          orphanAudit.sucesso = false;
          orphanAudit.erro = error.message;
          log('ERROR', `${candidate.nome} / ${expense.oexName}: falha ao recusar pendência órfã (ofm ${orphan.ofmCode}): ${error.message}`);
        }
        await recordAudit(orphanAudit);
      }
    }
  }

  log(summary.errors ? 'WARN' : 'SUCCESS', 'Execução concluída.', summary);
  if (summary.errors) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  norm,
  yesterdaySaoPaulo,
  pointOffsetFromSaoPauloHours,
  registerDateAtPoint,
  requiredExpenses,
  decide,
  assertDirectExpenseAllowed,
  validateCafeAuthorization,
  validateJantaAuthorization,
};
