'use strict';

/**
 * Cache do token de login do GRM compartilhado entre os agentes.
 *
 * Todo agente fazia POST user/login a cada execução (o de distribuição de O.S.
 * roda de 2 em 2 minutos, fora os ~15 de hora em hora). Em 30/09/2026 o GRM
 * passou a responder "captcha_invalid" nesse login para a conta dos agentes e
 * tudo parou. Este módulo reduz a poucos logins por dia:
 *
 *   1. reaproveita o último token salvo em disco (validado com uma chamada
 *      leve autenticada — não é login);
 *   2. só faz login de verdade se não houver token ou ele foi recusado;
 *   3. serializa o login entre processos (lock) para que 2 agentes que
 *      começam juntos não loguem duas vezes;
 *   4. depois de um login recusado (ex.: captcha) entra em "cooldown": os
 *      agentes falham na hora, sem bater no GRM, em vez de insistir a cada
 *      2 minutos e agravar o bloqueio.
 *
 * Uso nos scripts: obterTokenGrm({ login: loginDireto }), onde loginDireto é o
 * login que já existia (POST user/login) e devolve o token.
 *
 * Variáveis opcionais: GRM_TOKEN_CACHE=off (desliga), GRM_TOKEN_CACHE_DIR,
 * GRM_TOKEN_MAX_AGE_MIN (padrão 360, usado quando o token não é JWT com exp),
 * GRM_LOGIN_COOLDOWN_MIN (padrão 10).
 * Para forçar novo login após resolver o captcha: apagar .grm-login-cooldown-*.json
 * no diretório dos scripts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const CACHE_DIR = process.env.GRM_TOKEN_CACHE_DIR || __dirname;
const MAX_AGE_MS = Math.max(1, Number(process.env.GRM_TOKEN_MAX_AGE_MIN) || 360) * 60000;
const COOLDOWN_MS = Math.max(1, Number(process.env.GRM_LOGIN_COOLDOWN_MIN) || 10) * 60000;
const LOCK_STALE_MS = 60000;
const LOCK_WAIT_MS = 45000;
const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(msg) { console.log(`[INFO] ${new Date().toISOString()} - [grm-token] ${msg}`); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function paths() {
  const chave = crypto.createHash('sha1').update(String(process.env.GRMSERVER_USER || '')).digest('hex').slice(0, 12);
  return {
    token: path.join(CACHE_DIR, `.grm-token-${chave}.json`),
    cooldown: path.join(CACHE_DIR, `.grm-login-cooldown-${chave}.json`),
    lock: path.join(CACHE_DIR, `.grm-login-${chave}.lock`),
  };
}

function lerJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function gravarJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function apagar(file) { try { fs.unlinkSync(file); } catch { /* já não existe */ } }

// Se o token é um JWT com exp, usa essa validade (com 2 min de folga); senão MAX_AGE.
function expiraEm(token, salvoEm) {
  try {
    const partes = String(token).split('.');
    if (partes.length === 3) {
      const payload = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (Number(payload.exp) > 0) return Number(payload.exp) * 1000 - 120000;
    }
  } catch { /* segue para o padrão */ }
  return Number(salvoEm) + MAX_AGE_MS;
}

// Chamada leve autenticada (a mesma que o agente de distribuição já usa). Só
// 401/403 ou result:false contam como token recusado; erro de rede/5xx mantém o
// token para não trocar por login à toa quando o GRM está instável.
function tokenAindaValido(token) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ olsStatus: 'A' });
    const url = new URL(`${GRM_BASE_URL}supervision/getForSelect`);
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      timeout: 15000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...GRM_WEB_HEADERS,
        authorization: `Bearer ${token}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return resolve(false);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { return resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).result !== false); } catch { return resolve(true); }
        }
        return resolve(true);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(true));
    req.end(payload);
  });
}

async function tokenEmCache(p, validar) {
  const salvo = lerJson(p.token);
  if (!salvo || !salvo.token) return null;
  if (Date.now() >= expiraEm(salvo.token, salvo.savedAt)) { apagar(p.token); return null; }
  if (await validar(salvo.token)) return salvo.token;
  log('token em cache recusado pelo GRM; será feito novo login.');
  apagar(p.token);
  return null;
}

function assumirLock(p) {
  try {
    fs.closeSync(fs.openSync(p.lock, 'wx'));
    return true;
  } catch {
    try {
      if (Date.now() - fs.statSync(p.lock).mtimeMs > LOCK_STALE_MS) { apagar(p.lock); return assumirLock(p); }
    } catch { /* lock sumiu entre as chamadas */ }
    return false;
  }
}

async function obterTokenGrm({ login, validar = tokenAindaValido } = {}) {
  if (typeof login !== 'function') throw new Error('obterTokenGrm: informe a função login.');
  if (String(process.env.GRM_TOKEN_CACHE || '').toLowerCase() === 'off') return login();

  const p = paths();
  const emCache = await tokenEmCache(p, validar);
  if (emCache) return emCache;

  const inicio = Date.now();
  let temLock = assumirLock(p);
  while (!temLock && Date.now() - inicio < LOCK_WAIT_MS) {
    await sleep(500);
    const outro = await tokenEmCache(p, validar); // outro processo pode ter acabado de logar
    if (outro) return outro;
    temLock = assumirLock(p);
  }
  if (!temLock) throw new Error('Outro processo está fazendo login no GRM há muito tempo; tente na próxima execução.');

  try {
    const jaLogado = await tokenEmCache(p, validar);
    if (jaLogado) return jaLogado;

    const cooldown = lerJson(p.cooldown);
    if (cooldown && Number(cooldown.ate) > Date.now()) {
      const ate = new Date(Number(cooldown.ate)).toISOString();
      throw new Error(`Login GRM em pausa até ${ate} (${cooldown.motivo}). Para tentar antes, apague ${path.basename(p.cooldown)}.`);
    }

    try {
      const token = await login();
      gravarJson(p.token, { token, savedAt: Date.now() });
      apagar(p.cooldown);
      log('login realizado e token salvo em cache.');
      return token;
    } catch (error) {
      // Login recusado pelo GRM (captcha, senha, bloqueio): não insistir a cada execução.
      if (/recusado|captcha/i.test(String(error && error.message))) {
        gravarJson(p.cooldown, { ate: Date.now() + COOLDOWN_MS, motivo: String(error.message).slice(0, 200) });
      }
      throw error;
    }
  } finally {
    apagar(p.lock);
  }
}

function limparTokenGrm() {
  apagar(paths().token);
}

module.exports = { obterTokenGrm, limparTokenGrm };
