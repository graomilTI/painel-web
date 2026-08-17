#!/usr/bin/env node
/*
 * GRM Server - Finalização automática de Ordens de Serviço
 *
 * Fluxo:
 * 1. Abre /operation/serviceOrder com Situação=Abertas e Financeiro=Não Faturadas.
 * 2. Aplica as regras, nesta ordem:
 *    a) clientes presentes em GRM_FINALIZAR_OS_CLIENTES_EXCLUIDOS nunca são
 *       finalizados automaticamente, independentemente do critério;
 *    b) marcada como FINALIZAR pelo gestor: aguarda aprovação (Check) da
 *       Logística e nunca é processada enquanto estiver PENDENTE;
 *    c) aprovada pela Logística: finaliza por decisão humana;
 *    d) não marcada: finaliza se Remanescente = 0,00;
 *    e) não marcada: finaliza se o Relatório de Cargas comprovar mais de
 *       5 dias corridos sem lançamento, independentemente do Serviço
 *       (inclusive FOB ZERO).
 *    Ausência de registros no Relatório de Cargas não comprova inatividade.
 * 3. Pesquisa cada O.S. individualmente, relê o Remanescente diretamente na
 *    grade, seleciona a linha, aciona "Finalizar OS" e confirma o modal.
 * 4. Confirma que a O.S. desapareceu da lista de abertas antes de registrar
 *    sucesso. Cada job conclui no máximo a quantidade configurada (recomendado: 1).
 *
 * Uso:
 *   node grm-sync-finalizar-os.js --dry-run
 *   node grm-sync-finalizar-os.js --limit 10
 *   node grm-sync-finalizar-os.js --os 86138 --dry-run
 *
 * Variáveis principais:
 *   GRM_FINALIZAR_OS_DIAS_SEM_MOVIMENTO=5
 *   GRM_FINALIZAR_OS_MAX_POR_EXECUCAO=50
 *   GRM_FINALIZAR_OS_DRY_RUN=false
 *   GRM_FINALIZAR_OS_DEBUG=false
 *   GRM_FINALIZAR_OS_CLIENTES_EXCLUIDOS=BTG
 */

process.env.HOME = '/home/grao100';
process.env.TMP = '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = '/home/grao100/chrome-runtime/tmp';
process.env.TMPDIR = '/home/grao100/chrome-runtime/tmp';
process.env.XDG_RUNTIME_DIR = '/home/grao100/chrome-runtime/tmp';
process.env.XDG_CACHE_HOME = '/home/grao100/chrome-runtime/cache';
process.env.XDG_CONFIG_HOME = '/home/grao100/chrome-runtime/config';
process.env.MALLOC_ARENA_MAX = process.env.MALLOC_ARENA_MAX || '2';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const { setupDownloadDir, triggerAndWaitForDownload } = require('./download-utils');

puppeteer.use(StealthPlugin());

const SERVICE_ORDER_URL = 'https://www.grmserver.com.br/operation/serviceOrder';
const LOGIN_URL = 'https://www.grmserver.com.br/login';
const XLS_SELECTOR = '.serviceOrder-os-list-to-xls button';

const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SB_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

const ENV_DIAS_SEM_MOVIMENTO = integerFromEnv('GRM_FINALIZAR_OS_DIAS_SEM_MOVIMENTO', 5);
const ENV_LIMIT = integerFromEnv('GRM_FINALIZAR_OS_MAX_POR_EXECUCAO', 50);
const ENV_DRY_RUN = boolFromEnv('GRM_FINALIZAR_OS_DRY_RUN', false);
const ENV_DEBUG = boolFromEnv('GRM_FINALIZAR_OS_DEBUG', false) || boolFromEnv('GRM_DEBUG', false);
const ENV_TIMEOUT_MS = integerFromEnv('GRM_FINALIZAR_OS_TIMEOUT_MS', 15 * 60 * 1000);
const ENV_CLIENTES_EXCLUIDOS = [...new Set(
  String(process.env.GRM_FINALIZAR_OS_CLIENTES_EXCLUIDOS || 'BTG')
    .split(',')
    .map((value) => normText(value))
    .filter(Boolean),
)];

const TABLE_EXECUCOES = 'grm_finalizacao_os_execucoes';
const TABLE_RESULTADOS = 'grm_finalizacao_os_resultados';
const MOVEMENT_RPC = 'grm_ultima_movimentacao_os';
const BUSINESS_TIMEZONE = 'America/Sao_Paulo';
const BUSINESS_UTC_OFFSET = '-03:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_TOLERANCE = 0.0049;

let browserAtual = null;
let auditEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
let supabase = null;

if (auditEnabled) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--real') out.dryRun = false;
    else if (arg === '--debug') out.debug = true;
    else if (arg === '--os') out.os = argv[++i];
    else if (arg === '--min') out.min = Number(String(argv[++i]).replace(',', '.'));
    else if (arg === '--max') out.max = Number(String(argv[++i]).replace(',', '.'));
    else if (arg === '--limit') out.limit = Number.parseInt(argv[++i], 10);
  }
  return out;
}

function assertConfig() {
  const missing = [];
  if (!GRM_USER) missing.push('GRMSERVER_USER');
  if (!GRM_PASSWORD) missing.push('GRMSERVER_PASSWORD');
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
}

