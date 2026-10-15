// @ts-check
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
 *      2 minutos e agravar o bloqueio;
 *   5. distingue o token recusado pelo GRM (401/403 em JSON) do bloqueio de
 *      REDE (a Cloudflare do GRM barra o IP deste servidor: 403 em HTML
 *      "Sorry, you have been blocked"). No bloqueio de rede o token em cache e
 *      a entrega do painel NÃO são descartados; os agentes falham na hora com
 *      GRM_BLOQUEIO_REDE e a conferência volta com espera crescente (2, 5, 10
 *      min), com uma única chamada sem token que só pergunta se a rede foi
 *      liberada. Visto pela primeira vez em 15/10/2026 (06:15 BRT).
 *
 * Uso nos scripts: obterTokenGrm({ login: loginDireto }), onde loginDireto é o
 * login que já existia (POST user/login) e devolve o token.
 *
 * Variáveis opcionais: GRM_TOKEN_CACHE=off (desliga), GRM_TOKEN_CACHE_DIR,
 * GRM_TOKEN_MAX_AGE_MIN (padrão 360, usado quando o token não é JWT com exp),
 * GRM_LOGIN_COOLDOWN_MIN (padrão 10), GRM_REDE_BLOQUEIO_MAX_MIN (espera máxima entre
 * conferências durante o bloqueio de rede; padrão 10).
 * Para forçar novo login após resolver o captcha: apagar .grm-login-cooldown-*.json
 * no diretório dos scripts. Para conferir o bloqueio de rede antes da hora: apagar
 * .grm-rede-bloqueada-*.json.
 *
 * Login com Cloudflare Turnstile: desde 30/09/2026 o user/login do GRM exige o
 * token do Turnstile (captcha_invalid), que só um navegador consegue. Nesse
 * caso um humano entra no GRM pelo navegador e grava o token da sessão aqui:
 *   node grm-token-cache.js salvar [--validade-horas N]
 * (cola o token — com ou sem "Bearer" — e Enter; ou GRM_TOKEN=... no ambiente).
 * O token é conferido no GRM antes de ser salvo e nunca é impresso. O ideal é
 * rodar como grao100 (su - grao100); se rodar como root, o arquivo é gravado
 * com o dono da pasta para os agentes conseguirem ler.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const CACHE_DIR = process.env.GRM_TOKEN_CACHE_DIR || __dirname;
const MAX_AGE_MS = Math.max(1, Number(process.env.GRM_TOKEN_MAX_AGE_MIN) || 360) * 60000;
const COOLDOWN_MS = Math.max(1, Number(process.env.GRM_LOGIN_COOLDOWN_MIN) || 10) * 60000;
// Bloqueio de rede (Cloudflare barrando o IP do servidor): espera entre conferências, em minutos.
const BLOQUEIO_REDE_PASSOS_MIN = [2, 5, 10];
const BLOQUEIO_REDE_MAX_MIN = Math.max(1, Number(process.env.GRM_REDE_BLOQUEIO_MAX_MIN) || 10);
// O alerta do WhatsApp (grm_alerta_login_parado) procura este código no stdout/stderr/erro dos jobs.
const CODIGO_BLOQUEIO_REDE = 'GRM_BLOQUEIO_REDE';
// Resultado de validar(): além de true/false/null, "a rede está bloqueada — o token não foi julgado".
const BLOQUEIO_REDE = 'bloqueio_rede';
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

function rotaDeSaida() { return process.env.GRM_EGRESS_ROTA === 'tunel' ? 'tunel' : 'direto'; }

function paths() {
  const chave = crypto.createHash('sha1').update(String(process.env.GRMSERVER_USER || '')).digest('hex').slice(0, 12);
  return {
    token: path.join(CACHE_DIR, `.grm-token-${chave}.json`),
    cooldown: path.join(CACHE_DIR, `.grm-login-cooldown-${chave}.json`),
    // Uma marca por ROTA: o agente que sai pelo túnel do escritório (GRM_EGRESS_ROTA=tunel, definido por
    // grm-egress-proxy.js) não pode ser travado pela sondagem direta — ainda bloqueada — de outro agente.
    bloqueio: path.join(CACHE_DIR, `.grm-rede-bloqueada-${chave}-${rotaDeSaida()}.json`),
    lock: path.join(CACHE_DIR, `.grm-login-${chave}.lock`),
  };
}

function lerJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Rodando como root (ex.: terminal do WHM), o arquivo nasceria de root com modo 0600 e os
// agentes (usuário grao100) não conseguiriam ler o token; passa o dono da pasta para ele.
function herdarDonoDaPasta(file) {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return;
  try {
    const { uid, gid } = fs.statSync(CACHE_DIR);
    if (uid !== 0) fs.chownSync(file, uid, gid);
  } catch { /* melhor esforço: sem permissão para trocar o dono, segue como está */ }
}

function gravarJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  herdarDonoDaPasta(tmp);
  fs.renameSync(tmp, file);
}

function apagar(file) { try { fs.unlinkSync(file); } catch { /* já não existe */ } }

// Se o token é um JWT com exp, usa essa validade (com 2 min de folga); senão MAX_AGE.
function expiraEm(token, salvoEm, expiraEmExplicito) {
  if (Number(expiraEmExplicito) > 0) return Number(expiraEmExplicito);
  try {
    const partes = String(token).split('.');
    if (partes.length === 3) {
      const payload = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (Number(payload.exp) > 0) return Number(payload.exp) * 1000 - 120000;
    }
  } catch { /* segue para o padrão */ }
  return Number(salvoEm) + MAX_AGE_MS;
}

// 403/429 em HTML (ou com a assinatura da Cloudflare no corpo) = a borda barrou o IP deste
// servidor; não é o GRM julgando token ou senha (esse responde sempre em JSON). Confirmado em
// 15/10/2026: o mesmo POST /api/* saía do servidor com 403 "Sorry, you have been blocked" e de
// outro IP chegava ao GRM (401 em JSON).
function respostaDeBloqueioDeRede(statusCode, headers, corpo) {
  if (statusCode !== 403 && statusCode !== 429) return false;
  if (String((headers && headers['content-type']) || '').toLowerCase().includes('text/html')) return true;
  return /cloudflare|attention required|you have been blocked/i.test(String(corpo || ''));
}

function requisitarGrm(pathApi, payload, headers, aoResponder) {
  const url = new URL(`${GRM_BASE_URL}${pathApi}`);
  const lib = url.protocol === 'http:' ? http : https;
  return lib.request({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: `${url.pathname}${url.search}`,
    method: 'POST',
    timeout: 15000,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
      ...GRM_WEB_HEADERS,
      ...headers,
    },
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => aoResponder(res, Buffer.concat(chunks).toString('utf8')));
  });
}

// Chamada leve autenticada (a mesma que o agente de distribuição já usa). Só
// 401/403 em JSON ou result:false contam como token recusado; erro de rede/5xx mantém o
// token para não trocar por login à toa quando o GRM está instável. 403/429 em HTML da
// Cloudflare devolve BLOQUEIO_REDE: o token não foi julgado e não pode ser descartado.
function tokenAindaValido(token, estrito = false) {
  // estrito: sem resposta definitiva do GRM (rede/5xx/corpo ilegível) devolve null em vez de true.
  const incerto = estrito ? null : true;
  return new Promise((resolve) => {
    const payload = JSON.stringify({ olsStatus: 'A' });
    const req = requisitarGrm('supervision/getForSelect', payload, { authorization: `Bearer ${token}` }, (res, corpo) => {
      if (respostaDeBloqueioDeRede(res.statusCode, res.headers, corpo)) return resolve(BLOQUEIO_REDE);
      if (res.statusCode === 401 || res.statusCode === 403) return resolve(false);
      if (Number(res.statusCode) >= 200 && Number(res.statusCode) < 300) {
        try { return resolve(JSON.parse(corpo).result !== false); } catch { return resolve(incerto); }
      }
      return resolve(incerto);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(incerto));
    req.end(payload);
  });
}

// Pergunta à borda do GRM, SEM token nenhum, se este servidor consegue chegar na API:
// 401 em JSON = liberada (a aplicação respondeu); 403 em HTML da Cloudflare = bloqueada;
// timeout/erro de rede = incerta.
function sondarRede() {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ olsStatus: 'A' });
    const req = requisitarGrm('supervision/getForSelect', payload, {}, (res, corpo) => {
      resolve(respostaDeBloqueioDeRede(res.statusCode, res.headers, corpo) ? 'bloqueada' : 'liberada');
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve('incerta'));
    req.end(payload);
  });
}

