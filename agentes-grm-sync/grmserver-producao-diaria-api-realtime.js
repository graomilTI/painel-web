#!/usr/bin/env node

/**
 * Sincroniza Produção Diária diretamente pela API do GRM (upsert por período
 * em producao_snapshot), substituindo o fluxo Puppeteer (grm-sync-producao-
 * diaria.js) por chamadas HTTP diretas — mesmo padrão de
 * grmserver-colaboradores-api-realtime.js / grmserver-lista-os-api-realtime.js.
 *
 * grm-sync-producao-diaria.js já buscava os dados via fetch dentro da página
 * (fetchReportData), não pelo XLS — só o login (Puppeteer completo) era o
 * gargalo. Aqui o login também vira POST direto em user/login, então o
 * processo inteiro roda sem abrir navegador e pode ficar de pé como serviço
 * com polling curto, em vez de rodar 1x a cada N minutos na esteira.
 *
 * Escopo do polling rápido é só uma janela recente (hoje/ontem por padrão,
 * ver GRM_PRODUCAO_DIARIA_DAYS_BACK) para manter a consulta e a promoção de
 * staging leves; grm_promover_staging_periodo() só substitui as datas
 * presentes na staging, preservando o histórico fora da janela.
 *
 * Além do polling rápido, o processo faz uma sincronização completa (mesma
 * janela de 30 dias do agente Puppeteer antigo) a cada
 * GRM_PRODUCAO_DIARIA_FULL_SYNC_MS (padrão 30min). Sem isso, o "Meta Mensal"
 * do dashboard do Gestor (assets/js/dashboard.js, soma producao_snapshot do
 * mês inteiro) ficaria com os dias fora da janela rápida presos no valor que
 * tinham quando o agente antigo foi pausado — nenhuma correção retroativa do
 * GRM para um dia já fechado chegaria ao painel. A janela cheia roda logo no
 * boot (lastFullSyncAt=0) para garantir cobertura do mês já na primeira
 * execução, mesmo após reiniciar o serviço.
 *
 * O endpoint dailyProductionReport passou a rejeitar intervalos longos
 * (erro `invalidDateRangeDaysExtendedDays` num teste real em produção,
 * 01/09, pedindo 30 dias de uma vez). Por isso qualquer janela — rápida ou
 * completa — é sempre dividida em sub-consultas de no máximo
 * GRM_PRODUCAO_DIARIA_CHUNK_DAYS dias (padrão 7) e concatenada antes de
 * promover; ver fetchProducaoDiariaEmJanelas().
 */

const dotenvResult = require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Alguns servidores legados mantêm `.env` com espaços ao redor do `=`. A
// versão antiga de dotenv instalada no cPanel não normaliza todas essas linhas.
// Reaproveita somente os pares já parseados e corrige o nome da variável, sem
// imprimir ou persistir os valores.
for (const [rawKey, value] of Object.entries(dotenvResult.parsed || {})) {
  const key = rawKey.trim();
  if (key && !process.env[key]) process.env[key] = value;
}

// Fallback para dotenv legado: aceita `CHAVE = valor`, preservando o valor
// integral e removendo apenas aspas externas.
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch {
  // requiredEnv produzirá uma mensagem objetiva se o arquivo não existir.
}

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { replaceTablePeriodSafely } = require('./safe-table-load');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const POLL_INTERVAL_MS = Math.max(15000, Number(process.env.GRM_PRODUCAO_DIARIA_POLL_MS || 60000));
const DAYS_BACK = Math.max(1, Number(process.env.GRM_PRODUCAO_DIARIA_DAYS_BACK || 2));
const MIN_ROWS = Math.max(1, Number(process.env.GRM_PRODUCAO_DIARIA_MIN_ROWS || 20));
const FULL_SYNC_INTERVAL_MS = Math.max(300000, Number(process.env.GRM_PRODUCAO_DIARIA_FULL_SYNC_MS || 1800000));
const FULL_SYNC_DAYS_BACK = Math.max(DAYS_BACK, Number(process.env.GRM_PRODUCAO_DIARIA_FULL_SYNC_DAYS_BACK || 30));
const FULL_SYNC_MIN_ROWS = Math.max(MIN_ROWS, Number(process.env.GRM_PRODUCAO_DIARIA_FULL_SYNC_MIN_ROWS || 1000));
const CHUNK_DAYS = Math.max(1, Number(process.env.GRM_PRODUCAO_DIARIA_CHUNK_DAYS || 7));
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
};

