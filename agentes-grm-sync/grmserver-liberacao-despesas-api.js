#!/usr/bin/env node

/**
 * Aplica as Regras de Caixa Operacional (liberação de despesas) direto no
 * Graint via API, substituindo o fluxo Puppeteer/UI
 * (grm-sync-liberacao-despesas.js) — mesmo tipo de migração já feita em
 * Colaboradores, Lista de O.S. e Distribuição de O.S. (ver
 * grmserver-colaboradores-api-realtime.js, grmserver-lista-os-api-realtime.js,
 * grmserver-aplicar-distribuicao-os-api.js).
 *
 * Formato de escrita descoberto e validado ao vivo em 02/09 (ver memória
 * painel-web-grm-liberacao-despesas-api-descoberta) com um teste real de
 * no-op em produção (CPF 10573307954, zero efeitos colaterais em outros
 * campos do cadastro). O fluxo real, replicado do componente Vue
 * `StaffOperatingFlowRules`/`Staff.js` (assets/Staff-DM_MB2on.js do Graint):
 *
 *   1. user/login -> token (Authorization: Bearer em todas as chamadas
 *      seguintes).
 *   2. staff/getRecords {groupSearch: cpf} -> registro completo do
 *      colaborador (achatado, ~70 campos incluindo joins).
 *   3. staffOFlowRules/getRecords {staCode} -> regras atuais de Caixa
 *      Operacional ({sofrCode, staCode, oexCode, sofrShowOnMobile,
 *      sofrMaxValue, sofrAutoAccept, sofrNeedLoadNHE, sofrMaxMovementsDay,
 *      sofrStatus}).
 *   4. oFlowExpenseType/getRecords {} -> lista de tipos de despesa
 *      (oexCode/oexName) — cacheada uma vez por execução, usada pra mapear
 *      tipo_despesa (texto) -> oexCode.
 *   5. Monta o payload de staff/setRecord: registro do passo 2 + as 4 datas
 *      (staInitDate/staAdmissionDate/staResignationDate/staBirthDate)
 *      reformatadas de ISO pra DD/MM/YYYY, staMobPhoneID removido (nunca
 *      reenviar — é do app mobile do colaborador), staMobOlsCodes
 *      normalizado pra array de inteiros, oFlowRules com as regras
 *      desejadas, moreThenOneCompany e changeAssetSupervision:"N".
 *   6. staff/setRecord com o payload inteiro -> {result:true,
 *      message:"updateSuccess"}. O Graint recria as linhas de regra a cada
 *      save (sofrCode muda), então nunca usar sofrCode como chave de
 *      idempotência entre execuções — comparar por (staCode, oexCode).
 *   7. Confere de novo com staffOFlowRules/getRecords antes de marcar
 *      sucesso na fila.
 */

require('dotenv').config();
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } },
);

// Job atualmente reivindicado da fila (se houver) — usado só pelo watchdog
// global pra tentar soltar o lock antes de matar o processo. Ver main().
let watchdogCurrentJobId = null;

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
// Fail-safe: se a variável sumir do .env por qualquer motivo, o agente cai em
// dry-run (não escreve), igual ao script Puppeteer que substitui.
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_LIBERACAO_DESPESAS_DRY_RUN ?? 'true').toLowerCase() !== 'false';
const DEBUG = String(process.env.GRM_LIBERACAO_DESPESAS_DEBUG ?? 'false').toLowerCase() === 'true';
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_LIBERACAO_DESPESAS_MAX_POR_EXECUCAO || 10));
// Sem browser pra travar, o timeout pode ser bem mais curto que o da versão Puppeteer.
const TIMEOUT_MIN = Number(process.env.GRM_LIBERACAO_DESPESAS_TIMEOUT_MIN || 10) || 10;

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function todaySaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function safe(data) { return Array.isArray(data) ? data : []; }