function formatarBrasilia(ms) {
  try { return new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return new Date(ms).toISOString(); }
}

function erroBloqueioRede(ate, motivo, arquivo) {
  const quando = formatarBrasilia(ate);
  const quemBloqueia = rotaDeSaida() === 'tunel'
    ? `o GRM não está acessível pelo túnel do escritório (${motivo}). Confira se o PC do escritório está ligado, com internet e com a tarefa "GRM Tunel Escritorio" rodando`
    : `a Cloudflare do GRM está bloqueando o IP deste servidor (${motivo}). O suporte do GRM precisa liberar o IP`;
  const erro = new Error(
    `${CODIGO_BLOQUEIO_REDE}: ${quemBloqueia}. `
    + `Não é o token nem a senha — o token em cache e a entrega do painel foram preservados. `
    + `Tentativas pausadas até ${quando} (Brasília). `
    + `Para conferir antes, apague ${arquivo ? path.basename(arquivo) : '.grm-rede-bloqueada-*.json'}.`,
  );
  /** @type {any} */ (erro).codigo = CODIGO_BLOQUEIO_REDE;
  return erro;
}

// Marca o bloqueio de rede (espera 2 → 5 → 10 min a cada conferência que ainda falha) e devolve o
// erro para quem chamou lançar. `p.bloqueio` pode faltar (chamadas soltas): aí só devolve o erro.
function registrarBloqueioRede(p, motivo) {
  const antes = p && p.bloqueio ? lerJson(p.bloqueio) : null;
  const falhas = (antes ? Number(antes.falhas) || 0 : 0) + 1;
  const minutos = Math.min(BLOQUEIO_REDE_PASSOS_MIN[Math.min(falhas, BLOQUEIO_REDE_PASSOS_MIN.length) - 1], BLOQUEIO_REDE_MAX_MIN);
  const ate = Date.now() + minutos * 60000;
  if (p && p.bloqueio) {
    try { gravarJson(p.bloqueio, { desde: (antes && antes.desde) || Date.now(), ate, falhas, motivo }); } catch { /* melhor esforço */ }
  }
  log(`bloqueio de rede do GRM (${motivo}); próxima conferência em ${minutos} min.`);
  return erroBloqueioRede(ate, motivo, p && p.bloqueio);
}

function limparBloqueioRede(p) { if (p && p.bloqueio) apagar(p.bloqueio); }

// Disjuntor: durante a espera falha na hora, sem chamar o GRM. Vencida a espera, UMA sondagem sem
// token decide: liberada → apaga a marca e segue; bloqueada → espera mais longa e lança; incerta →
// segue o fluxo normal (a marca fica reservada por 60 s para os outros processos não sondarem junto).
async function exigirRedeLiberada(p, sondar = sondarRede) {
  const estado = p.bloqueio ? lerJson(p.bloqueio) : null;
  if (!estado) return;
  if (Number(estado.ate) > Date.now()) throw erroBloqueioRede(Number(estado.ate), estado.motivo || 'HTTP 403', p.bloqueio);
  gravarJson(p.bloqueio, { ...estado, ate: Date.now() + 60000 });
  const situacao = await sondar();
  if (situacao === 'liberada') {
    apagar(p.bloqueio);
    log('o GRM voltou a aceitar este servidor (bloqueio de rede liberado); retomando.');
    return;
  }
  if (situacao === 'bloqueada') throw registrarBloqueioRede(p, 'a Cloudflare continua bloqueando o IP');
}

// O login do script falhou com 403 em HTML? Confirma com a sondagem (sem token) antes de chamar de bloqueio.
async function loginFalhouPorBloqueioDeRede(error, sondar) {
  const msg = String((error && error.message) || '');
  if (error && error.codigo === CODIGO_BLOQUEIO_REDE) return true;
  if (!/HTTP (403|429)/.test(msg) || !/conte[úu]do inv[áa]lido|<!doctype|cloudflare|attention required|blocked/i.test(msg)) return false;
  return (await sondar()) === 'bloqueada';
}

