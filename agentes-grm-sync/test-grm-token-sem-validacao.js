'use strict';
// Teste do modo padrão do grm-token-cache.js: o token em cache NÃO é conferido no GRM a cada execução.
// Motivo: a conferência usava supervision/getForSelect, rota que as novas regras do GRM recusam (403 em
// JSON), e o 403 era lido como "token recusado" — gastaria as 4 emissões diárias de token.
// O token só é conferido quando há suspeita (marca do worker após 401, ou o mesmo processo pedindo o
// token de novo) ou com GRM_TOKEN_VALIDAR=on.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-token-semval-'));
process.env.GRM_TOKEN_CACHE_DIR = dir;
process.env.GRMSERVER_USER = 'teste@exemplo.com';
process.env.GRM_TOKEN_ENTREGA = 'off';
delete process.env.GRM_TOKEN_CACHE;
delete process.env.GRM_TOKEN_VALIDAR;

// GRM de mentira que se comporta como nas novas regras: supervision/getForSelect é recusada (403 JSON).
let modo = 'rota-recusada'; // 'rota-recusada' | 'liberado'
let tokenBom = '';
let chamadas = [];
const grm = http.createServer((req, res) => {
  chamadas.push(`${req.method} ${req.url}`);
  req.resume();
  req.on('end', () => {
    if (modo === 'rota-recusada') {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end('{"result":false,"message":"integration_route_not_allowed"}');
    }
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth && auth === tokenBom) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"result":true}'); }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end('{"code":"credentials_required","status":401}');
  });
});

