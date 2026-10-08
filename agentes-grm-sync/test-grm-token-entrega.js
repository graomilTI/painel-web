'use strict';
// Teste da entrega do token do GRM pelo painel (grm-token-cache.js -> receberTokenEntregue).
// Sobe um PostgREST de mentira em http://127.0.0.1 e confere o que o servidor grava e devolve.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-token-entrega-'));
process.env.GRM_TOKEN_CACHE_DIR = dir;
process.env.GRMSERVER_USER = 'teste@exemplo.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';
delete process.env.GRM_TOKEN_CACHE;
delete process.env.GRM_TOKEN_ENTREGA;

const { obterTokenGrm, tokenGrmEmCacheValido, receberTokenEntregue } = require('./grm-token-cache');

function jwt(expSeg) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ userEmail: 'teste@exemplo.com', userCode: 1, exp: expSeg })}.assinatura`;
}
const daquiUmaHora = () => Math.floor(Date.now() / 1000) + 3600;

let rows = [];
let chamadas = [];
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  chamadas.push(`${req.method} ${url.pathname}${url.search}`);
  const filtros = [...url.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit'].includes(k));
  const casa = (r) => filtros.every(([k, v]) => {
    if (v === 'not.is.null') return r[k] !== null && r[k] !== undefined;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    return true;
  });
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    assert.equal(req.headers.apikey, 'chave-de-teste');
    assert.equal(url.pathname, '/rest/v1/grm_token_entregas');
    let saida = [];
    if (req.method === 'GET') {
      saida = rows.filter(casa).sort((a, b) => b.enviado_em.localeCompare(a.enviado_em)).slice(0, Number(url.searchParams.get('limit')) || 1000)
        .map((r) => ({ id: r.id, tentativas: r.tentativas }));
    } else if (req.method === 'PATCH') {
      const patch = JSON.parse(corpo);
      for (const r of rows.filter(casa)) { Object.assign(r, patch); saida.push({ ...r }); }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(saida));
  });
});

const jwtDeBoa = (r) => r.tokenOriginal;
const nova = (over = {}) => ({ id: `id-${Math.random().toString(16).slice(2)}`, token: jwt(daquiUmaHora()), status: 'pendente', tentativas: 0, enviado_em: new Date().toISOString(), mensagem: null, ...over });
const guardar = (r) => { r.tokenOriginal = r.token; return r; };
function limpar() {
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  rows = []; chamadas = [];
}
const arquivoToken = () => fs.readdirSync(dir).find((f) => f.startsWith('.grm-token-') && f.endsWith('.json'));
const chaveUsuario = require('crypto').createHash('sha1').update(process.env.GRMSERVER_USER).digest('hex').slice(0, 12);

(async () => {
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}`;
  // 1) entrega válida: aplica, grava o cache, apaga o token da tabela e substitui as outras pendentes
  limpar();
  const boa = guardar(nova({ enviado_em: '2026-10-08T03:00:00.000Z' }));
  const antiga = guardar(nova({ enviado_em: '2026-10-08T02:00:00.000Z' }));
  rows = [antiga, boa];
  let token = await receberTokenEntregue({ token: path.join(dir, '.grm-token-t1.json'), cooldown: path.join(dir, '.cd') }, async () => true);
  assert.ok(token, 'devolve o token');
  assert.ok(token === jwtDeBoa(boa), 'devolve o token da entrega mais recente');
  const salvo = JSON.parse(fs.readFileSync(path.join(dir, '.grm-token-t1.json'), 'utf8'));
  assert.equal(salvo.token, token);
  assert.ok(salvo.expiraEm > Date.now(), 'expiraEm no futuro');
  assert.equal(boa.status, 'aplicado');
  assert.equal(boa.token, null, 'token apagado da tabela');
  assert.match(boa.mensagem, /Válido até/);
  assert.equal(antiga.status, 'substituido');
  assert.equal(antiga.token, null);

  // 2) o GRM recusa: marca recusado, apaga o token, não grava cache
  limpar();
  const ruim = nova();
  rows = [ruim];
  token = await receberTokenEntregue({ token: path.join(dir, '.grm-token-t2.json'), cooldown: path.join(dir, '.cd') }, async () => false);
  assert.equal(token, null);
  assert.equal(ruim.status, 'recusado');
  assert.equal(ruim.token, null);
  assert.equal(fs.existsSync(path.join(dir, '.grm-token-t2.json')), false);

  // 3) GRM sem resposta definitiva: volta para pendente (tentativas+1); na 5ª vira recusado
  limpar();
  const incerta = nova();
  rows = [incerta];
  token = await receberTokenEntregue({ token: path.join(dir, '.grm-token-t3.json'), cooldown: path.join(dir, '.cd') }, async () => null);
  assert.equal(token, null);
  assert.equal(incerta.status, 'pendente');
  assert.equal(incerta.tentativas, 1);
  assert.ok(incerta.token, 'continua guardado para a próxima tentativa');
  incerta.tentativas = 4;
  await receberTokenEntregue({ token: path.join(dir, '.grm-token-t3.json'), cooldown: path.join(dir, '.cd') }, async () => null);
  assert.equal(incerta.status, 'recusado');
  assert.equal(incerta.token, null);

  // 4) token já vencido
  limpar();
  const vencida = nova({ token: jwt(Math.floor(Date.now() / 1000) - 60) });
  rows = [vencida];
  let chamouValidar = false;
  token = await receberTokenEntregue({ token: path.join(dir, '.grm-token-t4.json'), cooldown: path.join(dir, '.cd') }, async () => { chamouValidar = true; return true; });
  assert.equal(token, null);
  assert.equal(chamouValidar, false, 'não gasta chamada no GRM com token vencido');
  assert.equal(vencida.status, 'expirado');
  assert.equal(vencida.token, null);

  // 5) sem entrega pendente / sem token: nada acontece
  limpar();
  rows = [nova({ status: 'aplicado', token: null })];
  assert.equal(await receberTokenEntregue({ token: path.join(dir, '.grm-token-t5.json'), cooldown: path.join(dir, '.cd') }, async () => true), null);
  assert.deepEqual(chamadas, ['GET /rest/v1/grm_token_entregas?select=id,tentativas&status=eq.pendente&token=not.is.null&order=enviado_em.desc&limit=1']);

  // 6) duas execuções ao mesmo tempo: só uma leva a entrega
  limpar();
  const unica = nova();
  rows = [unica];
  const [a, b] = await Promise.all([
    receberTokenEntregue({ token: path.join(dir, '.grm-token-t6.json'), cooldown: path.join(dir, '.cd') }, async () => true),
    receberTokenEntregue({ token: path.join(dir, '.grm-token-t6.json'), cooldown: path.join(dir, '.cd') }, async () => true),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1, 'exatamente uma execução aplica');
  assert.equal(unica.status, 'aplicado');

  // 7) falha silenciosa: servidor fora do ar, sem .env e kill-switch
  limpar();
  rows = [nova()];
  const urlOk = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'http://127.0.0.1:1';
  assert.equal(await receberTokenEntregue({ token: path.join(dir, '.grm-token-t7.json'), cooldown: path.join(dir, '.cd') }, async () => true), null);
  delete process.env.SUPABASE_URL;
  assert.equal(await receberTokenEntregue({ token: path.join(dir, '.grm-token-t7.json'), cooldown: path.join(dir, '.cd') }, async () => true), null);
  process.env.SUPABASE_URL = urlOk;
  process.env.GRM_TOKEN_ENTREGA = 'off';
  assert.equal(await receberTokenEntregue({ token: path.join(dir, '.grm-token-t7.json'), cooldown: path.join(dir, '.cd') }, async () => true), null);
  assert.equal(rows[0].status, 'pendente', 'nada foi tocado');
  delete process.env.GRM_TOKEN_ENTREGA;

  // 8) integração: sem token em cache, obterTokenGrm usa a entrega e NÃO tenta login; depois reaproveita o cache
  limpar();
  const entrega = guardar(nova());
  rows = [entrega];
  let logins = 0;
  const login = () => { logins += 1; return Promise.reject(new Error('captcha_invalid')); };
  const tk = await obterTokenGrm({ login, validar: async () => true });
  assert.equal(tk, entrega.tokenOriginal);
  assert.equal(logins, 0, 'não fez login');
  assert.ok(arquivoToken(), 'cache gravado');
  chamadas = [];
  assert.equal(await obterTokenGrm({ login, validar: async () => true }), entrega.tokenOriginal);
  assert.deepEqual(chamadas, [], 'com cache válido nem consulta o Supabase');

  // 9) tokenGrmEmCacheValido também enxerga a entrega
  limpar();
  rows = [nova()];
  assert.equal(await tokenGrmEmCacheValido({ validar: async () => true }), true);

  // 10) cooldown de login recusado não impede a entrega
  limpar();
  fs.writeFileSync(path.join(dir, `.grm-login-cooldown-${chaveUsuario}.json`), JSON.stringify({ ate: Date.now() + 600000, motivo: 'captcha_invalid' }));
  rows = [nova()];
  const tk2 = await obterTokenGrm({ login, validar: async () => true });
  assert.ok(tk2);
  assert.equal(fs.existsSync(path.join(dir, `.grm-login-cooldown-${chaveUsuario}.json`)), false, 'cooldown removido');

  console.log('ok test-grm-token-entrega');
  servidor.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); servidor.close(); process.exit(1); });