async function tokenEmCache(p, validar) {
  const salvo = lerJson(p.token);
  if (!salvo || !salvo.token) return null;
  if (Date.now() >= expiraEm(salvo.token, salvo.savedAt, salvo.expiraEm)) { apagar(p.token); return null; }
  const situacao = await validar(salvo.token);
  if (situacao === BLOQUEIO_REDE) throw registrarBloqueioRede(p, 'HTTP 403 da Cloudflare ao conferir o token em cache'); // token preservado
  if (situacao) return salvo.token;
  log('token em cache recusado pelo GRM; será feito novo login.');
  apagar(p.token);
  return null;
}

// Entrega pelo painel: depois de entrar no GRM pelo navegador, a pessoa clica no favorito
// "Enviar token GRM" (ou cola o token em TI > Integrações) e o painel guarda o token em
// public.grm_token_entregas. Sem token válido em cache, o agente busca a entrega mais recente
// aqui, confere no GRM, grava no cache (como o `salvar`) e apaga o token da tabela. É só leitura
// de uma tabela do Supabase — não faz login nem contorna o captcha. Qualquer falha nesse caminho
// (sem .env, rede, tabela ausente) é silenciosa e cai no fluxo de antes.
// GRM_TOKEN_ENTREGA=off desliga.
const ENTREGA_TENTATIVAS_MAX = 5;

function configSupabase() {
  const url = process.env.SUPABASE_URL || process.env.SB_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: String(url).replace(/\/+$/, ''), key };
}

// Resolve { ok, dados }; nunca rejeita. PostgREST: filtro no PATCH é atômico (só um processo reivindica a linha).
function restSupabase(cfg, method, caminho, corpo) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(`${cfg.url}/rest/v1/${caminho}`); } catch { return resolve({ ok: false, dados: null }); }
    const lib = url.protocol === 'http:' ? require('http') : https;
    const payload = corpo === undefined ? null : JSON.stringify(corpo);
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method,
      timeout: 15000,
      headers: {
        accept: 'application/json',
        apikey: cfg.key,
        authorization: `Bearer ${cfg.key}`,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), prefer: 'return=representation' } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        let dados = null;
        try { dados = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* corpo vazio */ }
        resolve({ ok, dados });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, dados: null }));
    req.end(payload || undefined);
  });
}

