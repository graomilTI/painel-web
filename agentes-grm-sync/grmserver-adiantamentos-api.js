#!/usr/bin/env node

/**
 * Sincroniza Adiantamentos (Solicitações Caixa Operacional) direto pela API
 * do Graint, substituindo o fluxo Puppeteer (grm-sync-adiantamentos.js) —
 * mesmo padrão de grmserver-contas-pagar-api.js/grmserver-patrimonios-api.js.
 * O script Puppeteer antigo já fazia `fetch('/api/oFlow/request/getRecords',
 * ...)` de DENTRO da página (filtro ofrStatus:'P', confirmado ao vivo em
 * 10/07 capturando o POST real da tela); aqui o login também é via API e
 * roda sem navegador.
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
  name: 'Adiantamentos (Solicitações Caixa Operacional)',
  tableName: 'grm_adiantamentos_importacoes',
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

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

async function fetchPendingRequests(token) {
  log('INFO', `Buscando ${REPORT_CONFIG.name} via API...`);
  const json = await postJson(`${GRM_BASE_URL}oFlow/request/getRecords`, {
    ofrStatus: 'P', ofrDateFrom: '', ofrDateTo: '',
  }, authHeaders(token));

  if (!json || json.result !== true) {
    throw new Error(`Resposta inesperada da API de solicitações: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const data = json.searchData || [];
  log('SUCCESS', `${data.length} solicitação(ões) pendente(s) recebida(s)`);
  return data;
}

function buildRecords(rows) {
  return rows.map((row) => ({
    ofr_code: row.ofrCode,
    ofr_status: row.ofrStatus || null,
    data_solicitacao: row.ofrDate || null,
    data_registro: row.ofrRegisterDate || null,
    colaborador: row.staName || null,
    cpf: row.staCPF || null,
    coordenacao: row.olcName || null,
    supervisao: row.olsName || null,
    conta: row.baccName || null,
    valor: row.ofrValue ?? null,
    // ofsBallance vem invertido em relação à leitura financeira que o painel usa (saldo
    // positivo = colaborador com crédito; negativo = colaborador devendo) — GRM guarda o
    // sinal oposto, por isso invertemos aqui na sincronização.
    saldo: row.ofsBallance != null ? -row.ofsBallance : null,
    embarque: row.lastLoad || null,
    leitura_mais_antiga: row.lastNoShip || null,
    descricao: row.ofrDescription || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(),
    pendente_no_grm: true,
    saiu_pendente_em: null,
  }));
}

async function upsertData(records) {
  log('INFO', `Iniciando upsert de ${records.length} registros...`);
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'ofr_code' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }
  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
}

// A API do GRM sempre devolve a lista COMPLETA de pendentes. Se um ofr_code que já
// sincronizamos como pendente sumir dessa lista, foi resolvido/baixado direto no GRM (fora
// do fluxo do painel) — marcamos pendente_no_grm=false pra tela tirar da aba Solicitações e
// jogar automaticamente pro Histórico, mesmo sem decisão do financeiro.
async function marcarSaidosDoGrm(ofrCodesAtuais) {
  log('INFO', 'Verificando solicitações que saíram da lista de pendentes do GRM...');
  const agora = new Date().toISOString();
  let query = supabase
    .from(REPORT_CONFIG.tableName)
    .update({ pendente_no_grm: false, saiu_pendente_em: agora })
    .eq('pendente_no_grm', true);
  if (ofrCodesAtuais.length) {
    query = query.not('ofr_code', 'in', `(${ofrCodesAtuais.join(',')})`);
  }
  const { data, error } = await query.select('ofr_code');
  if (error) throw error;
  log('SUCCESS', `${(data || []).length} solicitação(ões) marcada(s) como não mais pendente(s) no GRM.`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API) ===`);
  const token = await login();
  const rows = await fetchPendingRequests(token);
  const records = buildRecords(rows);
  await upsertData(records);
  await marcarSaidosDoGrm(records.map((r) => r.ofr_code));
  log('SUCCESS', 'Concluído');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchPendingRequests, buildRecords, login };
