#!/usr/bin/env node

/**
 * Sincroniza Despesas direto pela API do Graint, substituindo o fluxo
 * Puppeteer (grm-sync-despesas.js) — mesmo padrão de
 * grmserver-patrimonios-api.js. O script Puppeteer antigo abria o
 * navegador, logava e clicava nos dois seletores "agrupar por" (Coordenação
 * + Grupo de Categoria) só pra fazer o Vuetify montar a tela — mas o
 * `fetch('/api/reports/expenses', ...)` que ele disparava de dentro da
 * página já mandava `selectRow:'olcCode', selectColumn:'picParent'`
 * FIXOS no corpo da requisição, sem ler o valor escolhido na tela. Ou seja,
 * o clique na UI nunca influenciava a resposta: confirmado ao vivo em
 * 05/09 chamando o endpoint direto, sem abrir navegador, e recebendo a
 * mesma tabela pivot Coordenação × Categoria (mesmas 13 colunas) que o
 * script antigo. Aqui o login também é via API e roda sem navegador.
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
  name: 'Despesas',
  tableName: 'grm_despesas_importacoes',
  // Quantos meses (a partir do mês atual, inclusive) re-enviar a cada execução.
  // Reenviar sempre os últimos N meses (não só o atual) torna a sincronização
  // auto-curativa: se uma execução falhar ou um mês ficar incompleto, o próximo
  // ciclo corrige sozinho, sem precisar de backfill manual.
  monthsBack: Number(process.env.DESPESAS_MONTHS_BACK) || 13,
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateBr(d) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

// Lista dos N meses a sincronizar (mais antigo primeiro), cada um como {year, month0, from, to}.
function listMonthsToSync(monthsBack) {
  const today = new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const ref = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    months.push({ year: ref.getFullYear(), month0: ref.getMonth(), from: formatDateBr(first), to: formatDateBr(last) });
  }
  return months;
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

async function fetchReportForMonth(token, month) {
  log('INFO', `Buscando despesas de ${pad2(month.month0 + 1)}/${month.year} (${month.from} a ${month.to})...`);
  const json = await postJson(`${GRM_BASE_URL}reports/expenses`, {
    olcCode: null, olsCode: null, staCode: null, supCode: null,
    picParent: null, picCode: null, pipDateFrom: month.from, pipDateTo: month.to,
    selectRow: 'olcCode', selectColumn: 'picParent', selectSubColumn: '',
    useOperatingFlowMoviment: 'S',
  }, authHeaders(token));
  if (!json || json.result !== true) {
    throw new Error(`Resposta inesperada da API de despesas (${month.from}-${month.to}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  log('SUCCESS', `Mês ${pad2(month.month0 + 1)}/${month.year}: ${json.searchCount ?? 0} grupo(s) de dados.`);
  return json;
}

// Converte a tabela pivot (1 linha por Coordenação, 1 coluna por Categoria + "Total")
// em registros individuais {Coordenação, <categoria>: valor, ...}.
function pivotToRows(json) {
  const block = json.searchData?.[0];
  if (!block) return [];
  const colTitles = (block.cols || []).map((c) => c.title);
  return (block.rows || [])
    .filter((row) => row[0] !== 'Total Colunas') // descarta a linha de total geral
    .map((row) => {
      const obj = { 'Coordenação': row[0] };
      colTitles.forEach((title, idx) => { obj[String(title)] = row[idx + 1]; });
      return obj;
    });
}

function buildRecordsForMonth(month, rows) {
  return rows.map((row) => ({
    data_conta_de: toIso(month.from),
    data_conta_ate: toIso(month.to),
    coordenacao: row['Coordenação'] || null,
    supervisao: null,
    funcionario: null,
    fornecedor: null,
    grupo_categoria: null,
    categoria: null,
    vincular_caixa_operacional: null,
    valor: parseFloat(row['Total'] ?? 0) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(),
  }));
}

async function upsertData(records) {
  log('INFO', `Iniciando upsert de ${records.length} registros (${REPORT_CONFIG.monthsBack} meses)...`);
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }
  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API) ===`);
  const token = await login();

  const months = listMonthsToSync(REPORT_CONFIG.monthsBack);
  const allRecords = [];
  for (const month of months) {
    const json = await fetchReportForMonth(token, month);
    const rows = pivotToRows(json);
    allRecords.push(...buildRecordsForMonth(month, rows));
  }

  await upsertData(allRecords);
  log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchReportForMonth, pivotToRows, login };
