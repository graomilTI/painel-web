#!/usr/bin/env node
/*
 * Auditoria só-leitura: lista TODOS os produtos cadastrados no GRM com seus
 * flags proEnableXxxTest (quais testes cada produto permite habilitar numa
 * O.S.) e compara com o catálogo interno (assets/js/logistica-abertura-os-
 * produtos.js CATALOGO_PRODUTOS) que decide quais testes o painel oferece
 * pra cada produto. Objetivo: achar produtos onde o GRM permite um teste que
 * o painel não oferece (pedido do usuário fica impossível de fazer) ou
 * vice-versa. Não grava nada — só GET/POST de leitura (getForSelect/
 * getRecords), mesmo padrão de login por API já usado em produção em
 * grmserver-abrir-os-api.js. Uso: node auditar-testes-produtos.js
 */

require('dotenv').config();
const https = require('https');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(level, msg) { console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg); }

function requestJson(url, method, body, headers) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port || 443,
      path: parsed.pathname + parsed.search, method: method || 'GET', timeout: 30000,
      headers: Object.assign(
        { accept: 'application/json', 'content-type': 'application/json' },
        payload ? { 'content-length': Buffer.byteLength(payload) } : {}, headers || {}
      ),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { reject(new Error('GRM retornou conteúdo inválido (HTTP ' + response.statusCode + ').')); return; }
        if (response.statusCode < 200 || response.statusCode >= 300) { reject(new Error('GRM respondeu HTTP ' + response.statusCode + ': ' + (data.message || 'erro'))); return; }
        resolve(data);
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('timeout')));
    if (payload) request.write(payload);
    request.end();
  });
}

function postJson(url, body, token) {
  const headers = Object.assign({}, GRM_WEB_HEADERS, token ? { authorization: 'Bearer ' + token } : {});
  return requestJson(GRM_BASE_URL + url, 'POST', body, headers);
}

async function login() {
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson('user/login', {
    userEmail: GRM_USER, userPass: GRM_PASSWORD,
    loginInfo: { ip: '', browser: 'GRM API Agent', browserVersion: '1.0', engine: 'Node.js', engineVersion: process.version, platform: process.platform, screenSize: '', windowSize: '' },
  }, null);
  if (!response.result || !response.token) throw new Error('Login GRM recusado: ' + (response.message || 'sem token'));
  return response.token;
}

const CAMPOS_TESTE = [
  'proEnableAflatoxinsTest', 'proEnableIntactaTest', 'proEnableSoyFreeTest',
  'proEnableVomitoxinTest', 'proEnableFallingNumberTest',
  // capturados no catálogo mas sem campo correspondente na tela de O.S.
  // hoje (ver auditoria do bundle ServiceOrder-*.js) — listados só pra
  // visibilidade, não geram alerta de gap:
  'proEnableEtheralExtractTest', 'proEnableRawFiberTest', 'proEnableProfatTest',
  'proEnableRawProteinTest', 'proEnableTanninTest', 'proEnableVomitoxinDDGSTest',
  'proEnableZearalenonaTest', 'proEnableOchratoxinTest', 'proEnableFumonisinTest',
  'proEnableT2H2Test',
];

const CAMPOS_SEM_UI_NA_OS = new Set([
  'proEnableEtheralExtractTest', 'proEnableRawFiberTest', 'proEnableProfatTest',
  'proEnableRawProteinTest', 'proEnableTanninTest', 'proEnableVomitoxinDDGSTest',
  'proEnableZearalenonaTest', 'proEnableOchratoxinTest', 'proEnableFumonisinTest',
  'proEnableT2H2Test',
]);

async function main() {
  const token = await login();
  log('SUCCESS', 'Login realizado.');

  const produtos = (await postJson('product/getForSelect', { proStatus: 'A' }, token)).searchData || [];
  const tipos = (await postJson('productType/getRecords', { ptyStatus: 'A' }, token)).searchData || [];

  log('INFO', produtos.length + ' produtos ativos no GRM. ' + tipos.length + ' tipos de produto ativos.');
  log('INFO', 'Tipos de produto (ptyCode -> ptyName): ' + tipos.map((t) => t.ptyCode + '=' + t.ptyName).join(', '));
  console.log('');
  console.log('proCode | proName | ' + CAMPOS_TESTE.map((c) => c.replace('proEnable', '').replace('Test', '')).join(' | '));
  produtos.forEach((p) => {
    const flags = CAMPOS_TESTE.map((c) => (p[c] === 'S' ? 'S' : '-'));
    console.log(p.proCode + ' | ' + p.proName + ' | ' + flags.join(' | '));
  });

  console.log('');
  log('INFO', '=== Produtos com testes habilitados no GRM que NÃO têm campo na tela de O.S. hoje (proEnableXxxTest="S" mas sem select correspondente em sorXxxTest) ===');
  produtos.forEach((p) => {
    const semUi = CAMPOS_TESTE.filter((c) => CAMPOS_SEM_UI_NA_OS.has(c) && p[c] === 'S');
    if (semUi.length) log('WARN', p.proName + ' (proCode ' + p.proCode + '): ' + semUi.join(', '));
  });
}

main().catch((err) => { log('ERROR', String(err.stack || err)); process.exitCode = 1; });