// Lança GRM_BLOQUEIO_REDE (e só ele) quando a Cloudflare barra a conferência: a entrega volta para
// "pendente" com o token guardado e a contagem de tentativas intacta — assim enviar o token pelo
// painel durante o bloqueio não o perde; ele é aplicado sozinho quando o IP for liberado.
async function receberTokenEntregue(p, validar) {
  if (String(process.env.GRM_TOKEN_ENTREGA || '').toLowerCase() === 'off') return null;
  const cfg = configSupabase();
  if (!cfg) return null;
  try {
    const lista = await restSupabase(cfg, 'GET', 'grm_token_entregas?select=id,tentativas&status=eq.pendente&token=not.is.null&order=enviado_em.desc&limit=1');
    if (!lista.ok || !Array.isArray(lista.dados) || !lista.dados.length) return null;
    const { id, tentativas } = lista.dados[0];

    const tomada = await restSupabase(cfg, 'PATCH', `grm_token_entregas?id=eq.${encodeURIComponent(id)}&status=eq.pendente`, { status: 'processando', tentativas: (Number(tentativas) || 0) + 1 });
    if (!tomada.ok || !Array.isArray(tomada.dados) || !tomada.dados.length) return null; // outro processo levou
    const token = String(tomada.dados[0].token || '');
    const tentativa = Number(tomada.dados[0].tentativas) || 1;
    const fechar = (status, mensagem, extra = {}) => restSupabase(cfg, 'PATCH', `grm_token_entregas?id=eq.${encodeURIComponent(id)}`, { status, mensagem, token: null, aplicado_em: new Date().toISOString(), ...extra });

    const agora = Date.now();
    const expira = expiraEm(token, agora);
    if (!token || expira <= agora) {
      await fechar('expirado', 'O token enviado já estava vencido. Entre no GRM de novo e envie outro.');
      return null;
    }

    const aceito = await validar(token, true);
    if (aceito === BLOQUEIO_REDE) {
      await restSupabase(cfg, 'PATCH', `grm_token_entregas?id=eq.${encodeURIComponent(id)}`, {
        status: 'pendente',
        tentativas: Math.max(0, tentativa - 1),
        mensagem: 'Aguardando a Cloudflare do GRM liberar o IP do servidor. O token fica guardado e é aplicado sozinho quando o bloqueio sair.',
      });
      throw registrarBloqueioRede(p, 'HTTP 403 da Cloudflare ao conferir o token enviado pelo painel');
    }
    if (aceito === false) {
      await fechar('recusado', 'O GRM recusou este token. Entre no GRM de novo e envie outro.');
      log('token entregue pelo painel foi recusado pelo GRM.');
      return null;
    }
    if (aceito === null || aceito === undefined) {
      if (tentativa >= ENTREGA_TENTATIVAS_MAX) {
        await fechar('recusado', 'Não consegui confirmar o token no GRM (rede/erro do GRM) depois de várias tentativas. Envie de novo.');
      } else {
        await restSupabase(cfg, 'PATCH', `grm_token_entregas?id=eq.${encodeURIComponent(id)}`, { status: 'pendente', mensagem: 'Aguardando confirmação do GRM (nova tentativa na próxima execução).' });
      }
      return null;
    }

    gravarJson(p.token, { token, savedAt: agora, expiraEm: expira });
    apagar(p.cooldown);
    await fechar('aplicado', `Aplicado no servidor. Válido até ${formatarBrasilia(expira)} (Brasília).`);
    await restSupabase(cfg, 'PATCH', 'grm_token_entregas?status=eq.pendente', { status: 'substituido', token: null, mensagem: 'Substituído por uma entrega mais nova.' });
    log(`token entregue pelo painel aplicado (válido até ${new Date(expira).toISOString()}).`);
    return token;
  } catch (error) {
    if (error && error.codigo === CODIGO_BLOQUEIO_REDE) throw error;
    log(`entrega pelo painel indisponível: ${String(error && error.message).slice(0, 120)}`);
    return null;
  }
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

/**
 * @param {{ login?: () => Promise<any>, validar?: (token: any, estrito?: boolean) => Promise<any>, sondar?: () => Promise<string> }} [opcoes]
 */
async function obterTokenGrm({ login, validar = tokenAindaValido, sondar = sondarRede } = {}) {
  if (typeof login !== 'function') throw new Error('obterTokenGrm: informe a função login.');
  if (String(process.env.GRM_TOKEN_CACHE || '').toLowerCase() === 'off') return login();

  const p = paths();
  await exigirRedeLiberada(p, sondar); // lança GRM_BLOQUEIO_REDE durante a espera
  const emCache = await tokenEmCache(p, validar);
  if (emCache) { limparBloqueioRede(p); return emCache; }
  const entregue = await receberTokenEntregue(p, validar);
  if (entregue) { limparBloqueioRede(p); return entregue; }

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
      limparBloqueioRede(p);
      log('login realizado e token salvo em cache.');
      return token;
    } catch (error) {
      // 403 em HTML da Cloudflare não é "login recusado": é a rede. Sem cooldown de login; só a espera do bloqueio.
      if (await loginFalhouPorBloqueioDeRede(error, sondar)) {
        throw error && error.codigo === CODIGO_BLOQUEIO_REDE ? error : registrarBloqueioRede(p, 'HTTP 403 da Cloudflare no login');
      }
      // Login recusado pelo GRM (captcha, senha, bloqueio): não insistir a cada execução.
      if (/recusado|captcha/i.test(String(error && error.message))) {
        gravarJson(p.cooldown, { ate: Date.now() + COOLDOWN_MS, motivo: String(error.message).slice(0, 200) });
        if (/captcha/i.test(String(error.message))) {
          error.message += ' — grave um token de sessão do navegador: node grm-token-cache.js salvar';
        }
      }
      throw error;
    }
  } finally {
    apagar(p.lock);
  }
}

// Há token de sessão utilizável em cache (ou entregue pelo painel)? Não tenta login (o Turnstile
// barra) nem mexe em lock/cooldown: serve para o agente adiar o trabalho em vez de falhar quando o
// token do dia ainda não foi gravado (node grm-token-cache.js salvar, ou o envio pelo painel).
// Em bloqueio de rede devolve false (não há como usar o GRM agora): quem chama adia, como sem token.
async function tokenGrmEmCacheValido({ validar = tokenAindaValido, sondar = sondarRede } = {}) {
  if (String(process.env.GRM_TOKEN_CACHE || '').toLowerCase() === 'off') return true;
  const p = paths();
  try {
    await exigirRedeLiberada(p, sondar);
    const valido = Boolean(await tokenEmCache(p, validar)) || Boolean(await receberTokenEntregue(p, validar));
    if (valido) limparBloqueioRede(p);
    return valido;
  } catch (error) {
    if (error && error.codigo === CODIGO_BLOQUEIO_REDE) return false;
    throw error;
  }
}