function stripAccents(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(value) {
  return stripAccents(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
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

function parseNumberLoose(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

  let text = String(value == null ? '' : value).trim();
  if (!text) return NaN;
  text = text.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return NaN;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizedRow(raw) {
  const row = {};
  Object.keys(raw || {}).forEach((key) => {
    row[normText(key)] = raw[key];
  });
  return row;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normText(alias);
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function formatBrNumber(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

function isOpenStatus(value) {
  if (value == null || String(value).trim() === '') return true;
  const normalized = normText(value);
  return normalized === 'ABERTA' || normalized === 'ABERTAS' || normalized.includes('ABERT');
}

function isNotInvoiced(value) {
  if (value == null || String(value).trim() === '') return true;
  const normalized = normText(value);
  return normalized.includes('NAO FATURAD');
}

function clientFromNormalizedRow(row) {
  const value = pick(row, [
    'Cliente',
    'Cliente Nacional',
    'Cliente Regional',
    'Cliente Final',
    'Contratante',
    'Razão Social',
    'Razao Social',
  ]);
  return value == null ? '' : String(value).trim();
}

function serviceFromNormalizedRow(row) {
  const value = pick(row, [
    'Serviço',
    'Servico',
    'Tipo de Serviço',
    'Tipo de Servico',
    'Tipo Serviço',
    'Tipo Servico',
    'Serviço Principal',
    'Servico Principal',
    'Descrição do Serviço',
    'Descricao do Servico',
  ]);
  return value == null ? '' : String(value).trim();
}

function candidateService(candidate) {
  if (candidate?.servico) return String(candidate.servico).trim();
  if (candidate?.dados && typeof candidate.dados === 'object') {
    return serviceFromNormalizedRow(normalizedRow(candidate.dados));
  }
  return '';
}

function candidateClient(candidate) {
  if (candidate?.cliente) return String(candidate.cliente).trim();
  if (candidate?.dados && typeof candidate.dados === 'object') {
    return clientFromNormalizedRow(normalizedRow(candidate.dados));
  }
  return '';
}

function excludedClientToken(clientName) {
  const normalized = normText(clientName);
  if (!normalized) return null;
  return ENV_CLIENTES_EXCLUIDOS.find((token) => normalized.includes(token)) || null;
}

function isExcludedClient(clientName) {
  return Boolean(excludedClientToken(clientName));
}

function excludedClientEvaluation(candidate) {
  const cliente = candidateClient(candidate);
  const token = excludedClientToken(cliente);
  return {
    eligible: false,
    criterion: 'CLIENTE_EXCLUIDO',
    reason: `Cliente "${cliente || 'não identificado'}" bloqueado pela exceção automática${token ? ` (${token})` : ''}.`,
    cliente,
    ultimaMovimentacao: null,
    diasSemMovimento: null,
    totalCargasRelatorio: 0,
  };
}

function extractOpenCandidates(rows, onlyOs) {
  const seen = new Set();
  const candidates = [];

  for (const raw of rows || []) {
    const row = normalizedRow(raw);
    const osNumber = normOs(pick(row, ['O.S.', 'O.S', 'OS', 'ORDEM DE SERVICO', 'ORDEM SERVICO']));
    const remaining = parseNumberLoose(pick(row, ['Remanescente', 'Saldo Remanescente', 'Saldo']));
    const status = pick(row, ['Situação', 'Situacao', 'Status']);
    const financial = pick(row, ['Financeiro', 'Situação Financeira', 'Situacao Financeira']);
    const cliente = clientFromNormalizedRow(row);
    const servico = serviceFromNormalizedRow(row);

    if (!osNumber || !Number.isFinite(remaining)) continue;
    if (onlyOs && normOs(onlyOs) !== osNumber) continue;
    if (!isOpenStatus(status) || !isNotInvoiced(financial)) continue;
    if (seen.has(osNumber)) continue;

    seen.add(osNumber);
    candidates.push({
      os: osNumber,
      remanescenteExportado: remaining,
      situacao: status == null ? '' : String(status),
      financeiro: financial == null ? '' : String(financial),
      cliente,
      servico,
      dados: raw,
    });
  }

  candidates.sort((a, b) => {
    if (a.remanescenteExportado !== b.remanescenteExportado) {
      return a.remanescenteExportado - b.remanescenteExportado;
    }
    return Number(a.os) - Number(b.os);
  });

  return candidates;
}

function extractOpenRowsByOs(rows) {
  const out = new Map();
  for (const raw of rows || []) {
    const row = normalizedRow(raw);
    const osNumber = normOs(pick(row, ['O.S.', 'O.S', 'OS', 'ORDEM DE SERVICO', 'ORDEM SERVICO']));
    const remaining = parseNumberLoose(pick(row, ['Remanescente', 'Saldo Remanescente', 'Saldo']));
    const status = pick(row, ['Situação', 'Situacao', 'Status']);
    const financial = pick(row, ['Financeiro', 'Situação Financeira', 'Situacao Financeira']);
    const cliente = clientFromNormalizedRow(row);
    const servico = serviceFromNormalizedRow(row);
    if (!osNumber || !Number.isFinite(remaining)) continue;
    if (!isOpenStatus(status) || !isNotInvoiced(financial)) continue;
    if (!out.has(osNumber)) {
      out.set(osNumber, {
        os: osNumber,
        remanescenteExportado: remaining,
        situacao: status == null ? '' : String(status),
        financeiro: financial == null ? '' : String(financial),
        cliente,
        servico,
        dados: raw,
      });
    }
  }
  return out;
}

function isZeroRemaining(value) {
  return Number.isFinite(value) && Math.abs(value) <= ZERO_TOLERANCE;
}

function movementAgeInfo(value, requiredDays) {
  if (!value) return { valid: false, eligible: false, days: null, hours: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { valid: false, eligible: false, days: null, hours: null };
  const ageMs = Date.now() - date.getTime();
  const hours = ageMs / (60 * 60 * 1000);
  const days = ageMs / DAY_MS;
  return {
    valid: ageMs >= 0,
    eligible: ageMs > requiredDays * DAY_MS,
    days,
    hours,
  };
}

async function loadLastMovements(osNumbers) {
  const result = { available: false, map: new Map(), error: null };
  const unique = [...new Set((osNumbers || []).map(normOs).filter(Boolean))];
  if (!supabase || !unique.length) return result;

  result.available = true;
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const { data, error } = await supabase.rpc(MOVEMENT_RPC, { p_oss: chunk });
    if (error) {
      result.available = false;
      result.error = error;
      result.map.clear();
      log('WARN', `Relatório de Cargas indisponível para validar inatividade: ${error.message}. O agente seguirá apenas com O.S. de Remanescente 0,00.`);
      return result;
    }

    for (const row of data || []) {
      const osNumber = normOs(row.numero_os || row.os);
      if (!osNumber) continue;
      result.map.set(osNumber, {
        ultimaMovimentacao: row.ultima_movimentacao || null,
        totalCargas: Number(row.total_cargas || 0),
      });
    }
  }
  return result;
}

function evaluateEligibility(candidate, remaining, movement, requiredDays) {
  if (candidate?.origem === 'LOGISTICA_APROVADA' || candidate?.criterion === 'APROVADA_LOGISTICA') {
    return {
      eligible: true,
      criterion: 'APROVADA_LOGISTICA',
      reason: 'Solicitação de finalização aprovada pela Logística.',
      ultimaMovimentacao: movement?.ultimaMovimentacao || null,
      diasSemMovimento: movementAgeInfo(movement?.ultimaMovimentacao, requiredDays).days,
      totalCargasRelatorio: movement?.totalCargas || 0,
    };
  }

  if (isZeroRemaining(remaining)) {
    return {
      eligible: true,
      criterion: 'REMANESCENTE_ZERO',
      reason: 'Remanescente atual igual a 0,00.',
      ultimaMovimentacao: movement?.ultimaMovimentacao || null,
      diasSemMovimento: movementAgeInfo(movement?.ultimaMovimentacao, requiredDays).days,
      totalCargasRelatorio: movement?.totalCargas || 0,
    };
  }

  const age = movementAgeInfo(movement?.ultimaMovimentacao, requiredDays);
  if (movement?.totalCargas > 0 && age.valid && age.eligible) {
    return {
      eligible: true,
      criterion: 'SEM_MOVIMENTO_5_DIAS',
      reason: `${age.days.toFixed(1).replace('.', ',')} dia(s) sem movimento no Relatório de Cargas.`,
      ultimaMovimentacao: movement.ultimaMovimentacao,
      diasSemMovimento: age.days,
      totalCargasRelatorio: movement.totalCargas,
    };
  }

  if (!movement || movement.totalCargas <= 0 || !movement.ultimaMovimentacao) {
    return {
      eligible: false,
      criterion: 'SEM_COMPROVACAO_MOVIMENTO',
      reason: 'O Relatório de Cargas não possui movimentação datada para comprovar 5 dias de inatividade.',
      ultimaMovimentacao: null,
      diasSemMovimento: null,
      totalCargasRelatorio: movement?.totalCargas || 0,
    };
  }

  return {
    eligible: false,
    criterion: 'MOVIMENTO_RECENTE',
    reason: `Último movimento há ${age.days == null ? '?' : age.days.toFixed(1).replace('.', ',')} dia(s), abaixo do mínimo de ${requiredDays} dias.`,
    ultimaMovimentacao: movement.ultimaMovimentacao,
    diasSemMovimento: age.days,
    totalCargasRelatorio: movement.totalCargas,
  };
}

function filterEligibleCandidates(candidates, movementResult, requiredDays) {
  const eligible = [];
  const rejected = [];
  for (const candidate of candidates || []) {
    candidate.cliente = candidateClient(candidate);
    candidate.servico = candidateService(candidate);

    if (isExcludedClient(candidate.cliente)) {
      const evaluation = excludedClientEvaluation(candidate);
      Object.assign(candidate, evaluation);
      rejected.push(candidate);
      continue;
    }

    if (candidate.naoLocalizadaNaListaAberta || !Number.isFinite(candidate.remanescenteExportado)) {
      const evaluation = {
        eligible: false,
        criterion: 'NAO_LOCALIZADA_ABERTA_NAO_FATURADA',
        reason: 'A O.S. registrada hoje não foi localizada na lista Abertas / Não Faturadas do GRM.',
        ultimaMovimentacao: null,
        diasSemMovimento: null,
        totalCargasRelatorio: 0,
      };
      Object.assign(candidate, evaluation);
      rejected.push(candidate);
      continue;
    }
    const movement = movementResult.map.get(candidate.os) || null;
    const evaluation = evaluateEligibility(candidate, candidate.remanescenteExportado, movement, requiredDays);
    Object.assign(candidate, evaluation);
    if (evaluation.eligible) eligible.push(candidate);
    else rejected.push(candidate);
  }
  return { eligible, rejected };
}

async function loadCurrentMarkState(candidate) {
  if (!supabase || !candidate?.os) return { marked: false, today: false, row: null };

  let query = supabase
    .from('operacional_os')
    .select('id,numero_os,status_gestor,status_logistica,enviado_logistica_em,data_os')
    .eq('numero_os', candidate.os)
    .eq('status_gestor', 'FINALIZAR')
    .order('enviado_logistica_em', { ascending: false, nullsFirst: false })
    .limit(10);
  if (candidate.operacionalOsId) query = query.eq('id', candidate.operacionalOsId);

  const { data, error } = await query;
  if (error) {
    log('WARN', `Não foi possível revalidar a marcação da O.S. ${candidate.os}: ${error.message}`);
    return { marked: null, today: false, row: null, error };
  }

  const row = (data || [])[0] || null;
  if (!row) return { marked: false, today: false, row: null };
  return { marked: true, approved: row.status_logistica === 'APROVADA', row };
}

async function revalidateCandidateEligibility(candidate, remainingOnScreen, requiredDays) {
  candidate.cliente = candidateClient(candidate);
  candidate.servico = candidateService(candidate);
  if (isExcludedClient(candidate.cliente)) {
    const evaluation = excludedClientEvaluation(candidate);
    Object.assign(candidate, evaluation);
    return evaluation;
  }

  const mark = await loadCurrentMarkState(candidate);

  if (mark.marked === true) {
    if (!mark.approved) {
      const evaluation = {
        eligible: false,
        criterion: 'AGUARDANDO_APROVACAO_LOGISTICA',
        reason: 'Solicitação do gestor aguarda Check em Logística > O.S. > Finalização.',
        ultimaMovimentacao: null,
        diasSemMovimento: null,
        totalCargasRelatorio: 0,
      };
      Object.assign(candidate, evaluation);
      return evaluation;
    }

    candidate.origem = 'LOGISTICA_APROVADA';
    candidate.operacionalOsId = mark.row?.id || candidate.operacionalOsId;
    candidate.enviadoLogisticaEm = mark.row?.enviado_logistica_em || candidate.enviadoLogisticaEm;
    candidate.criterion = 'APROVADA_LOGISTICA';
    const evaluation = evaluateEligibility(candidate, remainingOnScreen, null, requiredDays);
    Object.assign(candidate, evaluation);
    return evaluation;
  }

  if (mark.marked === null) {
    const evaluation = {
      eligible: false,
      criterion: 'MARCACAO_NAO_VALIDADA',
      reason: 'Não foi possível confirmar se a O.S. possui marcação antiga; finalização bloqueada por segurança.',
      ultimaMovimentacao: null,
      diasSemMovimento: null,
      totalCargasRelatorio: 0,
    };
    Object.assign(candidate, evaluation);
    return evaluation;
  }

  if (isZeroRemaining(remainingOnScreen)) {
    const evaluation = evaluateEligibility(candidate, remainingOnScreen, null, requiredDays);
    Object.assign(candidate, evaluation);
    return evaluation;
  }

  const movements = await loadLastMovements([candidate.os]);
  const movement = movements.available ? movements.map.get(candidate.os) || null : null;
  const evaluation = evaluateEligibility(candidate, remainingOnScreen, movement, requiredDays);
  Object.assign(candidate, evaluation);
  return evaluation;
}


function businessDateRange(reference = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(reference)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const nextDate = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 1,
  )).toISOString().slice(0, 10);
  return {
    date,
    start: `${date}T00:00:00${BUSINESS_UTC_OFFSET}`,
    end: `${nextDate}T00:00:00${BUSINESS_UTC_OFFSET}`,
  };
}

function isRegisteredToday(value, range = businessDateRange()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(range.start) && date < new Date(range.end);
}

async function loadGestorFinalizationState(onlyOs) {
  const empty = { approved: [], pending: [], allMarkedOs: new Set() };
  if (!supabase) return empty;

  let query = supabase
    .from('operacional_os')
    .select('id,numero_os,remanescente,status_gestor,status_logistica,enviado_logistica_em')
    .eq('status_gestor', 'FINALIZAR')
    .order('enviado_logistica_em', { ascending: false, nullsFirst: false })
    .limit(5000);
  if (onlyOs) query = query.eq('numero_os', onlyOs);

  const { data, error } = await query;
  if (error) {
    log('WARN', `Não foi possível carregar as marcações FINALIZAR: ${error.message}`);
    return empty;
  }

  const approved = [];
  const pending = [];
  const allMarkedOs = new Set();

  for (const row of data || []) {
    const osNumber = normOs(row.numero_os);
    if (!osNumber) continue;
    allMarkedOs.add(osNumber);
    if (row.status_logistica === 'APROVADA') approved.push(row);
    else pending.push(row);
  }

  log('INFO', `${approved.length} O.S. aprovada(s) pela Logística; ${pending.length} solicitação(ões) aguardando decisão humana.`);
  return { approved, pending, allMarkedOs };
}

function buildFinalizationCandidates(rows, openCandidates, gestorState, onlyOs) {
  const byOs = extractOpenRowsByOs(rows);
  const seen = new Set();
  const candidates = [];

  // Solicitações manuais só entram após o Check da Logística.
  for (const gestor of gestorState?.approved || []) {
    const osNumber = normOs(gestor.numero_os);
    if (!osNumber || (onlyOs && normOs(onlyOs) !== osNumber) || seen.has(osNumber)) continue;

    const base = byOs.get(osNumber);
    if (!base) {
      candidates.push({
        os: osNumber,
        remanescenteExportado: Number.NaN,
        situacao: '',
        financeiro: '',
        dados: {},
        origem: 'LOGISTICA_APROVADA',
        criterion: 'APROVADA_LOGISTICA',
        operacionalOsId: gestor.id,
        enviadoLogisticaEm: gestor.enviado_logistica_em,
        naoLocalizadaNaListaAberta: true,
      });
    } else {
      candidates.push({
        ...base,
        origem: 'LOGISTICA_APROVADA',
        criterion: 'APROVADA_LOGISTICA',
        operacionalOsId: gestor.id,
        enviadoLogisticaEm: gestor.enviado_logistica_em,
      });
    }
    seen.add(osNumber);
  }

  // Automáticas: somente O.S. que não possuem nenhuma marcação FINALIZAR.
  // Qualquer marcação manual pendente fica fora do fluxo automático.
  for (const base of openCandidates || []) {
    const osNumber = normOs(base.os);
    if (!osNumber || (onlyOs && normOs(onlyOs) !== osNumber) || seen.has(osNumber)) continue;
    if (gestorState?.allMarkedOs?.has(osNumber)) continue;

    candidates.push({
      ...base,
      origem: 'AUTOMATICO_NAO_MARCADA',
      operacionalOsId: null,
      enviadoLogisticaEm: null,
    });
    seen.add(osNumber);
  }

  return candidates;
}

async function findOperationalOsRow(candidate) {
  if (!supabase || !candidate) return null;

  let query = supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,supervisao,status_gestor,status_logistica,observacao_logistica');

  if (candidate.operacionalOsId) {
    query = query.eq('id', candidate.operacionalOsId).limit(1);
  } else {
    query = query
      .eq('numero_os', candidate.os)
      .order('data_os', { ascending: false, nullsFirst: false })
      .limit(1);
  }

  const { data, error } = await query;
  if (error) {
    log('WARN', `Não foi possível localizar a O.S. ${candidate.os} em operacional_os: ${error.message}`);
    return null;
  }
  return data?.[0] || null;
}

function appendAutomaticFinalizationNote(current, candidate) {
  const criterion = candidate?.criterion === 'APROVADA_LOGISTICA'
    ? 'Critério: solicitação do gestor aprovada pela Logística.'
    : candidate?.criterion === 'SEM_MOVIMENTO_5_DIAS'
      ? `Critério: mais de 5 dias sem lançamento no Relatório de Cargas (${candidate?.diasSemMovimento == null ? '5+' : candidate.diasSemMovimento.toFixed(1).replace('.', ',')} dias); último movimento ${candidate?.ultimaMovimentacao || 'não informado'}.`
      : 'Critério: O.S. não marcada e Remanescente igual a 0,00.';
  const serviceNote = `Serviço: ${candidate?.servico || 'não identificado'}.`;
  const marker = `Finalizada automaticamente pelo agente GRM. ${serviceNote} ${criterion}`;
  const text = String(current || '').trim();
  if (!text) return marker;
  if (text.toUpperCase().includes('FINALIZADA AUTOMATICAMENTE PELO AGENTE GRM')) return text.slice(0, 1000);
  return `${text}
${marker}`.slice(0, 1000);
}

async function registerAutomaticFinalization(candidate) {
  if (!supabase || !candidate) return;
  const row = await findOperationalOsRow(candidate);
  if (!row) {
    log('WARN', `A O.S. ${candidate.os} foi finalizada no GRM, mas não foi localizada em operacional_os para registrar na fila da Logística.`);
    return;
  }

  candidate.operacionalOsId = row.id;
  const now = new Date().toISOString();
  const patch = {
    // Mantém FINALIZAR para que a linha continue visível em
    // Logística > O.S. > Finalização, agora com status FINALIZADA.
    status_gestor: 'FINALIZAR',
    status_logistica: 'FINALIZADA',
    finalizado_em: now,
    observacao_logistica: appendAutomaticFinalizationNote(row.observacao_logistica, candidate),
    updated_at: now,
  };

  const { error } = await supabase
    .from('operacional_os')
    .update(patch)
    .eq('id', row.id);

  if (error) {
    log('WARN', `A O.S. ${candidate.os} foi finalizada no GRM, mas falhou ao registrar na fila da Logística: ${error.message}`);
    return;
  }

  const { error: logError } = await supabase
    .from('logistica_alertas')
    .insert({
      os_id: row.id,
      os: String(row.numero_os || candidate.os),
      tipo: 'FINALIZACAO_OS',
      status: 'FINALIZADA',
      cliente: row.cliente || null,
      local: row.embarque || null,
      coordenacao: row.supervisao || null,
      mensagem: 'Finalizada automaticamente pelo agente GRM',
      payload: {
        origem: 'AGENTE_GRM',
        agente_id: 'sync-finalizar-os',
        finalizado_em: now,
        remanescente_exportado: candidate.remanescenteExportado ?? null,
        remanescente_tela: candidate.remanescenteTela ?? null,
        criterio_finalizacao: candidate.criterion || null,
        servico_grm: candidate.servico || null,
        ultima_movimentacao_cargas: candidate.ultimaMovimentacao || null,
        dias_sem_movimento: candidate.diasSemMovimento ?? null,
        total_cargas_relatorio: candidate.totalCargasRelatorio ?? null,
      },
      criado_por: null,
      updated_at: now,
    });

  if (logError) {
    log('WARN', `A O.S. ${candidate.os} foi registrada como FINALIZADA, mas o histórico da Logística não foi gravado: ${logError.message}`);
  } else {
    log('SUCCESS', `O.S. ${candidate.os} registrada como FINALIZADA em Logística > O.S. > Finalização.`);
  }
}

async function updateGestorQueue(candidate, status, errorMessage = null) {
  if (!supabase || !candidate?.operacionalOsId) return;
  const now = new Date().toISOString();
  const patch = { status_logistica: status, updated_at: now };
  if (errorMessage) patch.observacao_logistica = String(errorMessage).slice(0, 1000);
  const { error } = await supabase
    .from('operacional_os')
    .update(patch)
    .eq('id', candidate.operacionalOsId);
  if (error) log('WARN', `Falha ao atualizar fila da Programação para a O.S. ${candidate.os}: ${error.message}`);
}

async function enqueueNextGestorJobIfNeeded(remainingEligible = 0) {
  if (!supabase) return;
  const { count, error: countError } = await supabase
    .from('operacional_os')
    .select('id', { count: 'exact', head: true })
    .eq('status_gestor', 'FINALIZAR')
    .eq('status_logistica', 'APROVADA');
  if (countError) return;
  if (!count && remainingEligible <= 0) return;

  const { data: pendingJobs, error: jobsError } = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-finalizar-os')
    .eq('status', 'pendente')
    .limit(1);
  if (jobsError || pendingJobs?.length) return;

  const { error } = await supabase
    .from('grm_sync_jobs')
    .insert({ agente_id: 'sync-finalizar-os', status: 'pendente' });
  if (error) log('WARN', `Não foi possível enfileirar a próxima finalização de hoje: ${error.message}`);
  else log('INFO', `${count || 0} aprovada(s) pela Logística e ${remainingEligible} candidata(s) automática(s)/restante(s); próximo job sync-finalizar-os enfileirado.`);
}

async function login(page) {
  log('INFO', 'Iniciando login no GRM Server...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 30000 });
  await clearAndType(page, 'input#input-v-2', GRM_USER);
  await clearAndType(page, 'input#input-v-5', GRM_PASSWORD);
  await page.click('button.submit-btn');

  let logged = false;
  for (let i = 0; i < 45; i += 1) {
    await wait(1000);
    if (!page.url().includes('/login')) {
      logged = true;
      break;
    }
  }

  if (!logged) throw new Error('Login falhou: a página permaneceu em /login após 45 segundos.');
  log('SUCCESS', 'Login realizado com sucesso.');
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value), { delay: 20 });

  await page.evaluate(({ selector: inputSelector, value: inputValue }) => {
    const input = document.querySelector(inputSelector);
    if (!input) return;
    const proto = input.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(input, inputValue);
    else input.value = inputValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector, value: String(value) });
}

async function screenshot(page, name) {
  try {
    const dir = process.env.GRM_FINALIZAR_OS_DEBUG_DIR || path.join(os.tmpdir(), 'grm-finalizar-os-debug');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, name);
    await page.screenshot({ path: filePath, fullPage: false });
    log('DEBUG', `Screenshot salvo em ${filePath}`);
  } catch (error) {
    log('WARN', `Não foi possível salvar screenshot: ${error.message}`);
  }
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
      const text = norm(item.innerText || item.textContent || '');
      return text.startsWith(wanted) || text.includes(`${wanted} `);
    });
    if (!field) return null;
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, label);

  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

