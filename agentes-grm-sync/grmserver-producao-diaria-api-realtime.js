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
 * Escopo do polling é só uma janela recente (hoje/ontem por padrão, ver
 * GRM_PRODUCAO_DIARIA_DAYS_BACK) para manter a consulta e a promoção de
 * staging leves; grm_promover_staging_periodo() só substitui as datas
 * presentes na staging, preservando o histórico fora da janela. Sincronização
 * completa (30 dias) continua sendo responsabilidade do agente antigo, que
 * fica no disco para rollback (ver agentes-grm-sync/README.md).
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
  return { from: formatDateBr(pastDate), to: formatDateBr(today) };
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

async function applyCycle(supabase, rawRows) {
  const mapped = rawRows
    .map(mapProducaoSnapshotRow)
    .filter((row) => row.os && row.data && row.servico !== 'Total');

  if (!mapped.length) {
    logger.warn('Nenhuma linha válida na janela consultada; ciclo ignorado.');
    return { skipped: true, remote: rawRows.length };
  }

  await replaceTablePeriodSafely(supabase, 'producao_snapshot', mapped, {
    dateColumn: 'data',
    minRows: MIN_ROWS,
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
  logger.info(`Agente iniciado; intervalo ${POLL_INTERVAL_MS} ms, janela ${DAYS_BACK} dia(s).`);

  while (true) {
    const startedAt = Date.now();
    try {
      const dateRange = calculateDateRange(DAYS_BACK);
      let rows;
      try {
        rows = await fetchProducaoDiaria(token, dateRange);
      } catch (error) {
        if (!error.requiresLogin && error.statusCode !== 401) throw error;
        token = await login();
        rows = await fetchProducaoDiaria(token, dateRange);
      }
      const result = await applyCycle(supabase, rows);
      if (!result.skipped) {
        logger.info(`producao_snapshot: ${result.promoted} linha(s) promovida(s) (janela ${dateRange.from} a ${dateRange.to}, ${result.remote} recebida(s) do GRM).`);
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
