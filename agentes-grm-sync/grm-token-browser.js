'use strict';

/**
 * Autentica uma página do Puppeteer no GRM com o token de sessão em cache
 * (grm-token-cache.js), sem passar pelo formulário de login.
 *
 * Desde 30/09/2026 o formulário de login do GRM exige Cloudflare Turnstile e o
 * navegador automatizado fica preso em /login. O site, depois de logar, guarda o
 * estado da sessão no localStorage (stores Pinia "userStore" e "menusStore");
 * aqui esse mesmo estado é montado antes de o site carregar, a partir de um token
 * gravado por um humano (node grm-token-cache.js salvar) e da resposta de
 * user/getUserDataAccess — a mesma chamada que o próprio site faz ao abrir.
 *
 * Uso nos agentes de navegador, no começo de login(page):
 *   if (String(process.env.GRM_LOGIN_MODE || '').toLowerCase() !== 'form') {
 *     return require('./grm-token-browser').autenticarPaginaComToken(page);
 *   }
 * (GRM_LOGIN_MODE=form volta ao login pelo formulário.)
 */

const https = require('https');
const { obterTokenGrm } = require('./grm-token-cache');

const USER_STORE_KEY = '1e467a08-19f3';
const MENUS_STORE_KEY = '482e8da0-bde1';
const SITE = 'https://www.grmserver.com.br';

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
function esperar(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function postGrm(pathname, body, token) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.grmserver.com.br',
      path: `/api/${pathname}`,
      method: 'POST',
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        origin: SITE,
        referer: `${SITE}/`,
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
        authorization: `Bearer ${token}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error(`GRM retornou conteúdo inválido (HTTP ${res.statusCode}).`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout ao consultar o GRM.')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function autenticarPaginaComToken(page) {
  log('INFO', 'Autenticando com o token de sessão em cache (login pelo formulário é barrado pelo Turnstile)...');
  const token = await obterTokenGrm({
    // Sem token válido não adianta tentar login (captcha): falha na hora, com instrução.
    login: () => Promise.reject(new Error('Sem token de sessão válido em cache. Grave um: node grm-token-cache.js salvar')),
  });

  const claims = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const acesso = await postGrm('user/getUserDataAccess', { userCode: claims.userCode, userEmail: claims.userEmail, userLanguage: 'br' }, token);
  if (!acesso || !acesso.result || !acesso.userData) {
    throw new Error(`GRM recusou o token de sessão (getUserDataAccess: ${(acesso && acesso.message) || 'sem detalhes'}).`);
  }

  const userStore = JSON.stringify({ userData: acesso.userData, userToken: token, userLoginEmail: claims.userEmail });
  const menusStore = JSON.stringify({ menuData: acesso.menuData || [] });
  await page.evaluateOnNewDocument((userKey, userValue, menusKey, menusValue, site) => {
    if (location.origin === site) {
      localStorage.setItem(userKey, userValue);
      localStorage.setItem(menusKey, menusValue);
    }
  }, USER_STORE_KEY, userStore, MENUS_STORE_KEY, menusStore, SITE);

  await page.goto(`${SITE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await esperar(1500);
  if (page.url().includes('/login')) throw new Error('Sessão por token recusada: o site redirecionou para /login.');
  log('SUCCESS', 'Sessão autenticada com o token em cache');
}

module.exports = { autenticarPaginaComToken };