async function selectOpenOption(page, target) {
  await wait(500);
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

async function ensureFilter(page, label, target) {
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
      const text = norm(item.innerText || item.textContent || '');
      return text.startsWith(wanted) || text.includes(`${wanted} `);
    });
    if (!field) return null;
    const input = field.querySelector('input');
    return `${field.innerText || ''} ${input ? input.value || '' : ''}`.trim();
  }, label);

  if (current && normText(current).includes(normText(target))) {
    log('INFO', `Filtro ${label}: ${target}.`);
    return;
  }

  const opened = await clickFieldByLabel(page, label);
  if (!opened) throw new Error(`Campo de filtro "${label}" não encontrado.`);
  const selected = await selectOpenOption(page, target);
  if (!selected) throw new Error(`Opção "${target}" não encontrada no filtro "${label}".`);
  log('INFO', `Filtro ${label} ajustado para ${selected}.`);
  await wait(700);
}

async function openServiceOrderPage(page) {
  await page.goto(SERVICE_ORDER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await wait(3000);
  // Na versão atual do Graint os filtros ficam recolhidos no ActionBar. Eles
  // só entram no DOM/ficam visíveis depois que o painel de filtro é aberto.
  const filterButton = await page.$('.serviceOrder-act-filter button, .serviceOrder-act-filter');
  if (filterButton) {
    await filterButton.click();
    await wait(800);
  }
  await ensureFilter(page, 'Situação', 'Abertas');
  await ensureFilter(page, 'Financeiro', 'Não Faturadas');
  await clickSearch(page);
  await wait(1800);
}

async function downloadServiceOrderList(page) {
  const attempts = 2;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log('INFO', `Exportando Lista de OS em XLS (tentativa ${attempt}/${attempts})...`);
    const tempDir = setupDownloadDir('finalizar-os');
    const filePath = await triggerAndWaitForDownload(page, XLS_SELECTOR, tempDir);
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      if (attempt === attempts) throw new Error('O XLS da Lista de OS foi baixado sem linhas.');
      await wait(2500);
      continue;
    }

    const headers = Object.keys(rows[0]).map(normText);
    const hasRemaining = headers.some((header) => header.includes('REMANESCENTE'));
    const hasOs = headers.some((header) => header === 'OS' || header === 'O S' || header.includes('ORDEM DE SERVICO'));
    const hasService = headers.some((header) =>
      header === 'SERVICO' ||
      header === 'SERVICOS' ||
      header.includes('TIPO DE SERVICO') ||
      header.includes('TIPO SERVICO') ||
      header.includes('SERVICO PRINCIPAL') ||
      header.includes('DESCRICAO DO SERVICO')
    );

    if (!hasRemaining || !hasOs || !hasService) {
      const message = `Exportação inesperada. Colunas recebidas: ${Object.keys(rows[0]).join(', ')}`;
      if (attempt === attempts) throw new Error(message);
      log('WARN', `${message}. Repetindo exportação.`);
      await wait(2500);
      continue;
    }

    log('SUCCESS', `${rows.length} linha(s) lida(s) da Lista de OS.`);
    return rows;
  }

  throw new Error('Não foi possível exportar uma Lista de OS válida.');
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
    throw new Error('Campo "O.S." não encontrado na tela de Ordem de Serviço.');
  }
  return element;
}

