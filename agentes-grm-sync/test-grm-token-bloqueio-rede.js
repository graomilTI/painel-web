'use strict';
// Teste do bloqueio de rede do GRM (grm-token-cache.js): a Cloudflare barra o IP do servidor com
// 403 em HTML. Sobe um "GRM" de mentira em http://127.0.0.1 que ora responde como a Cloudflare
// (403 HTML "Sorry, you have been blocked"), ora como o GRM de verdade (401/200 em JSON), e um
// PostgREST de mentira para a tabela grm_token_entregas.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-token-bloqueio-'));
process.env.GRM_TOKEN_CACHE_DIR = dir;
process.env.GRMSERVER_USER = 'teste@exemplo.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';
delete process.env.GRM_TOKEN_CACHE;
delete process.env.GRM_TOKEN_ENTREGA;
delete process.env.GRM_REDE_BLOQUEIO_MAX_MIN;

const PAGINA_CLOUDFLARE = '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1></body></html>';

// ---------- GRM de mentira ----------
let modoGrm = 'cloudflare'; // 'cloudflare' | 'liberado' | 'cloudflare-429' | 'json403'
let tokenBom = '';
let chamadasGrm = [];
const grm = http.createServer((req, res) => {
  chamadasGrm.push(`${req.method} ${req.url} auth=${req.headers.authorization ? 'sim' : 'nao'}`);
  req.resume();
  req.on('end', () => {
    if (modoGrm === 'cloudflare') { res.writeHead(403, { 'content-type': 'text/html; charset=UTF-8' }); return res.end(PAGINA_CLOUDFLARE); }
    if (modoGrm === 'cloudflare-429') { res.writeHead(429, { 'content-type': 'text/html' }); return res.end(PAGINA_CLOUDFLARE); }
    if (modoGrm === 'json403') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"result":false,"message":"forbidden"}'); }
    // liberado: sem token = 401 JSON; token bom = 200; token ruim = 401
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth && auth === tokenBom) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"result":true}'); }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end('{"code":"credentials_required","status":401}');
  });
});

// ---------- PostgREST de mentira ----------
let rows = [];
const supa = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const filtros = [...url.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit'].includes(k));
  const casa = (r) => filtros.every(([k, v]) => {
    if (v === 'not.is.null') return r[k] !== null && r[k] !== undefined;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    return true;
  });
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let saida = [];
    if (req.method === 'GET') {
      saida = rows.filter(casa).sort((a, b) => b.enviado_em.localeCompare(a.enviado_em)).slice(0, Number(url.searchParams.get('limit')) || 1000).map((r) => ({ id: r.id, tentativas: r.tentativas }));
    } else if (req.method === 'PATCH') {
      const patch = JSON.parse(corpo);
      for (const r of rows.filter(casa)) { Object.assign(r, patch); saida.push({ ...r }); }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(saida));
  });
});

