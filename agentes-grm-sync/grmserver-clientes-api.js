#!/usr/bin/env node

/**
 * Sincroniza a lista de clientes do Graint direto pela API, sem Puppeteer —
 * mesmo padrão de migração já feito em Patrimônios/Contas a Pagar/etc (ver
 * grmserver-patrimonios-api.js).
 *
 * Dois relatórios do GRM, descobertos no bundle JS da tela (objeto
 * `graintLinks`, chave "clientFinal" aponta pra `client/last/getRecords" —
 * "last" é o nome interno de "Clientes Finais" no Graint):
 *   - Clientes Nacionais: POST client/national/getRecords  → clientes_nacionais
 *   - Clientes Finais:    POST client/last/getRecords      → faturamento_clientes
 *
 * O status ativo/inativo agora vem direto no campo `clnStatus`/`cliStatus`
 * ("A"/"N") — antes disso não havia opção na UI do GRM pra ver isso, só a cor
 * de fundo da linha (ver memória grm-clientes-nacionais-ativo-inativo-cor);
 * a API elimina esse hack.
 *
 * `faturamento_clientes` tem colunas de configuração de cobrança
 * (periodicidade, prazo_retorno_dias, prazo_pagamento_dias, observacoes) que
 * são preenchidas/ajustadas manualmente e não existem no GRM — o upsert de
 * registros já existentes só toca nome/cnpj/status, nunca esses campos.
 * Registro novo entra com os defaults já usados nas importações anteriores.
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

async function fetchClientNational(token) {
  log('INFO', 'Buscando Clientes Nacionais via API...');
  const json = await postJson(`${GRM_BASE_URL}client/national/getRecords`, {}, authHeaders(token));
  const data = json.searchData || [];
  log('SUCCESS', `${data.length} Clientes Nacionais recebidos`);
  return data;
}

async function fetchClientFinal(token) {
  log('INFO', 'Buscando Clientes Finais via API...');
  const json = await postJson(`${GRM_BASE_URL}client/last/getRecords`, {}, authHeaders(token));
  const data = json.searchData || [];
  log('SUCCESS', `${data.length} Clientes Finais recebidos`);
  return data;
}

async function upsertInChunks(tableName, records, onConflict = 'id') {
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    const { error } = await supabase.from(tableName).upsert(chunk, { onConflict });
    if (error) throw error;
    log('INFO', `${tableName}: progresso ${Math.min(i + 200, records.length)}/${records.length}`);
  }
}

async function syncClientesNacionais(data) {
  const now = new Date().toISOString();
  const records = data.map((row) => ({
    id: `grm-nac-${row.clnCode}`,
    grm_id: row.clnCode,
    nome: row.clnName,
    ativo: row.clnStatus === 'A',
    updated_at: now,
  }));
  log('INFO', `clientes_nacionais: upsert de ${records.length} registros...`);
  await upsertInChunks('clientes_nacionais', records);
  log('SUCCESS', `clientes_nacionais: upsert concluído (${records.length})`);
}

async function syncFaturamentoClientes(data) {
  const now = new Date().toISOString();
  const ids = data.map((row) => `grm-cli-${row.cliCode}`);

  const existing = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: rows, error } = await supabase.from('faturamento_clientes').select('id').in('id', chunk);
    if (error) throw error;
    rows.forEach((r) => existing.add(r.id));
  }

  const toInsert = [];
  const toUpdate = [];
  for (const row of data) {
    const id = `grm-cli-${row.cliCode}`;
    const status = row.cliStatus === 'A' ? 'Ativo' : 'Inativo';
    const cnpj = row.cliDocument || null;
    if (existing.has(id)) {
      toUpdate.push({ id, nome: row.cliName, cnpj, status, updated_at: now });
    } else {
      toInsert.push({
        id, nome: row.cliName, cnpj, status,
        periodicidade: 'Mensal',
        prazo_retorno_dias: 2,
        prazo_pagamento_dias: 7,
        observacoes: 'Importado automaticamente do GRM',
        updated_at: now,
      });
    }
  }

  log('INFO', `faturamento_clientes: ${toInsert.length} novos, ${toUpdate.length} atualizações (nome/cnpj/status apenas)`);
  if (toInsert.length) await upsertInChunks('faturamento_clientes', toInsert);
  if (toUpdate.length) await upsertInChunks('faturamento_clientes', toUpdate);
  log('SUCCESS', `faturamento_clientes: sincronização concluída (${data.length})`);
}

async function main() {
  log('INFO', '=== Clientes (Nacionais + Finais) via API ===');
  const token = await login();

  const nacionais = await fetchClientNational(token);
  await syncClientesNacionais(nacionais);

  const finais = await fetchClientFinal(token);
  await syncFaturamentoClientes(finais);

  log('SUCCESS', 'Concluído');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchClientNational, fetchClientFinal, login };