async function clickSearch(page) {
  const clicked = await page.evaluate(() => {
    const element = document.querySelector('.serviceOrder-act-search button, .serviceOrder-act-search');
    if (!element) return false;
    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button') || element;
    button.click();
    return true;
  });
  if (!clicked) throw new Error('Botão de pesquisa (.serviceOrder-act-search) não encontrado.');
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
  await wait(1800);

  return page.evaluate((wantedOs) => {
    function normOs(value) {
      const text = String(value || '').trim().replace(/\.0+$/, '');
      const digits = text.replace(/[^0-9]/g, '');
      return digits || text;
    }
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }

    const headers = Array.from(document.querySelectorAll('thead th'));
    const remainingIndex = headers.findIndex((th) => norm(th.innerText || th.textContent || '').includes('REMANESCENTE'));
    const cells = Array.from(document.querySelectorAll('tbody td'));
    const osCell = cells.find((td) => normOs(td.textContent) === normOs(wantedOs));
    if (!osCell) return { found: false };

    const row = osCell.closest('tr');
    const rowCells = row ? Array.from(row.children) : [];
    const remainingText = remainingIndex >= 0 && rowCells[remainingIndex]
      ? rowCells[remainingIndex].textContent.trim()
      : '';

    return {
      found: true,
      remainingText,
      rowText: row ? row.innerText : '',
    };
  }, String(osNumber));
}

