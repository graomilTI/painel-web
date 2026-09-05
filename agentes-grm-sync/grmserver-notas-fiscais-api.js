#!/usr/bin/env node

/**
 * Sincroniza Notas Fiscais direto pela API do Graint, substituindo o fluxo
 * Puppeteer (grm-sync-notas-fiscais.js) — mesmo padrão de
 * grmserver-patrimonios-api.js. O script Puppeteer antigo já fazia
 * `fetch('/api/reports/finance/invoices', ...)` de DENTRO da página (o
 * download de XLS via downloadReport/parseXLS já era código morto, nunca
 * chamado por main()); aqui o login também é via API e roda sem navegador.
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

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const REPORT_CONFIG = {
  name: 'Notas Fiscais',
  tableName: 'grm_notas_fiscais_importacoes',
  // 90 dias deixava o relatório pesado demais no fluxo Puppeteer antigo. Como o agente
  // resincroniza com frequência, uma janela menor ainda cobre tudo com folga.
  daysBack: Number(process.env.GRM_NOTAS_DIAS || 30),
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { from: formatDate(pastDate), to: formatDate(today) };
}

function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
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
function authHeaders(token) { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }; }

async function login() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  log('INFO', 'Login via API...');
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
  log('SUCCESS', 'Login OK');
  return response.token;
}

async function fetchReportData(token) {
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Consultando ${REPORT_CONFIG.name} via API: ${dateRange.from} até ${dateRange.to}`);
  const json = await postJson(`${GRM_BASE_URL}reports/finance/invoices`, {
    biiDateFrom: dateRange.from,
    biiDateTo: dateRange.to,
    bilDateFrom: dateRange.from,
    bilDateTo: dateRange.to,
  }, authHeaders(token));
  if (!json.result) throw new Error(json.message || 'reports/finance/invoices falhou');
  const rows = json.searchData || [];

  const data = rows.map((row) => ({
    'Fatura': row.bilCode,
    'Data da Fatura': row.bilDate,
    'Situação': row.bilStatus,
    'Empresa': row.scpName,
    'Cliente Nacional': row.cliName,
    'Coordenação': row.olcName,
    'Número NF': row.biiNumber,
    'Data N.F.': row.biiDate,
    'Valor Total': row.biiFinalValue,
    'Valor Bruto': row.biiMainValue,
    'Desconto': row.biiDiscountValue,
    'Acréscimo': row.biiIncreaseValue,
    'Imposto': row.biiTaxWithholdingValue,
    'Tons': row.tons,
  }));
  log('SUCCESS', `${data.length} linhas recebidas pela API`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  const mappedRecords = data.map(row => ({
    data_nota_de: toIso(dateRange.from),
    data_nota_ate: toIso(dateRange.to),
    data_fatura_de: toIso(dateRange.from),
    data_fatura_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || null,
    numero_nf: row['Número NF'] || row['NF'] || null,
    empresa: row['Empresa'] || null,
    fatura: row['Fatura'] != null ? String(row['Fatura']) : null,
    valor_total: parseFloat(row['Valor Total'] || row['Valor']) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString(),
  }));
  // "N.F." (numero_nf) NAO identifica uma linha unica: uma mesma nota fiscal pode
  // agrupar varias Faturas (cargas/carregamentos distintos, cada um com seu proprio
  // Valor Bruto) - descoberto 24/08 depois de um buraco de ~R$9,36mi (23,6% da receita)
  // causado por essa suposicao errada. A linha de verdade e por (Empresa, Fatura).
  const byInvoice = new Map();
  const withoutInvoice = [];
  for (const record of mappedRecords) {
    if (record.empresa == null || record.fatura == null || record.fatura === '') withoutInvoice.push(record);
    else byInvoice.set(`${record.empresa}|${record.fatura}`, record);
  }
  const records = [...byInvoice.values(), ...withoutInvoice];

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'empresa,fatura' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }

  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API) ===`);
  const token = await login();
  const data = await fetchReportData(token);
  await upsertData(data);
  log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchReportData, login };