// Aceita número, "300", "300.5" ou "300,50" (BR); NaN vira 0 em vez de
// propagar silenciosamente como sofrMaxValue:null pro Graint.
function toMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Replica formatHelper.js do Graint: moment.utc(v, true).format("DD/MM/YYYY").
// staff/getRecords já devolveu esses campos em formato não-ISO em produção
// (ver normalizeDate em grmserver-colaboradores-api-realtime.js, que trata os
// mesmos campos), então aceita os dois formatos em vez de só ISO.
function formatDateBR(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, mo, y] = br;
    return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${d}/${mo}/${y}`;
  }
  // Formato desconhecido e não vazio: mais seguro falhar alto do que apagar
  // uma data real de RH (nascimento/admissão/demissão) silenciosamente.
  const error = new Error(`Data em formato inesperado, não é seguro reenviar: "${value}".`);
  error.code = 'DATA_FORMATO_INESPERADO';
  throw error;
}

function requestJson(url, method = 'GET', body = null, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout ao consultar o GRM.')));
    request.on('error', reject);
    request.end(payload || undefined);
  });
}
function postJson(url, body, headers = {}) { return requestJson(url, 'POST', body, headers); }

async function login() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail,
    userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

function authHeaders(token) { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }; }

async function getStaffByCpf(token, cpf) {
  const response = await postJson(`${GRM_BASE_URL}staff/getRecords`, {
    staName: '', staCPF: '', staEmail: '', staStatus: 'A', groupSearch: digits(cpf),
  }, authHeaders(token));
  if (!response.result) throw new Error(`staff/getRecords falhou: ${response.message || 'erro'}`);
  const rows = safe(response.searchData);
  if (rows.length !== 1) {
    const error = new Error(
      `Colaborador CPF ${cpf} não encontrado de forma única no Graint (${rows.length} resultado(s)).`,
    );
    error.code = 'COLABORADOR_NAO_ENCONTRADO';
    throw error;
  }
  return rows[0];
}

async function getOFlowRules(token, staCode) {
  const response = await postJson(`${GRM_BASE_URL}staffOFlowRules/getRecords`, { staCode }, authHeaders(token));
  if (!response.result) throw new Error(`staffOFlowRules/getRecords falhou: ${response.message || 'erro'}`);
  return safe(response.searchData);
}

async function getExpenseTypes(token) {
  const response = await postJson(`${GRM_BASE_URL}oFlowExpenseType/getRecords`, {}, authHeaders(token));
  if (!response.result) throw new Error(`oFlowExpenseType/getRecords falhou: ${response.message || 'erro'}`);
  return safe(response.searchData);
}

async function getSysCompanies(token) {
  const response = await postJson(`${GRM_BASE_URL}sysCompany/getRecords`, {}, authHeaders(token));
  if (!response.result) throw new Error(`sysCompany/getRecords falhou: ${response.message || 'erro'}`);
  return safe(response.searchData);
}

async function setStaffRecord(token, payload) {
  const response = await postJson(`${GRM_BASE_URL}staff/setRecord`, payload, authHeaders(token));
  if (!response.result) throw new Error(`staff/setRecord falhou: ${response.message || 'erro'}`);
  return response;
}

function buildStaffSetRecordPayload(staffRow, oFlowRules, moreThenOneCompany) {
  const payload = { ...staffRow };
  payload.utipCode = payload.userType;
  payload.staInitDate = formatDateBR(payload.staInitDate);
  payload.staAdmissionDate = formatDateBR(payload.staAdmissionDate);
  payload.staResignationDate = formatDateBR(payload.staResignationDate);
  payload.staBirthDate = formatDateBR(payload.staBirthDate);
  delete payload.staMobPhoneID;
  if (Array.isArray(payload.staMobOlsCodes)) {
    // já veio como array — mantém.
  } else if (typeof payload.staMobOlsCodes === 'string' && payload.staMobOlsCodes.length > 0) {
    payload.staMobOlsCodes = payload.staMobOlsCodes.split(',').map((v) => parseInt(v, 10));
  } else {
    payload.staMobOlsCodes = [];
  }
  payload.oFlowRules = oFlowRules;
  payload.moreThenOneCompany = moreThenOneCompany;
  payload.changeAssetSupervision = 'N';
  return payload;
}

// --- Regras de negócio (portadas de grm-sync-liberacao-despesas.js) ---

// Trava de segurança: só Almoço, Salário de Intermitente e Serviços
// Terceirizados podem sair como AUTO no GRM. Qualquer outro tipo tem o AUTO
// zerado aqui, mesmo que job.regras (vindo de grm_despesas_tipos_config)
// tenha chegado com auto=true por engano/edição manual na tabela — a
// publicação (Edge Function) é a origem dos dados, mas este worker é quem
// efetivamente aplica no GRM, então não confia cegamente na fonte.
function autoObrigatorioPorTipo(tipo) {
  const key = norm(tipo);
  return key === 'ALMOCO' || key === 'SALARIO DE INTERMITENTE' || key === 'SERVICOS TERCEIRIZADOS';
}

function canonicalRules(rules) {
  const unique = new Map();
  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = {
      tipo_despesa: String(raw.tipo_despesa || '').trim(),
      exibir: raw.exibir !== false,
      valor_maximo: toMoney(raw.valor_maximo),
      auto: raw.auto === true,
      carga_nhe: raw.carga_nhe !== false,
      max_mov_dia: Math.max(0, Number(raw.max_mov_dia ?? 1) || 0),
    };
    if (rule.tipo_despesa) unique.set(norm(rule.tipo_despesa), rule);
  }
  return [...unique.values()].sort((a, b) => a.tipo_despesa.localeCompare(b.tipo_despesa, 'pt-BR'));
}

function desiredRules(rules) {
  return canonicalRules(
    (Array.isArray(rules) ? rules : []).map((rule) => ({
      ...rule,
      auto: autoObrigatorioPorTipo(rule?.tipo_despesa),
    })),
  );
}

// Converte as regras vindas do Graint (staffOFlowRules/getRecords, com
// oexCode) pro mesmo formato canônico (com tipo_despesa em texto), usando o
// mapa oexCode->oexName carregado uma vez por execução.
function graintRulesToCanonical(graintRules, expenseTypeNameByCode) {
  const ativos = safe(graintRules).filter((rule) => String(rule.sofrStatus || 'A') === 'A');

  // Um oexCode sem nome mapeado é uma regra "órfã" (tipo de despesa
  // renomeado/desativado no Graint depois que a regra foi criada) — nunca
  // descartar em silêncio, senão o agente pode achar que currentRules já
  // bate com desired e deixar essa regra ativa esquecida no colaborador.
  const orfas = ativos.filter((rule) => !expenseTypeNameByCode.has(rule.oexCode));
  if (orfas.length) {
    log('WARN', `${orfas.length} regra(s) de Caixa Operacional com oexCode não mapeado (tipo removido/renomeado no Graint?).`, {
      oexCodes: orfas.map((rule) => rule.oexCode),
    });
  }

  return canonicalRules(
    ativos
      .filter((rule) => expenseTypeNameByCode.has(rule.oexCode))
      .map((rule) => ({
        tipo_despesa: expenseTypeNameByCode.get(rule.oexCode),
        exibir: rule.sofrShowOnMobile !== 'N',
        valor_maximo: toMoney(rule.sofrMaxValue),
        auto: rule.sofrAutoAccept === 'S',
        carga_nhe: rule.sofrNeedLoadNHE !== 'N',
        max_mov_dia: Number(rule.sofrMaxMovementsDay ?? 1),
      })),
  );
}

// Exibir e Carga/NHE não fazem parte do contrato deste agente: não são
// alterados e também não podem transformar uma aplicação válida em
// divergência. AUTO entra na mesma exceção quando o Graint travou o
// checkbox (sofrShowOnMobile="N" desabilita AUTO no formulário real — ver
// template do componente StaffOperatingFlowRules) — só nesse caso o campo
// sai da comparação.
function rulesEqual(current, desired, autoLockedTypes) {
  const locked = autoLockedTypes || new Set();
  const comparable = (rules) => canonicalRules(rules).map((rule) => ({
    tipo_despesa: rule.tipo_despesa,
    valor_maximo: rule.valor_maximo,
    auto: locked.has(norm(rule.tipo_despesa)) ? null : rule.auto,
    max_mov_dia: rule.max_mov_dia,
  }));
  return JSON.stringify(comparable(current)) === JSON.stringify(comparable(desiredRules(desired)));
}

async function applyEmployeeRules(token, job, ctx) {
  const desired = desiredRules(job.regras);
  const staffRow = await getStaffByCpf(token, job.cpf);
  const graintRulesRaw = await getOFlowRules(token, staffRow.staCode);
  const currentRules = graintRulesToCanonical(graintRulesRaw, ctx.expenseTypeNameByCode);

  log('INFO', `CPF ${job.cpf}: regras atuais=${currentRules.length}, desejadas=${desired.length}, ação=${job.acao}.`);

  if (rulesEqual(currentRules, desired)) {
    return { changed: false, currentRules, verifiedRules: currentRules, autoLockedTypes: [] };
  }

  // Mapeia tipo_despesa (texto) -> oexCode; erro cedo e explícito se algum
  // tipo desejado não existir no Graint (equivalente ao CATEGORIA_NAO_MAPEADA
  // da versão Puppeteer).
  const oexCodeByType = new Map();
  for (const rule of desired) {
    const oexCode = ctx.expenseTypeCodeByName.get(norm(rule.tipo_despesa));
    if (oexCode == null) {
      const error = new Error(
        `Tipo de despesa "${rule.tipo_despesa}" não existe no Graint (oFlowExpenseType). `
          + `Opções disponíveis: ${[...ctx.expenseTypeNameByCode.values()].join(' | ') || 'nenhuma'}.`,
      );
      error.code = 'CATEGORIA_NAO_MAPEADA';
      error.requestedType = rule.tipo_despesa;
      error.availableTypes = [...ctx.expenseTypeNameByCode.values()];
      throw error;
    }
    oexCodeByType.set(norm(rule.tipo_despesa), oexCode);
  }

  // Preserva sofrCode de linhas existentes que continuam desejadas (mesmo
  // oexCode) — categorias que saíram da lista desejada simplesmente não
  // entram no array novo (equivalente a excluir a linha no formulário).
  const existingByOexCode = new Map(safe(graintRulesRaw).map((rule) => [rule.oexCode, rule]));
  const newOFlowRules = desired.map((rule) => {
    const oexCode = oexCodeByType.get(norm(rule.tipo_despesa));
    const existing = existingByOexCode.get(oexCode);
    return {
      sofrCode: existing ? existing.sofrCode : 0,
      staCode: staffRow.staCode,
      oexCode,
      sofrShowOnMobile: rule.exibir ? 'S' : 'N',
      sofrMaxValue: rule.valor_maximo,
      sofrAutoAccept: rule.auto ? 'S' : 'N',
      sofrNeedLoadNHE: rule.carga_nhe ? 'S' : 'N',
      sofrMaxMovementsDay: rule.max_mov_dia,
      sofrStatus: 'A',
    };
  });

  const payload = buildStaffSetRecordPayload(staffRow, newOFlowRules, ctx.moreThenOneCompany);
  await setStaffRecord(token, payload);

  const verifiedRaw = await getOFlowRules(token, staffRow.staCode);
  const verifiedRules = graintRulesToCanonical(verifiedRaw, ctx.expenseTypeNameByCode);

  // O Graint pode ajustar o AUTO sozinho no backend por motivos fora do
  // controle deste agente (na versão Puppeteer isso aparecia como o checkbox
  // "disabled" no formulário). Em vez de tentar prever DE ANTEMÃO quando isso
  // vai acontecer (frágil a mudanças no Graint), compara o resultado real:
  // qualquer divergência isolada no campo AUTO vira aviso tolerado — os
  // campos financeiros (valor/carga-NHE/máx. mov. dia) continuam exigindo
  // igualdade exata em rulesEqual().
  const verifiedByType = new Map(verifiedRules.map((rule) => [norm(rule.tipo_despesa), rule]));
  const autoLockedTypes = new Set();
  for (const rule of desired) {
    const verified = verifiedByType.get(norm(rule.tipo_despesa));
    if (verified && verified.auto !== rule.auto) autoLockedTypes.add(norm(rule.tipo_despesa));
  }
  if (autoLockedTypes.size) {
    log('WARN', `CPF ${job.cpf}: Graint não aceitou AUTO para ${[...autoLockedTypes].join(', ')}; liberação segue sem AUTO nesses tipos.`);
  }

  if (!rulesEqual(verifiedRules, desired, autoLockedTypes)) {
    const error = new Error('Graint ficou divergente depois de salvar as Regras de Caixa Operacional.');
    error.code = 'DIVERGENTE';
    error.currentRules = currentRules;
    error.verifiedRules = verifiedRules;
    throw error;
  }

  return { changed: true, currentRules, verifiedRules, autoLockedTypes: [...autoLockedTypes] };
}

// --- Fila (Supabase) — portado sem mudanças de grm-sync-liberacao-despesas.js ---

async function activateTodayQueue() {
  const today = todaySaoPaulo();
  const now = new Date().toISOString();

  const { data: activated, error: activateError } = await supabase
    .from('grm_despesas_fila')
    .update({ status: 'PENDENTE', locked_at: null, finalizado_em: null, ultimo_erro: null })
    .eq('status', 'AGENDADO')
    .eq('data_referencia', today)
    .select('id');
  if (activateError) throw activateError;

  const { data: expired, error: expireError } = await supabase
    .from('grm_despesas_fila')
    .update({
      status: 'EXPIRADO', locked_at: null, finalizado_em: now,
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
  };
  log('INFO', 'Ativação segura da fila diária concluída.', result);
  return result;
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
  const { data, error } = await supabase.rpc('claim_next_grm_despesa_fila', { p_excluir_ids: excludedIds });
  if (error) throw error;
  return data && data.id ? data : null;
}

async function listDryRunJobs() {
  const { data, error } = await supabase
    .from('grm_despesas_fila')
    .select('*')
    .in('status', ['PENDENTE', 'ERRO'])
    .eq('data_referencia', todaySaoPaulo())
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;
  return data || [];
}

async function updateQueue(id, patch) {
  const { error } = await supabase.from('grm_despesas_fila').update(patch).eq('id', id);
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

async function markSuccess(job, result) {
  const finalStatus = desiredRules(job.regras).length ? 'APLICADO' : 'LIMPO';
  const now = new Date().toISOString();

  await updateQueue(job.id, {
    status: finalStatus,
    locked_at: null,
    finalizado_em: now,
    ultimo_erro: null,
    diagnostico: {
      changed: result.changed,
      regras_antes: result.currentRules,
      regras_confirmadas: result.verifiedRules,
      auto_bloqueado_pelo_grm: result.autoLockedTypes?.length ? result.autoLockedTypes : null,
      via: 'api',
    },
  });

  await updateStateIfCurrent(job, { hash_aplicado: job.hash_desejado, status_aplicacao: finalStatus, aplicado_em: now });
}

async function markFailure(job, error) {
  const attempts = Number(job.tentativas || 0);
  const maxAttempts = Number(job.max_tentativas || 3);
  const categoryNotMapped = error.code === 'CATEGORIA_NAO_MAPEADA';
  const exhausted = categoryNotMapped || attempts >= maxAttempts;
  const status = categoryNotMapped || (exhausted && error.code === 'DIVERGENTE') ? 'DIVERGENTE' : 'ERRO';

  await updateQueue(job.id, {
    status,
    tentativas: categoryNotMapped ? maxAttempts : attempts,
    locked_at: null,
    finalizado_em: exhausted ? new Date().toISOString() : null,
    ultimo_erro: error.message,
    diagnostico: {
      code: error.code || null,
      stack: String(error.stack || '').slice(0, 8000),
      regras_antes: error.currentRules || null,
      regras_confirmadas: error.verifiedRules || null,
      categoria_solicitada: error.requestedType || null,
      categorias_disponiveis: error.availableTypes || null,
      via: 'api',
    },
  });

  await updateStateIfCurrent(job, { status_aplicacao: status });
}

async function recordDryRun(job, currentRules, categoriasNaoMapeadas) {
  await updateQueue(job.id, {
    diagnostico: {
      dry_run: true,
      validado_em: new Date().toISOString(),
      regras_atuais: currentRules,
      regras_desejadas: desiredRules(job.regras),
      iguais: rulesEqual(currentRules, job.regras),
      categorias_nao_mapeadas: categoriasNaoMapeadas?.length ? categoriasNaoMapeadas : null,
      via: 'api',
    },
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
      log('WARN', `Não foi possível conferir fila restante: ${remainingError.message}`);
      return;
    }
    const hasRemaining = (remainingRows || []).some((row) => row.status === 'PENDENTE'
      || (row.status === 'ERRO' && Number(row.tentativas || 0) < Number(row.max_tentativas || 3)));
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
    const { error } = await supabase.from('grm_sync_jobs').insert({ agente_id: 'sync-liberacao-despesas', status: 'pendente' });
    if (error) log('WARN', `Falha ao enfileirar continuação: ${error.message}`);
  }
}

async function buildContext(token) {
  const [expenseTypes, sysCompanies] = await Promise.all([getExpenseTypes(token), getSysCompanies(token)]);
  const expenseTypeCodeByName = new Map();
  const expenseTypeNameByCode = new Map();
  for (const item of expenseTypes) {
    if (!item.oexName) continue;
    expenseTypeCodeByName.set(norm(item.oexName), item.oexCode);
    expenseTypeNameByCode.set(item.oexCode, item.oexName);
  }
  return {
    expenseTypeCodeByName,
    expenseTypeNameByCode,
    moreThenOneCompany: sysCompanies.length > 1 ? 'S' : 'N',
  };
}

async function processDryRun(token, ctx) {
  const jobs = await listDryRunJobs();
  if (!jobs.length) {
    log('INFO', 'DRY_RUN: nenhuma alteração pendente para validar.');
    return { processed: 0, errors: 0, configurationWarnings: 0 };
  }

  let errors = 0;
  let processed = 0;
  let configurationWarnings = 0;

  for (const job of jobs) {
    try {
      const state = await getLatestState(job.cpf, job.data_referencia);
      if (!state || state.hash_desejado !== job.hash_desejado || state.versao_desejada_id !== job.versao_id) {
        log('INFO', `DRY_RUN: job ${job.id} está superado; será ignorado apenas em execução real.`);
        continue;
      }

      processed += 1;
      const staffRow = await getStaffByCpf(token, job.cpf);
      const graintRulesRaw = await getOFlowRules(token, staffRow.staCode);
      const currentRules = graintRulesToCanonical(graintRulesRaw, ctx.expenseTypeNameByCode);
      const desired = desiredRules(job.regras);

      const categoriasNaoMapeadas = desired
        .filter((rule) => !ctx.expenseTypeCodeByName.has(norm(rule.tipo_despesa)))
        .map((rule) => rule.tipo_despesa);
      if (categoriasNaoMapeadas.length) {
        configurationWarnings += 1;
        log('WARN', `DRY_RUN CPF ${job.cpf}: tipo(s) "${categoriasNaoMapeadas.join(', ')}" não existe(m) no Graint.`);
      }

      await recordDryRun(job, currentRules, categoriasNaoMapeadas);
      log('SUCCESS', `DRY_RUN CPF ${job.cpf}: leitura concluída; nenhuma alteração feita.`, {
        atuais: currentRules,
        desejadas: desired,
      });
    } catch (error) {
      errors += 1;
      log('ERROR', `DRY_RUN CPF ${job.cpf}: ${error.message}`);
    }
  }

  return { processed, errors, configurationWarnings };
}

async function processReal(token, ctx) {
  let processed = 0;
  let errors = 0;
  let configurationWarnings = 0;
  const attemptedIds = [];

  for (let index = 0; index < MAX_PER_RUN; index += 1) {
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
      log('WARN', `Job ${job.id} bloqueado pela regra de data.`, { data_referencia: jobDate, hoje: today });
      continue;
    }

    processed += 1;
    watchdogCurrentJobId = job.id;

    try {
      const state = await getLatestState(job.cpf, job.data_referencia);
      if (!state || state.hash_desejado !== job.hash_desejado || state.versao_desejada_id !== job.versao_id) {
        await markSuperseded(job, state);
        log('INFO', `Job ${job.id} ignorado: versão superada.`);
        continue;
      }

      const result = await applyEmployeeRules(token, job, ctx);
      await markSuccess(job, result);
      log('SUCCESS', `CPF ${job.cpf}: ${desiredRules(job.regras).length ? 'regras aplicadas' : 'regras limpas'} e verificadas.`, {
        regras: result.verifiedRules,
      });
    } catch (error) {
      if (error.code === 'CATEGORIA_NAO_MAPEADA') configurationWarnings += 1;
      else errors += 1;

      await markFailure(job, error);
      log(error.code === 'CATEGORIA_NAO_MAPEADA' ? 'WARN' : 'ERROR', `CPF ${job.cpf}: ${error.message}`);
    } finally {
      watchdogCurrentJobId = null;
    }
  }

  await enqueueFollowupIfNeeded(processed === MAX_PER_RUN || errors > 0);
  return { processed, errors, configurationWarnings };
}

async function main() {
  log('INFO', `Iniciando agente de liberação de despesas API (data=${todaySaoPaulo()}, dry_run=${DRY_RUN}, max=${MAX_PER_RUN}).`);
  log('INFO', `Watchdog global configurado para ${TIMEOUT_MIN} minuto(s).`);

  await activateTodayQueue();

  const token = await login();
  log('SUCCESS', 'Login no Graint concluído.');

  const ctx = await buildContext(token);
  log('INFO', `Contexto carregado: ${ctx.expenseTypeCodeByName.size} tipo(s) de despesa, moreThenOneCompany=${ctx.moreThenOneCompany}.`);

  const result = DRY_RUN ? await processDryRun(token, ctx) : await processReal(token, ctx);

  log(
    result.errors ? 'ERROR' : (result.configurationWarnings ? 'WARN' : 'SUCCESS'),
    'Agente concluído.',
    result,
  );

  if (!DRY_RUN && result.errors > 0) process.exitCode = 1;
}

module.exports = {
  login,
  buildContext,
  applyEmployeeRules,
  getStaffByCpf,
  getOFlowRules,
  canonicalRules,
  desiredRules,
  rulesEqual,
  log,
};

if (require.main === module) {
  // Nunca forçar exit(0): deixa o processo sair com o process.exitCode que
  // main() já setou (1 se houve falha real de CPF) — um exit(0) explícito
  // aqui mascararia falhas reais como sucesso pro worker/grm_sync_jobs.
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    log('ERROR', `Erro fatal: ${error.message}`, { stack: error.stack });
    process.exitCode = 1;
    process.exit(1);
  });
  setTimeout(() => {
    log('ERROR', `Watchdog global atingiu ${TIMEOUT_MIN} minuto(s); encerrando o agente para não bloquear a fila indefinidamente.`);
    if (!watchdogCurrentJobId) {
      process.exit(1);
      return;
    }
    // Tenta soltar o lock do job em andamento antes de morrer, com um prazo
    // curto — sem isso o item fica preso até a expiração de 20min do claim.
    const jobId = watchdogCurrentJobId;
    Promise.race([
      updateQueue(jobId, {
        status: 'ERRO',
        locked_at: null,
        finalizado_em: new Date().toISOString(),
        ultimo_erro: `Watchdog global atingiu ${TIMEOUT_MIN} minuto(s) com este job em andamento.`,
      }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).finally(() => process.exit(1));
  }, TIMEOUT_MIN * 60 * 1000);
}