async function getFinalizeToolbarState(page) {
  return page.evaluate(() => {
    function compact(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    }

    const toolbarButtons = Array.from(document.querySelectorAll('button'))
      .map((button, domIndex) => {
        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.top < 35 || rect.top > 165 || rect.left < 35 || rect.left > 1050) return null;
        const icon = button.querySelector('lord-icon');
        let parent = button.parentElement;
        const ancestry = [];
        for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
          ancestry.push(compact(`${parent.className || ''} ${parent.getAttribute('data-action') || ''}`));
        }
        return {
          domIndex,
          text: compact(button.innerText || button.textContent || ''),
          title: button.getAttribute('title') || '',
          ariaLabel: button.getAttribute('aria-label') || '',
          className: compact(button.className || ''),
          lordIcon: icon ? icon.getAttribute('src') || '' : '',
          ancestry: ancestry.join(' | '),
          disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('v-btn--disabled')),
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);

    let finalize = toolbarButtons.find((item) =>
      /FINALIZAR|FINALIZE/i.test(`${item.text} ${item.title} ${item.ariaLabel} ${item.ancestry}`)
    ) || null;

    let method = finalize ? 'atributo' : '';

    if (!finalize) {
      const historyPosition = toolbarButtons.findIndex((item) =>
        /141-history-outline\.json/i.test(item.lordIcon)
      );

      // Na versão atual, a ação imediatamente anterior ao Histórico abre a
      // finalização; duas posições antes passou a ser Relatórios de Cargas.
      if (historyPosition >= 1) {
        finalize = toolbarButtons[historyPosition - 1];
        method = 'estrutura-antes-historico';
      }
    }

    return {
      finalize,
      method,
      toolbarButtons,
    };
  });
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

    if (!control) return { ok: false, reason: 'controle-visivel-nao-encontrado' };

    const rect = control.getBoundingClientRect();
    const input = row.querySelector('input[type="checkbox"]');
    return {
      ok: true,
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2),
      method: control.className || control.tagName,
      checkedBefore: Boolean(input && input.checked),
    };
  }, String(osNumber));

  if (!target || !target.ok) {
    throw new Error(`Checkbox da O.S. ${osNumber} não encontrado (${target && target.reason ? target.reason : 'motivo desconhecido'}).`);
  }

  if (!target.checkedBefore) {
    // Clique físico do Puppeteer: gera eventos de mouse reais e atualiza o estado
    // interno do Vuetify/Vue. element.click() alterava o input, mas não habilitava
    // as ações da barra no GRM.
    await page.mouse.click(target.x, target.y);
    await wait(700);
  }

  const selection = await page.evaluate((wantedOs) => {
    function normOs(value) {
      const text = String(value || '').trim().replace(/\.0+$/, '');
      const digits = text.replace(/[^0-9]/g, '');
      return digits || text;
    }

    const osCell = Array.from(document.querySelectorAll('tbody td'))
      .find((td) => normOs(td.textContent) === normOs(wantedOs));
    const row = osCell && osCell.closest('tr');
    if (!row) return { checked: false, reason: 'linha-sumiu' };

    const input = row.querySelector('input[type="checkbox"]');
    const control = row.querySelector('[role="checkbox"], .v-selection-control');
    const ariaChecked = control ? control.getAttribute('aria-checked') : null;
    return {
      checked: Boolean((input && input.checked) || ariaChecked === 'true'),
      inputChecked: Boolean(input && input.checked),
      ariaChecked,
      rowClass: row.className || '',
    };
  }, String(osNumber));

  if (!selection.checked) {
    throw new Error(`A O.S. ${osNumber} recebeu o clique, mas o GRM não manteve a seleção.`);
  }

  let toolbarState = null;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    toolbarState = await getFinalizeToolbarState(page);
    if (toolbarState && toolbarState.finalize && !toolbarState.finalize.disabled) break;
    await wait(350);
  }

  if (!toolbarState || !toolbarState.finalize) {
    throw new Error(`O.S. ${osNumber} selecionada, mas a ação Finalizar OS não foi identificada na barra.`);
  }

  if (toolbarState.finalize.disabled) {
    log('ERROR', `Barra após seleção: ${JSON.stringify(toolbarState.toolbarButtons)}`);
    throw new Error(`O.S. ${osNumber} marcada no checkbox, mas o GRM manteve a ação Finalizar OS desabilitada.`);
  }

  log(
    'INFO',
    `O.S. ${osNumber} selecionada por clique físico; ação Finalizar OS habilitada ` +
    `(${toolbarState.method}; botão DOM ${toolbarState.finalize.domIndex}).`
  );
}