function requiredEnv(name, alternatives = []) {
  for (const key of [name, ...alternatives]) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(`Variável obrigatória ausente: ${[name, ...alternatives].join(' ou ')}`);
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
      timeout: 60000,
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
          const error = new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`);
          error.statusCode = response.statusCode;
          reject(error);
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

function postJson(url, body, headers = {}) {
  return requestJson(url, 'POST', body, headers);
}

function formatDateBr(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
  return { from: formatDateBr(pastDate), to: formatDateBr(today), fromDate: pastDate, toDate: today };
}

// Quebra [fromDate, toDate] em sub-janelas de no máximo chunkDays dias cada
// (a API do GRM passou a rejeitar intervalos longos numa consulta só).
function splitIntoChunks(fromDate, toDate, chunkDays) {
  const chunks = [];
  let cursor = new Date(fromDate);
  const fimTotal = new Date(toDate);
  while (cursor <= fimTotal) {
    const fimJanela = new Date(cursor.getTime() + (chunkDays - 1) * 24 * 60 * 60 * 1000);
    if (fimJanela > fimTotal) fimJanela.setTime(fimTotal.getTime());
    chunks.push({ from: new Date(cursor), to: fimJanela });
    cursor = new Date(fimJanela.getTime() + 24 * 60 * 60 * 1000);
  }
  return chunks;
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? s.slice(0, 10) : null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const s = String(value).trim().replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return null;

  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  let normalized = s;

  if (comma >= 0 && dot >= 0) {
    // O separador que aparece por último é o decimal (pt-BR ou en-US).
    normalized = comma > dot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = s.replace(',', '.');
  }
  // Só ponto: a API do GRM já retorna Tons assim (ex.: "147.06").

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function staffTypeLabel(value) {
  if (value === 'D') return 'Diarista';
  if (value === 'I') return 'Intermitente';
  return 'Efetivo';
}

function mapProducaoSnapshotRow(row) {
  const data = normalizeDate(row.loaDate);
  return {
    data_referencia: data,
    data,
    coordenacao: normalizeText(row.olcName),
    supervisao: normalizeText(row.olsName),
    funcionario: normalizeText(row.staName),
    tipo: staffTypeLabel(row.staType),
    os: normalizeText(row.sorCode),
    cliente: normalizeText(row.cliName),
    servico: normalizeText(row.serName),
    cidade: normalizeText(row.citName),
    local_embarque: normalizeText(row.splName),
    checkin: normalizeText(row.initHour),
    checkout: normalizeText(row.endHour),
    cargas: normalizeNumber(row.countLoads),
    tons: normalizeNumber(row.tons),
  };
}

async function login() {
  const userEmail = requiredEnv('GRMSERVER_USER');
  const userPass = requiredEnv('GRMSERVER_PASSWORD');
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

async function fetchProducaoDiaria(token, dateRange) {
  const response = await postJson(
    `${GRM_BASE_URL}reports/classification/staff/dailyProductionReport`,
    { loaDateFrom: dateRange.from, loaDateTo: dateRange.to, orderBy: 'SDO' },
    { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` },
  );
  if (!response.result) {
    const error = new Error(`Consulta de Produção Diária recusada: ${response.message || 'erro GRM'}`);
    error.requiresLogin = Boolean(response.logoutUser);
    throw error;
  }
  if (!Array.isArray(response.searchData)) throw new Error('Resposta do GRM não contém searchData.');
  return response.searchData;
}