function jwt(expSeg) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ userEmail: 'teste@exemplo.com', userCode: 1, exp: expSeg, n: Math.random() })}.assinatura`;
}
const daquiUmaHora = () => Math.floor(Date.now() / 1000) + 3600;
const chave = crypto.createHash('sha1').update(process.env.GRMSERVER_USER).digest('hex').slice(0, 12);
const arqToken = path.join(dir, `.grm-token-${chave}.json`);
const arqSuspeito = path.join(dir, `.grm-token-suspeito-${chave}.json`);
function limpar() {
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  chamadas = [];
  modo = 'rota-recusada';
}
function gravarToken(token) {
  fs.writeFileSync(arqToken, JSON.stringify({ token, savedAt: Date.now() }));
}
// O módulo guarda estado por processo (ultimoTokenDevolvido): recarregar simula um processo novo.
function carregar() {
  delete require.cache[require.resolve('./grm-token-cache')];
  return require('./grm-token-cache');
}

(async () => {
  await new Promise((r) => grm.listen(0, '127.0.0.1', r));
  process.env.GRMSERVER_API_URL = `http://127.0.0.1:${grm.address().port}/api/`;

  let logins = 0;
  const loginProibido = () => { logins += 1; return Promise.reject(new Error('login não deveria ser chamado')); };

  // 1) token em cache e rota de conferência recusada: usa o token sem chamar o GRM e sem login
  limpar();
  tokenBom = jwt(daquiUmaHora());
  gravarToken(tokenBom);
  let m = carregar();
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom, 'devolve o token em cache');
  assert.deepEqual(chamadas, [], 'nenhuma chamada ao GRM (a rota de conferência é recusada)');
  assert.equal(logins, 0);
  assert.ok(fs.existsSync(arqToken), 'o token continua em cache');

  // 2) perguntar se há token e depois obtê-lo não gera conferência no GRM
  m = carregar();
  assert.equal(await m.tokenGrmEmCacheValido(), true);
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom);
  assert.deepEqual(chamadas, [], 'perguntar e depois obter não gera conferência no GRM');

  // 3) token expirado (exp do JWT) é descartado sem chamar o GRM
  limpar();
  gravarToken(jwt(Math.floor(Date.now() / 1000) - 10));
  m = carregar();
  const erro = await m.obterTokenGrm({ login: loginProibido }).then(() => null, (e) => e);
  assert.match(String(erro && erro.message), /login não deveria/, 'sem token válido cai no login do agente');
  assert.equal(fs.existsSync(arqToken), false, 'token vencido apagado');
  assert.deepEqual(chamadas, []);

  // 4) o mesmo processo pede o token de novo (refazer login depois de 401): confere no GRM
  limpar();
  modo = 'liberado';
  tokenBom = jwt(daquiUmaHora());
  gravarToken(tokenBom);
  m = carregar();
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom);
  assert.deepEqual(chamadas, [], '1ª leitura: sem conferência');
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom, 'token ainda bom: segue com ele');
  assert.equal(chamadas.length, 1, '2ª leitura no mesmo processo: UMA conferência');
  // agora o GRM passa a recusar esse token (revogado): a próxima leitura o descarta e faz novo login
  tokenBom = 'outro-token';
  let loginsNovo = 0;
  const loginNovo = () => { loginsNovo += 1; return Promise.resolve('token-novo'); };
  assert.equal(await m.obterTokenGrm({ login: loginNovo }), 'token-novo', 'token revogado → novo login');
  assert.equal(loginsNovo, 1);
  assert.equal(JSON.parse(fs.readFileSync(arqToken, 'utf8')).token, 'token-novo');

  // 5) marca de suspeita (o worker grava depois de um job com 401): a 1ª leitura confere uma vez e apaga a marca
  limpar();
  modo = 'liberado';
  tokenBom = jwt(daquiUmaHora());
  gravarToken(tokenBom);
  m = carregar();
  m.marcarTokenSuspeito();
  assert.ok(fs.existsSync(arqSuspeito), 'marca gravada');
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom);
  assert.equal(chamadas.length, 1, 'com suspeita confere no GRM');
  assert.equal(fs.existsSync(arqSuspeito), false, 'marca apagada depois da conferência');
  m = carregar();
  chamadas = [];
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom);
  assert.deepEqual(chamadas, [], 'sem marca, volta a não conferir');

  // 6) suspeita + token recusado: descarta e vai para o login
  limpar();
  modo = 'liberado';
  tokenBom = 'o-bom';
  gravarToken(jwt(daquiUmaHora()));
  m = carregar();
  m.marcarTokenSuspeito();
  assert.equal(await m.obterTokenGrm({ login: () => Promise.resolve('novo-depois-da-suspeita') }), 'novo-depois-da-suspeita');
  assert.equal(fs.existsSync(arqSuspeito), false);

  // 7) GRM_TOKEN_VALIDAR=on volta ao comportamento antigo (confere a cada execução)
  limpar();
  modo = 'liberado';
  tokenBom = jwt(daquiUmaHora());
  gravarToken(tokenBom);
  process.env.GRM_TOKEN_VALIDAR = 'on';
  m = carregar();
  assert.equal(await m.obterTokenGrm({ login: loginProibido }), tokenBom);
  assert.equal(chamadas.length, 1, 'modo antigo: confere já na 1ª leitura');
  delete process.env.GRM_TOKEN_VALIDAR;

  // 8) 403 JSON "integration_*" (rota fora da lista) não é token recusado
  limpar();
  m = carregar();
  assert.equal(await m.tokenAindaValido('qualquer'), true, 'rota recusada ≠ token recusado (mantém o token)');
  assert.equal(await m.tokenAindaValido('qualquer', true), null, 'estrito: sem resposta definitiva sobre o token');

  // 9) sinais que fazem o worker marcar a suspeita
  const sinal = m.sinalDeTokenSuspeito;
  assert.equal(sinal('GRM respondeu HTTP 401: credentials_required'), true, '401');
  assert.equal(sinal('GRM retornou conteúdo inválido (HTTP 403).'), true, '403 sem JSON = Cloudflare');
  assert.equal(sinal('GRM retornou conteúdo inválido (HTTP 429).'), true, '429 sem JSON = Cloudflare');
  assert.equal(sinal('GRM respondeu HTTP 403: integration_route_not_allowed'), false, '403 JSON das novas regras');
  assert.equal(sinal('GRM respondeu HTTP 429: integration_quota_exceeded'), false, '429 JSON de cota');
  assert.equal(sinal('Script saiu com código 1'), false);

  grm.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('ok test-grm-token-sem-validacao');
})().catch((e) => { console.error(e); process.exit(1); });