function limparTokenGrm() {
  apagar(paths().token);
}

function lerTokenDoTerminal() {
  return new Promise((resolve) => {
    if (process.env.GRM_TOKEN) return resolve(process.env.GRM_TOKEN);
    if (process.stdin.isTTY) process.stderr.write('Cole o token e tecle Enter (não será exibido de volta): ');
    let dados = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      dados += chunk;
      if (dados.includes('\n')) { process.stdin.pause(); resolve(dados); }
    });
    process.stdin.on('end', () => resolve(dados));
  });
}

async function salvarTokenManual() {
  const args = process.argv.slice(3);
  const i = args.indexOf('--validade-horas');
  const horas = i >= 0 ? Number(args[i + 1]) : 0;
  if (i >= 0 && !(horas > 0)) { console.error('Informe um número de horas > 0 em --validade-horas.'); return 1; }

  const token = String(await lerTokenDoTerminal()).trim().replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  if (!token || /\s/.test(token)) { console.error('Token vazio ou inválido (não deve ter espaços).'); return 1; }
  if (!process.env.GRMSERVER_USER) require('dotenv').config();
  if (!process.env.GRMSERVER_USER) { console.error('GRMSERVER_USER não definido (.env) — o cache é por usuário.'); return 1; }

  const agora = Date.now();
  const expJwt = expiraEm(token, agora);
  const expira = horas > 0 ? agora + horas * 3600000 : expJwt;
  if (expira <= agora) { console.error('Token já expirado.'); return 1; }
  const aceito = await tokenAindaValido(token, true);
  if (aceito === BLOQUEIO_REDE) {
    console.error('A Cloudflare do GRM está bloqueando o IP deste servidor: não dá para conferir o token agora e nada foi salvo. Envie pelo painel (favorito "Enviar token GRM"): o token fica guardado e é aplicado sozinho quando o bloqueio sair.');
    return 1;
  }
  if (aceito === false) { console.error('O GRM recusou este token — nada foi salvo.'); return 1; }
  if (aceito === null) { console.error('Não consegui confirmar o token no GRM (rede/erro do GRM) — nada foi salvo; tente de novo.'); return 1; }

  const p = paths();
  gravarJson(p.token, { token, savedAt: agora, expiraEm: expira });
  apagar(p.cooldown);
  console.log(`Token salvo. Válido até ${new Date(expira).toISOString()} (${horas > 0 ? 'informado' : (expJwt === agora + MAX_AGE_MS ? 'padrão: token sem exp' : 'exp do JWT')}).`);
  return 0;
}

module.exports = {
  obterTokenGrm, limparTokenGrm, tokenGrmEmCacheValido, receberTokenEntregue,
  tokenAindaValido, sondarRede, respostaDeBloqueioDeRede, BLOQUEIO_REDE, CODIGO_BLOQUEIO_REDE,
};

if (require.main === module) {
  if (process.argv[2] === 'salvar') {
    salvarTokenManual().then((code) => process.exit(code)).catch((e) => { console.error(e.message); process.exit(1); });
  } else if (process.argv[2] === 'receber') {
    // Busca agora a entrega pendente do painel (os agentes já fazem isso sozinhos ao faltar token).
    if (!process.env.GRMSERVER_USER || !process.env.SUPABASE_URL) require('dotenv').config();
    if (!process.env.GRMSERVER_USER) { console.error('GRMSERVER_USER não definido (.env) — o cache é por usuário.'); process.exit(1); }
    receberTokenEntregue(paths(), tokenAindaValido)
      .then((token) => { console.log(token ? 'Token do painel aplicado no cache.' : 'Nada aplicado (sem entrega pendente, token recusado ou GRM sem resposta — veja o status em TI > Integrações).'); process.exit(token ? 0 : 2); })
      .catch((e) => { console.error(e.message); process.exit(e && e.codigo === CODIGO_BLOQUEIO_REDE ? 3 : 1); });
  } else {
    console.error('Uso: node grm-token-cache.js salvar [--validade-horas N] | receber');
    process.exit(1);
  }
}