// Busca uma sub-janela com retry de login em caso de 401/logoutUser, devolvendo
// o token (possivelmente renovado) para as próximas sub-janelas reaproveitarem.
async function fetchComRelogin(token, dateRange) {
  try {
    return { rows: await fetchProducaoDiaria(token, dateRange), token };
  } catch (error) {
    if (!error.requiresLogin && error.statusCode !== 401) throw error;
    const novoToken = await login();
    return { rows: await fetchProducaoDiaria(novoToken, dateRange), token: novoToken };
  }
}

async function fetchProducaoDiariaEmJanelas(token, fromDate, toDate) {
  const janelas = splitIntoChunks(fromDate, toDate, CHUNK_DAYS);
  let tokenAtual = token;
  const rows = [];
  for (const janela of janelas) {
    const dateRange = { from: formatDateBr(janela.from), to: formatDateBr(janela.to) };
    const resultado = await fetchComRelogin(tokenAtual, dateRange);
    tokenAtual = resultado.token;
    rows.push(...resultado.rows);
  }
  return { rows, token: tokenAtual };
}

async function applyCycle(supabase, rawRows, minRows) {
  const mapped = rawRows
    .map(mapProducaoSnapshotRow)
    .filter((row) => row.os && row.data && row.servico !== 'Total');

  if (!mapped.length) {
    logger.warn('Nenhuma linha válida na janela consultada; ciclo ignorado.');
    return { skipped: true, remote: rawRows.length };
  }

  await replaceTablePeriodSafely(supabase, 'producao_snapshot', mapped, {
    dateColumn: 'data',
    minRows: minRows == null ? MIN_ROWS : minRows,
    chunkSize: 500,
    logger: console,
  });

  return { remote: rawRows.length, promoted: mapped.length };
}

async function main() {
  const supabase = createClient(
    requiredEnv('SUPABASE_URL', ['SB_URL']),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY', 'SB_SERVICE_KEY', 'SUPABASE_KEY']),
  );
  let token = await login();
  logger.info(`Agente iniciado; intervalo ${POLL_INTERVAL_MS} ms, janela rápida ${DAYS_BACK} dia(s), sync completa a cada ${FULL_SYNC_INTERVAL_MS} ms (janela ${FULL_SYNC_DAYS_BACK} dia(s)), sub-consultas de até ${CHUNK_DAYS} dia(s).`);

  // 0 força uma sync completa já no primeiro ciclo (cobertura do mês logo após
  // o boot/restart do serviço, sem esperar o intervalo cheio).
  let lastFullSyncAt = 0;

  while (true) {
    const startedAt = Date.now();
    try {
      const isFullSync = (startedAt - lastFullSyncAt) >= FULL_SYNC_INTERVAL_MS;
      const daysBack = isFullSync ? FULL_SYNC_DAYS_BACK : DAYS_BACK;
      const minRows = isFullSync ? FULL_SYNC_MIN_ROWS : MIN_ROWS;
      const dateRange = calculateDateRange(daysBack);
      const busca = await fetchProducaoDiariaEmJanelas(token, dateRange.fromDate, dateRange.toDate);
      token = busca.token;
      const result = await applyCycle(supabase, busca.rows, minRows);
      if (!result.skipped) {
        logger.info(`producao_snapshot: ${result.promoted} linha(s) promovida(s) (janela ${dateRange.from} a ${dateRange.to}${isFullSync ? ', sync completa' : ''}, ${result.remote} recebida(s) do GRM).`);
        if (isFullSync) lastFullSyncAt = startedAt;
      }
    } catch (error) {
      logger.error(error.stack || error.message);
    }
    const remaining = Math.max(2000, POLL_INTERVAL_MS - (Date.now() - startedAt));
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { mapProducaoSnapshotRow, applyCycle, calculateDateRange };