function jwt(expSeg) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ userEmail: 'teste@exemplo.com', userCode: 1, exp: expSeg })}.assinatura`;
}
const daquiUmaHora = () => Math.floor(Date.now() / 1000) + 3600;
const chave = crypto.createHash('sha1').update(process.env.GRMSERVER_USER).digest('hex').slice(0, 12);
const arqToken = path.join(dir, `.grm-token-${chave}.json`);
const arqBloqueio = path.join(dir, `.grm-rede-bloqueada-${chave}.json`);
const arqCooldown = path.join(dir, `.grm-login-cooldown-${chave}.json`);
const nova = (over = {}) => ({ id: `id-${Math.random().toString(16).slice(2)}`, token: jwt(daquiUmaHora()), status: 'pendente', tentativas: 0, enviado_em: new Date().toISOString(), mensagem: null, ...over });
function limpar() {
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  rows = []; chamadasGrm = []; modoGrm = 'cloudflare';
}
const lerBloqueio = () => JSON.parse(fs.readFileSync(arqBloqueio, 'utf8'));

(async () => {
  await Promise.all([
    new Promise((r) => grm.listen(0, '127.0.0.1', r)),
    new Promise((r) => supa.listen(0, '127.0.0.1', r)),
  ]);
  process.env.GRMSERVER_API_URL = `http://127.0.0.1:${grm.address().port}/api/`;
  process.env.SUPABASE_URL = `http://127.0.0.1:${supa.address().port}`;
  const m = require('./grm-token-cache');
  const { obterTokenGrm, tokenGrmEmCacheValido, receberTokenEntregue, tokenAindaValido, sondarRede, respostaDeBloqueioDeRede, BLOQUEIO_REDE, CODIGO_BLOQUEIO_REDE } = m;

  // 1) classificação da resposta
  assert.equal(respostaDeBloqueioDeRede(403, { 'content-type': 'text/html' }, ''), true, '403 HTML');
  assert.equal(respostaDeBloqueioDeRede(403, { 'content-type': 'application/json' }, PAGINA_CLOUDFLARE), true, '403 com assinatura da Cloudflare');
  assert.equal(respostaDeBloqueioDeRede(429, { 'content-type': 'text/html' }, ''), true, '429 HTML');
  assert.equal(respostaDeBloqueioDeRede(403, { 'content-type': 'application/json' }, '{"result":false}'), false, '403 JSON do GRM = token recusado');
  assert.equal(respostaDeBloqueioDeRede(401, { 'content-type': 'text/html' }, ''), false, '401 nunca é bloqueio');
  assert.equal(respostaDeBloqueioDeRede(200, { 'content-type': 'text/html' }, PAGINA_CLOUDFLARE), false, '200 nunca é bloqueio');

  // 2) tokenAindaValido / sondarRede contra o GRM de mentira
  limpar();
  assert.equal(await tokenAindaValido('qualquer'), BLOQUEIO_REDE, 'Cloudflare → BLOQUEIO_REDE (não "false")');
  assert.equal(await tokenAindaValido('qualquer', true), BLOQUEIO_REDE);
  assert.equal(await sondarRede(), 'bloqueada');
  assert.ok(chamadasGrm.some((c) => c.endsWith('auth=nao')), 'a sondagem não leva token');
  modoGrm = 'cloudflare-429';
  assert.equal(await tokenAindaValido('qualquer'), BLOQUEIO_REDE);
  modoGrm = 'json403';
  assert.equal(await tokenAindaValido('qualquer'), false, '403 em JSON continua sendo token recusado');
  assert.equal(await sondarRede(), 'liberada', '403 JSON = a aplicação respondeu');
  modoGrm = 'liberado';
  tokenBom = jwt(daquiUmaHora());
  assert.equal(await tokenAindaValido(tokenBom), true);
  assert.equal(await tokenAindaValido('outro'), false, '401 JSON = token recusado');
  assert.equal(await sondarRede(), 'liberada');

  // 3) token em cache bom + bloqueio: NÃO apaga o token, lança GRM_BLOQUEIO_REDE e grava a espera de 2 min
  limpar();
  tokenBom = jwt(daquiUmaHora());
  fs.writeFileSync(arqToken, JSON.stringify({ token: tokenBom, savedAt: Date.now() }));
  let logins = 0;
  const login = () => { logins += 1; return Promise.reject(new Error('captcha_invalid')); };
  let erro = await obterTokenGrm({ login }).then(() => null, (e) => e);
  assert.ok(erro, 'lançou');
  assert.equal(erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.match(erro.message, /^GRM_BLOQUEIO_REDE: /);
  assert.ok(fs.existsSync(arqToken), 'o token em cache foi preservado (antes era apagado)');
  assert.equal(logins, 0, 'não tentou login');
  assert.equal(fs.existsSync(arqCooldown), false, 'não é cooldown de login recusado');
  let b = lerBloqueio();
  assert.equal(b.falhas, 1);
  assert.ok(b.ate - Date.now() > 100000 && b.ate - Date.now() <= 120500, 'primeira espera ≈ 2 min');

  // 4) durante a espera: falha na hora, SEM chamar o GRM
  chamadasGrm = [];
  erro = await obterTokenGrm({ login }).then(() => null, (e) => e);
  assert.equal(erro && erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.deepEqual(chamadasGrm, [], 'disjuntor aberto: nenhuma chamada ao GRM');
  assert.equal(await tokenGrmEmCacheValido(), false, 'quem adia (retroativas/NHE) recebe false, não exceção');
  assert.deepEqual(chamadasGrm, []);

  // 5) espera vencida e rede ainda bloqueada: UMA sondagem sem token, espera sobe para 5 min
  fs.writeFileSync(arqBloqueio, JSON.stringify({ ...b, ate: Date.now() - 1000 }));
  chamadasGrm = [];
  erro = await obterTokenGrm({ login }).then(() => null, (e) => e);
  assert.equal(erro && erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.equal(chamadasGrm.length, 1, 'uma única chamada');
  assert.ok(chamadasGrm[0].endsWith('auth=nao'), 'sem token');
  b = lerBloqueio();
  assert.equal(b.falhas, 2);
  assert.ok(b.ate - Date.now() > 290000 && b.ate - Date.now() <= 300500, 'segunda espera ≈ 5 min');
  fs.writeFileSync(arqBloqueio, JSON.stringify({ ...b, ate: Date.now() - 1000 }));
  await obterTokenGrm({ login }).then(() => null, (e) => e);
  b = lerBloqueio();
  assert.equal(b.falhas, 3);
  assert.ok(b.ate - Date.now() > 590000 && b.ate - Date.now() <= 600500, 'terceira espera ≈ 10 min');
  fs.writeFileSync(arqBloqueio, JSON.stringify({ ...b, ate: Date.now() - 1000 }));
  await obterTokenGrm({ login }).then(() => null, (e) => e);
  b = lerBloqueio();
  assert.equal(b.falhas, 4);
  assert.ok(b.ate - Date.now() <= 600500, 'teto de 10 min');

  // 6) rede liberada: a sondagem apaga a marca e o token em cache bom volta a ser usado, sem login
  fs.writeFileSync(arqBloqueio, JSON.stringify({ ...b, ate: Date.now() - 1000 }));
  modoGrm = 'liberado';
  const tk = await obterTokenGrm({ login });
  assert.equal(tk, tokenBom, 'o mesmo token que estava em cache (não foi perdido)');
  assert.equal(logins, 0);
  assert.equal(fs.existsSync(arqBloqueio), false, 'marca de bloqueio removida');

  // 7) sondagem incerta (GRM fora do ar): segue o fluxo normal e a marca fica reservada por ~60 s
  limpar();
  fs.writeFileSync(arqBloqueio, JSON.stringify({ desde: Date.now() - 600000, ate: Date.now() - 1000, falhas: 2, motivo: 'x' }));
  const tk2 = jwt(daquiUmaHora());
  fs.writeFileSync(arqToken, JSON.stringify({ token: tk2, savedAt: Date.now() }));
  const r7 = await obterTokenGrm({ login, sondar: async () => 'incerta', validar: async () => true });
  assert.equal(r7, tk2);
  assert.equal(fs.existsSync(arqBloqueio), false, 'sucesso limpa a marca');

  // 8) entrega do painel durante o bloqueio: fica PENDENTE com o token guardado e as tentativas intactas
  limpar();
  const entrega = nova({ tentativas: 1 });
  rows = [entrega];
  const original = entrega.token;
  erro = await obterTokenGrm({ login }).then(() => null, (e) => e);
  assert.equal(erro && erro.codigo, CODIGO_BLOQUEIO_REDE, 'sem token em cache: a entrega bate no bloqueio');
  assert.equal(entrega.status, 'pendente', 'não virou "recusado"');
  assert.equal(entrega.token, original, 'token continua guardado na tabela');
  assert.equal(entrega.tentativas, 1, 'tentativas não foram gastas');
  assert.match(entrega.mensagem, /Cloudflare/);
  assert.equal(fs.existsSync(arqToken), false);
  assert.equal(logins, 0, 'nem tentou login');

  // 9) rede liberada: a entrega guardada é aplicada sozinha
  fs.writeFileSync(arqBloqueio, JSON.stringify({ ...lerBloqueio(), ate: Date.now() - 1000 }));
  modoGrm = 'liberado';
  tokenBom = original;
  const aplicado = await obterTokenGrm({ login });
  assert.equal(aplicado, original);
  assert.equal(entrega.status, 'aplicado');
  assert.equal(entrega.token, null, 'token apagado da tabela só agora');
  assert.equal(fs.existsSync(arqBloqueio), false);
  assert.ok(fs.existsSync(arqToken));

  // 10) login do script com 403 em HTML + sondagem confirma bloqueio → GRM_BLOQUEIO_REDE (não vira cooldown de login)
  limpar();
  modoGrm = 'cloudflare';
  const loginHtml = () => Promise.reject(new Error('GRM user/login retornou conteúdo inválido (HTTP 403): <!DOCTYPE html>'));
  erro = await obterTokenGrm({ login: loginHtml, validar: async () => true }).then(() => null, (e) => e);
  assert.equal(erro && erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.ok(fs.existsSync(arqBloqueio));
  assert.equal(fs.existsSync(arqCooldown), false, 'não gravou cooldown de login');

  // 11) mesma mensagem de login, mas a rede está liberada (era outra coisa): segue o caminho antigo, sem marca de bloqueio
  limpar();
  modoGrm = 'liberado';
  const loginCaptcha = () => Promise.reject(new Error('GRM user/login recusado: captcha_invalid'));
  erro = await obterTokenGrm({ login: loginCaptcha, validar: async () => true }).then(() => null, (e) => e);
  assert.ok(erro && /captcha_invalid/.test(erro.message), 'mantém o erro de captcha');
  assert.notEqual(erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.ok(fs.existsSync(arqCooldown), 'cooldown de login recusado continua valendo');
  assert.equal(fs.existsSync(arqBloqueio), false);
  const loginHtml2 = () => Promise.reject(new Error('GRM retornou conteúdo inválido (HTTP 403).'));
  limpar();
  modoGrm = 'liberado';
  erro = await obterTokenGrm({ login: loginHtml2, validar: async () => true }).then(() => null, (e) => e);
  assert.notEqual(erro && erro.codigo, CODIGO_BLOQUEIO_REDE, 'sondagem diz que a rede está liberada: não é bloqueio');
  assert.equal(fs.existsSync(arqBloqueio), false);

  // 12) token recusado de verdade (401 JSON) continua sendo apagado como antes
  limpar();
  modoGrm = 'liberado';
  tokenBom = 'token-diferente';
  fs.writeFileSync(arqToken, JSON.stringify({ token: jwt(daquiUmaHora()), savedAt: Date.now() }));
  erro = await obterTokenGrm({ login: () => Promise.reject(new Error('captcha_invalid')) }).then(() => null, (e) => e);
  assert.ok(erro && /captcha_invalid/.test(erro.message));
  assert.equal(fs.existsSync(arqToken), false, 'token recusado pelo GRM é descartado');

  // 13) validar injetado devolvendo BLOQUEIO_REDE em receberTokenEntregue sem p.bloqueio (chamada solta): lança, não grava arquivo
  limpar();
  rows = [nova()];
  erro = await receberTokenEntregue({ token: path.join(dir, '.t'), cooldown: path.join(dir, '.c') }, async () => BLOQUEIO_REDE).then(() => null, (e) => e);
  assert.equal(erro && erro.codigo, CODIGO_BLOQUEIO_REDE);
  assert.equal(rows[0].status, 'pendente');
  assert.equal(rows[0].tentativas, 0);

  console.log('ok test-grm-token-bloqueio-rede');
  grm.close(); supa.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); grm.close(); supa.close(); process.exit(1); });