async function openFinalizeModal(page, osNumber) {
  log('INFO', `O.S. ${osNumber}: procurando a ação "Finalizar OS".`);

  const modalIsOpen = async () => page.evaluate((wantedOs) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }

    const dialogs = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]'));
    return dialogs.some((dialog) => {
      const text = norm(dialog.innerText || dialog.textContent || '');
      return text.includes('FINALIZAR OS') && (!wantedOs || text.includes(String(wantedOs)) || text.includes('FINALIZAR ORDEM DE SERVICO'));
    });
  }, String(osNumber));

  const toolbarState = await getFinalizeToolbarState(page);
  if (!toolbarState || !toolbarState.finalize) {
    throw new Error('A ação Finalizar OS não foi identificada na barra após a seleção.');
  }

  if (toolbarState.finalize.disabled) {
    log('ERROR', `Barra antes da finalização: ${JSON.stringify(toolbarState.toolbarButtons)}`);
    throw new Error('A ação Finalizar OS está desabilitada. A seleção da linha não foi reconhecida pelo GRM.');
  }

  const finalize = toolbarState.finalize;
  const clickX = finalize.x + (finalize.width / 2);
  const clickY = finalize.y + (finalize.height / 2);

  // Clique físico no botão estruturalmente identificado: duas posições antes
  // do histórico. Isso evita tooltips atrasados do Vuetify apontando para o
  // botão anteriormente percorrido.
  await page.mouse.move(clickX, clickY);
  await wait(250);
  await page.mouse.click(clickX, clickY);
  log(
    'INFO',
    `Ação de finalização acionada por ${toolbarState.method} ` +
    `(botão DOM ${finalize.domIndex}, x=${Math.round(clickX)}, y=${Math.round(clickY)}).`
  );

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (await modalIsOpen()) {
      log('SUCCESS', `Modal de finalização da O.S. ${osNumber} aberto.`);
      return;
    }
    await wait(250);
  }

  const diagnostic = await page.evaluate(() => {
    function compact(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    }

    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]'))
      .map((overlay) => ({
        text: compact(overlay.innerText || overlay.textContent || ''),
        className: compact(overlay.className || ''),
      }))
      .filter((item) => item.text || item.className);

    return { overlays, url: location.href };
  });

  log('ERROR', `Estado da barra usado: ${JSON.stringify(toolbarState)}`);
  if (diagnostic.overlays.length) log('ERROR', `Overlays ativos: ${JSON.stringify(diagnostic.overlays)}`);
  throw new Error(`Modal "Finalizar OS" não abriu após o clique físico no botão estrutural (${toolbarState.method}).`);
}

async function getFinalizeModalDiagnostic(page) {
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
    const modal = roots.find((root) => {
      const value = norm(root.innerText || root.textContent || '');
      return value.includes('FINALIZAR OS') || value.includes('FINALIZAR ORDEM DE SERVICO');
    });

    if (!modal) return { modalEncontrado: false, overlays: roots.length };

    return {
      modalEncontrado: true,
      texto: String(modal.innerText || modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      botoes: Array.from(modal.querySelectorAll('button')).map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          texto: String(button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
          disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
          visivel: Boolean(rect.width && rect.height),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        };
      }),
    };
  });
}

async function clickModalButton(page, text, timeoutMs = 20000) {
  let handle = null;
  try {
    handle = await page.waitForFunction((wantedText) => {
      function norm(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
      }

      const wanted = norm(wantedText);
      const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
      const modal = roots.find((root) => {
        const value = norm(root.innerText || root.textContent || '');
        return value.includes('FINALIZAR OS') || value.includes('FINALIZAR ORDEM DE SERVICO');
      });
      if (!modal) return false;

      const button = Array.from(modal.querySelectorAll('button')).find((item) => {
        const buttonText = norm(item.innerText || item.textContent || '');
        const rect = item.getBoundingClientRect();
        const enabled = !item.disabled && item.getAttribute('aria-disabled') !== 'true';
        return enabled && rect.width > 0 && rect.height > 0 &&
          (buttonText === wanted || buttonText.endsWith(` ${wanted}`));
      });

      return button || false;
    }, { timeout: timeoutMs, polling: 250 }, text);

    const element = handle.asElement();
    if (!element) throw new Error(`Botão "${text}" foi localizado, mas não pôde ser convertido em elemento clicável.`);

    await element.evaluate((button) => button.scrollIntoView({ block: 'center', inline: 'center' }));
    await wait(250);
    await element.click({ delay: 120 });
    await wait(400);
  } catch (error) {
    const diagnostic = await getFinalizeModalDiagnostic(page).catch(() => null);
    if (diagnostic) log('ERROR', `Diagnóstico do modal: ${JSON.stringify(diagnostic)}`);
    if (String(error.message || error).includes('Waiting failed')) {
      throw new Error(`Botão "${text}" não ficou disponível no modal em ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (handle) await handle.dispose().catch(() => {});
  }
}

async function acknowledgeFinalizeWarnings(page) {
  const state = await page.evaluate(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }

    const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
    const modal = roots.find((root) => {
      const value = norm(root.innerText || root.textContent || '');
      return value.includes('FINALIZAR OS') || value.includes('FINALIZAR ORDEM DE SERVICO');
    });
    if (!modal) return { found: false, reason: 'modal_ausente' };

    const controls = Array.from(modal.querySelectorAll(
      'label, .v-checkbox, .v-selection-control, [role="checkbox"], input[type="checkbox"]'
    ));
    const warning = controls.find((control) =>
      norm(control.innerText || control.textContent || control.getAttribute('aria-label') || '')
        .includes('ESTOU CIENTE DOS ALERTAS ACIMA')
    );
    if (!warning) return { found: false, reason: 'confirmacao_ausente' };

    const container = warning.closest('label, .v-checkbox, .v-selection-control') || warning;
    const input = container.matches('input[type="checkbox"]')
      ? container
      : container.querySelector('input[type="checkbox"]');
    const roleCheckbox = container.matches('[role="checkbox"]')
      ? container
      : container.querySelector('[role="checkbox"]');
    const checked = Boolean(
      input?.checked ||
      roleCheckbox?.getAttribute('aria-checked') === 'true' ||
      container.classList.contains('v-selection-control--dirty')
    );
    if (checked) return { found: true, checked: true, changed: false };

    const target = input || roleCheckbox || container;
    target.click();
    return { found: true, checked: false, changed: true };
  });

  if (!state.found) {
    log('INFO', `Modal sem confirmação adicional de alertas (${state.reason}); seguindo o fluxo normal.`);
    return false;
  }

  if (state.changed) {
    log('INFO', 'Confirmação "Estou ciente dos alertas acima!" marcada no modal.');
    await wait(500);
  }
  return true;
}

async function closeFinalizeModal(page) {
  try {
    await clickModalButton(page, 'CANCELAR', 5000);
    await wait(500);
  } catch (error) {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

async function waitFinalizeModalClosed(page, osNumber, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      function norm(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
      }

      const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
      const modal = roots.find((root) => {
        const value = norm(root.innerText || root.textContent || '');
        return value.includes('FINALIZAR OS') || value.includes('FINALIZAR ORDEM DE SERVICO');
      });
      if (!modal) return { fechado: true };

      const texto = norm(modal.innerText || modal.textContent || '');
      const erroVisivel = ['ERRO', 'NAO FOI POSSIVEL', 'OBRIGATORIO', 'FALHA'].find((token) => texto.includes(token));
      return {
        fechado: false,
        erroVisivel: erroVisivel || null,
        texto: String(modal.innerText || modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      };
    });

    if (state.fechado) return;
    if (state.erroVisivel) {
      throw new Error(`O GRM exibiu uma falha no modal após confirmar a O.S. ${osNumber}: ${state.texto}`);
    }
    await wait(500);
  }

  const diagnostic = await getFinalizeModalDiagnostic(page).catch(() => null);
  if (diagnostic) log('ERROR', `Modal ainda aberto após confirmar a O.S. ${osNumber}: ${JSON.stringify(diagnostic)}`);
  throw new Error(`O modal não fechou em ${timeoutMs}ms após confirmar a O.S. ${osNumber}.`);
}

async function verifyOsNoLongerOpen(page, osNumber) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await wait(attempt === 1 ? 1800 : 2500);
    const result = await searchOs(page, osNumber);
    if (!result.found) return true;
    log('WARN', `O.S. ${osNumber} ainda aparece na lista de abertas após a finalização (verificação ${attempt}/3).`);
  }
  return false;
}

async function createExecution(config) {
  if (!auditEnabled) return null;
  const { data, error } = await supabase
    .from(TABLE_EXECUCOES)
    .insert({
      status: 'INICIADO',
      remanescente_min: config.min,
      remanescente_max: config.max,
      limite_execucao: config.limit,
      dry_run: config.dryRun,
    })
    .select('id')
    .single();

  if (error) {
    auditEnabled = false;
    log('WARN', `Auditoria desativada nesta execução: ${error.message}. Aplique o SQL incluído para habilitar as tabelas de histórico.`);
    return null;
  }
  return data && data.id;
}

async function finishExecution(executionId, patch) {
  if (!auditEnabled || !executionId) return;
  const { error } = await supabase
    .from(TABLE_EXECUCOES)
    .update({ ...patch, finalizado_em: new Date().toISOString() })
    .eq('id', executionId);
  if (error) log('WARN', `Falha ao finalizar auditoria da execução: ${error.message}`);
}

async function saveResult(executionId, candidate, patch) {
  if (!auditEnabled || !executionId) return;
  const payload = {
    execucao_id: executionId,
    os: candidate.os,
    remanescente_exportado: candidate.remanescenteExportado,
    remanescente_tela: candidate.remanescenteTela == null ? null : candidate.remanescenteTela,
    status: patch.status,
    erro: patch.erro || null,
    detalhes: {
      ...(patch.detalhes || {}),
      criterio_finalizacao: candidate.criterion || null,
      servico_grm: candidate.servico || null,
      ultima_movimentacao_cargas: candidate.ultimaMovimentacao || null,
      dias_sem_movimento: candidate.diasSemMovimento ?? null,
      total_cargas_relatorio: candidate.totalCargasRelatorio ?? null,
    },
  };
  const { error } = await supabase.from(TABLE_RESULTADOS).insert(payload);
  if (error) log('WARN', `Falha ao gravar auditoria da O.S. ${candidate.os}: ${error.message}`);
}

async function processCandidate(page, candidate, config) {
  const current = await searchOs(page, candidate.os);
  if (!current.found) {
    return { status: 'IGNORADA_NAO_ENCONTRADA', erro: 'A O.S. não aparece mais na lista de abertas/não faturadas.' };
  }

  const remainingOnScreen = parseNumberLoose(current.remainingText);
  candidate.remanescenteTela = remainingOnScreen;

  if (!Number.isFinite(remainingOnScreen)) {
    throw new Error(`Não foi possível ler o Remanescente da O.S. ${candidate.os} na grade (valor: "${current.remainingText}").`);
  }

  const eligibility = await revalidateCandidateEligibility(candidate, remainingOnScreen, config.daysNoMovement);
  if (!eligibility.eligible) {
    return {
      status: 'IGNORADA_CRITERIO_NAO_ATENDIDO',
      erro: `${eligibility.reason} Remanescente atual: ${formatBrNumber(remainingOnScreen)}.`,
      detalhes: eligibility,
    };
  }

  log('INFO', `O.S. ${candidate.os} elegível por ${eligibility.criterion}: ${eligibility.reason}`);

  await selectOsRow(page, candidate.os);
  await openFinalizeModal(page, candidate.os);

  if (config.debug) await screenshot(page, `os-${candidate.os}-modal-finalizar.png`);

  // O GRM exige ciência explícita quando a O.S. possui alertas. Sem marcar essa
  // opção, o botão FINALIZAR permanece desabilitado indefinidamente.
  await acknowledgeFinalizeWarnings(page);

  if (config.dryRun) {
    await closeFinalizeModal(page);
    return { status: 'DRY_RUN_OK' };
  }

  // Algumas O.S. carregam os dados do modal de forma assíncrona. Aguarda o botão
  // ficar realmente visível e habilitado antes de confirmar.
  log('INFO', `O.S. ${candidate.os}: modal aberto; aguardando o botão FINALIZAR ficar habilitado (até 30s).`);
  await clickModalButton(page, 'FINALIZAR', 30000);
  log('INFO', `O.S. ${candidate.os}: botão FINALIZAR acionado; aguardando confirmação do GRM.`);
  await waitFinalizeModalClosed(page, candidate.os, 60000);

  const disappeared = await verifyOsNoLongerOpen(page, candidate.os);
  if (!disappeared) {
    throw new Error('A confirmação foi acionada, mas a O.S. continuou aparecendo na lista de abertas após 3 verificações.');
  }

  return { status: 'SUCESSO' };
}

async function main() {
  assertConfig();
  const args = parseArgs(process.argv.slice(2));
  const config = {
    min: 0,
    max: 0,
    daysNoMovement: ENV_DIAS_SEM_MOVIMENTO,
    limit: Number.isFinite(args.limit) && args.limit > 0 ? args.limit : ENV_LIMIT,
    dryRun: args.dryRun == null ? ENV_DRY_RUN : args.dryRun,
    debug: args.debug || ENV_DEBUG,
    onlyOs: args.os ? normOs(args.os) : null,
  };

  const stats = {
    exportadas: 0,
    candidatas: 0,
    limitadas: 0,
    processadas: 0,
    sucesso: 0,
    dryRun: 0,
    ignoradas: 0,
    erro: 0,
  };

  let executionId = null;
  let browser = null;

  try {
    const businessRange = businessDateRange();
    log('INFO', `=== Finalização de OS | manual: somente após Check da Logística | automática: Remanescente 0,00 OU mais de ${config.daysNoMovement} dias sem lançamento, inclusive FOB ZERO | solicitações manuais pendentes bloqueadas | clientes excluídos: ${ENV_CLIENTES_EXCLUIDOS.join(', ') || 'nenhum'} | data ${businessRange.date} (${BUSINESS_TIMEZONE}) | limite ${config.limit}${config.dryRun ? ' | DRY-RUN' : ''} ===`);
    executionId = await createExecution(config);

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
    await openServiceOrderPage(page);

    const rows = await downloadServiceOrderList(page);
    stats.exportadas = rows.length;

    const openCandidates = extractOpenCandidates(rows, config.onlyOs);
    const gestorState = await loadGestorFinalizationState(config.onlyOs);
    const combined = buildFinalizationCandidates(rows, openCandidates, gestorState, config.onlyOs);
    const movementResult = await loadLastMovements(
      combined.filter((candidate) => candidate.origem === 'AUTOMATICO_NAO_MARCADA').map((candidate) => candidate.os),
    );
    const eligibility = filterEligibleCandidates(combined, movementResult, config.daysNoMovement);
    let candidates = eligibility.eligible;
    stats.candidatas = candidates.length;

    const byApproved = candidates.filter((candidate) => candidate.criterion === 'APROVADA_LOGISTICA').length;
    const byZero = candidates.filter((candidate) => candidate.criterion === 'REMANESCENTE_ZERO').length;
    const byNoMovement = candidates.filter((candidate) => candidate.criterion === 'SEM_MOVIMENTO_5_DIAS').length;
    const byExcludedClient = eligibility.rejected.filter((candidate) => candidate.criterion === 'CLIENTE_EXCLUIDO').length;
    const otherRejected = Math.max(0, eligibility.rejected.length - byExcludedClient);
    log('INFO', `${byApproved} aprovada(s) pela Logística; ${byZero} automática(s) com Remanescente 0,00; ${byNoMovement} automática(s) com mais de ${config.daysNoMovement} dias sem lançamento; ${byExcludedClient} cliente(s) excluído(s); ${gestorState.pending.length} solicitação(ões) manuais aguardando decisão; ${otherRejected} outra(s) rejeitada(s).`);

    if (config.onlyOs && !candidates.length) {
      const rejected = eligibility.rejected.find((candidate) => candidate.os === config.onlyOs);
      const pendingManual = gestorState.pending.some((row) => normOs(row.numero_os) === config.onlyOs);
      log('WARN', `A O.S. ${config.onlyOs} não será finalizada: ${pendingManual ? 'aguarda Check da Logística.' : rejected?.reason || 'não está aberta/não faturada ou não atende às regras.'}`);
    }

    const targetFinalizacoes = Math.max(1, config.limit);
    log(
      'SUCCESS',
      `${stats.candidatas} O.S. elegível(is); o agente examinará uma por vez até concluir ${targetFinalizacoes} finalização(ões) nesta execução.`,
    );

    let finalizacoesConcluidas = 0;

    for (
      let index = 0;
      index < candidates.length && finalizacoesConcluidas < targetFinalizacoes;
      index += 1
    ) {
      const candidate = candidates[index];
      stats.processadas += 1;

      try {
        log('INFO', `[${index + 1}/${candidates.length}] O.S. ${candidate.os} | serviço ${candidate.servico || 'não identificado'} | cliente ${candidate.cliente || 'não identificado'} | origem ${candidate.origem || 'AUTOMATICO_NAO_MARCADA'} | critério ${candidate.criterion} | remanescente XLS ${formatBrNumber(candidate.remanescenteExportado)}${candidate.ultimaMovimentacao ? ` | último movimento ${candidate.ultimaMovimentacao}` : ''}.`);
        const result = await processCandidate(page, candidate, config);

        if (result.status === 'SUCESSO') {
          stats.sucesso += 1;
          finalizacoesConcluidas += 1;
          await registerAutomaticFinalization(candidate);
          log('SUCCESS', `O.S. ${candidate.os} finalizada e removida da lista de abertas.`);
        } else if (result.status === 'DRY_RUN_OK') {
          stats.dryRun += 1;
          finalizacoesConcluidas += 1;
          log('SUCCESS', `O.S. ${candidate.os} validada em dry-run; nenhuma alteração foi gravada.`);
        } else {
          stats.ignoradas += 1;
          if (candidate.operacionalOsId && result.status === 'IGNORADA_NAO_ENCONTRADA') {
            await updateGestorQueue(candidate, 'NAO_ENCONTRADA_AUTOMATICO', result.erro || result.status);
          }
          log('WARN', `O.S. ${candidate.os} ignorada: ${result.erro || result.status}.`);
        }

        await saveResult(executionId, candidate, result);
      } catch (error) {
        const message = String(error.message || error);
        const acaoDesabilitada = /ação Finalizar OS desabilitada|manteve a ação Finalizar OS desabilitada/i.test(message);

        if (acaoDesabilitada) {
          stats.ignoradas += 1;
          if (candidate.operacionalOsId) {
            await updateGestorQueue(candidate, 'BLOQUEADA_AUTOMATICO', message);
          }
          log('WARN', `O.S. ${candidate.os} ignorada porque o próprio GRM manteve a finalização desabilitada.`);
          await saveResult(executionId, candidate, {
            status: 'IGNORADA_ACAO_DESABILITADA',
            erro: message.slice(0, 3000),
          });
        } else {
          stats.erro += 1;
          log('ERROR', `O.S. ${candidate.os}: ${message}`);
          // Em falhas do modal, o screenshot é importante mesmo com DEBUG=false.
          await screenshot(page, `erro-os-${candidate.os}.png`).catch(() => {});
          await saveResult(executionId, candidate, { status: 'ERRO', erro: message.slice(0, 3000) });
        }

        try {
          await closeFinalizeModal(page);
          await openServiceOrderPage(page);
        } catch (recoveryError) {
          log('WARN', `Falha na recuperação da tela após erro da O.S. ${candidate.os}: ${recoveryError.message}`);
        }

        // Ação desabilitada pelo GRM é uma recusa segura: segue para a próxima O.S.
        // Erro técnico pode deixar o estado da tela incerto; encerra sem tentar finalizar outra.
        if (!acaoDesabilitada) break;
      }
    }

    stats.limitadas = Math.max(0, stats.candidatas - stats.processadas);

    await finishExecution(executionId, {
      status: stats.erro > 0 ? 'CONCLUIDO_COM_ERROS' : 'SUCESSO',
      total_exportadas: stats.exportadas,
      total_candidatas: stats.candidatas,
      total_processadas: stats.processadas,
      total_sucesso: stats.sucesso,
      total_dry_run: stats.dryRun,
      total_ignoradas: stats.ignoradas,
      total_erros: stats.erro,
      detalhes: {
        limitadas_para_proxima_execucao: stats.limitadas,
        regra: `Clientes excluídos (${ENV_CLIENTES_EXCLUIDOS.join(', ') || 'nenhum'}): sempre bloqueiam; solicitação do gestor: exige Check da Logística; automática: Remanescente 0,00 OU mais de ${config.daysNoMovement} dias sem lançamento no Relatório de Cargas, independentemente do Serviço (inclusive FOB ZERO)`,
        clientes_excluidos: ENV_CLIENTES_EXCLUIDOS,
        data_registro_processada: businessDateRange().date,
        solicitacoes_manuais_pendentes: gestorState.pending.length,
      },
    });

    if (!config.dryRun && stats.erro === 0 && stats.sucesso > 0) {
      await enqueueNextGestorJobIfNeeded(stats.limitadas);
    }

    log(stats.erro > 0 ? 'ERROR' : 'SUCCESS', `Concluído: ${JSON.stringify(stats)}`);

    // O worker usa o código de saída para definir o status do job. Não pode
    // registrar "sucesso" quando houve falhas técnicas nas O.S. processadas.
    if (stats.erro > 0) process.exitCode = 1;
  } catch (error) {
    const message = String(error.stack || error.message || error);
    log('ERROR', message);
    await finishExecution(executionId, { status: 'ERRO', erro: message.slice(0, 4000) }).catch(() => {});
    throw error;
  } finally {
    browserAtual = null;
    if (browser) await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch(() => process.exit(1));

  setTimeout(() => {
    log('ERROR', `Timeout geral de ${ENV_TIMEOUT_MS}ms atingido.`);
    if (browserAtual) browserAtual.close().catch(() => {});
    process.exit(1);
  }, ENV_TIMEOUT_MS).unref();
}

module.exports = {
  normText,
  normOs,
  parseNumberLoose,
  extractOpenCandidates,
  businessDateRange,
  isRegisteredToday,
  evaluateEligibility,
  buildFinalizationCandidates,
  isOpenStatus,
  isNotInvoiced,
};
