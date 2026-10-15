'use strict';
// Teste do preload de saída (grm-egress-proxy.js): roda processos filhos reais com `node -r` e confere o que passa
// pelo proxy (só o host do GRM, só para o agente listado), o fallback e a rota do disjuntor.
// O par chave/certificado de test-fixtures/ é só de teste (autoassinado, CN=localhost).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const { execFile } = require('child_process');
const { criarProxy } = require('./worker/tunel-escritorio/proxy-saida');

const KEY = fs.readFileSync(path.join(__dirname, 'test-fixtures', 'localhost.key'), 'utf8');
const CERT = fs.readFileSync(path.join(__dirname, 'test-fixtures', 'localhost.crt'), 'utf8');

const PRELOAD = path.join(__dirname, 'grm-egress-proxy.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-egress-'));
const cfgPath = path.join(dir, 'cfg.json');

function rodar(env, codigo) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['-r', PRELOAD, '-e', codigo], { env: { PATH: process.env.PATH, GRM_EGRESS_CONFIG: cfgPath, ...env }, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ codigo: err ? err.code || 1 : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

(async () => {
  // "GRM" de mentira com TLS
  const alvo = tls.createServer({ key: KEY, cert: CERT }, (s) => {
    s.once('data', () => s.end(['HTTP/1.1 200 OK', 'content-type: text/plain', 'content-length: 7', 'connection: close', '', 'ALVO-OK'].join('\r\n')));
    s.on('error', () => {});
  });
  await new Promise((r) => alvo.listen(0, '127.0.0.1', r));
  const portaAlvo = alvo.address().port;
  const proxy = criarProxy({ permitidos: ['localhost'], portas: [portaAlvo], aceitarPrivados: true, resolver: async () => ['127.0.0.1'] });
  await new Promise((r) => proxy.server.listen(0, '127.0.0.1', r));
  const portaProxy = proxy.server.address().port;

  const escreverCfg = (extra = {}) => fs.writeFileSync(cfgPath, JSON.stringify({ enabled: true, proxy: `127.0.0.1:${portaProxy}`, agentes: ['agente-a'], hosts: ['localhost'], ...extra }));
  const prefixo = `
    const https = require('https');
    const ca = process.env.CA_TESTE;
    const cb = (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => console.log('RESP', res.statusCode, b, 'ROTA=' + (process.env.GRM_EGRESS_ROTA || '-'))); };
    const erro = (e) => { console.log('ERRO', e.code || e.message); process.exit(3); };
    const opts = { ca, rejectUnauthorized: true };
  `;
  const FORMAS = {
    options: `https.request({ hostname: 'localhost', port: ${portaAlvo}, path: '/x', ...opts }, cb).on('error', erro).end();`,
    urlString: `https.get('https://localhost:${portaAlvo}/x', opts, cb).on('error', erro);`,
    urlObj: `https.request(new URL('https://localhost:${portaAlvo}/x'), opts, cb).on('error', erro).end();`,
  };
  const codigoDe = (k) => prefixo + FORMAS[k];
  const base = { CA_TESTE: CERT };

  // 1) agente listado: passa pelo proxy nas 3 formas de chamada, com a rota "tunel"
  escreverCfg();
  for (const forma of Object.keys(FORMAS)) {
    const antes = proxy.stats.conectados;
    const r = await rodar({ ...base, GRM_AGENTE_ID: 'agente-a' }, codigoDe(forma));
    assert.match(r.stdout, /RESP 200 ALVO-OK ROTA=tunel/, `forma ${forma}: ${r.stdout} ${r.stderr}`);
    assert.equal(proxy.stats.conectados, antes + 1, `forma ${forma} deveria usar o proxy`);
    assert.match(r.stdout, /\[egress\] GRM via túnel/);
  }

  // 2) agente fora da lista / enabled=false / sem config / host fora de "hosts": sai direto, sem proxy e sem rota
  const casos = [
    ['agente fora da lista', () => escreverCfg(), { GRM_AGENTE_ID: 'agente-b' }],
    ['enabled=false', () => escreverCfg({ enabled: false }), { GRM_AGENTE_ID: 'agente-a' }],
    ['sem GRM_AGENTE_ID', () => escreverCfg(), {}],
    ['host fora de hosts', () => escreverCfg({ hosts: ['outro.test'] }), { GRM_AGENTE_ID: 'agente-a' }],
    ['sem arquivo de config', () => fs.rmSync(cfgPath, { force: true }), { GRM_AGENTE_ID: 'agente-a' }],
  ];
  for (const [nome, prep, env] of casos) {
    prep();
    const antes = proxy.stats.conectados;
    const r = await rodar({ ...base, ...env }, codigoDe('options'));
    const rotaSo = nome === 'host fora de hosts' ? /RESP 200 ALVO-OK ROTA=tunel/ : /RESP 200 ALVO-OK ROTA=-/;
    assert.match(r.stdout, rotaSo, `${nome}: ${r.stdout} ${r.stderr}`);
    assert.equal(proxy.stats.conectados, antes, `${nome}: não pode usar o proxy`);
  }
  // "*" libera todos os agentes
  escreverCfg({ agentes: ['*'] });
  let r = await rodar({ ...base, GRM_AGENTE_ID: 'qualquer' }, codigoDe('options'));
  assert.match(r.stdout, /ROTA=tunel/);

  // 3) túnel caído: com fallback sai direto (e avisa); sem fallback falha com erro claro
  const portaFechada = 1;
  escreverCfg({ proxy: `127.0.0.1:${portaFechada}` });
  r = await rodar({ ...base, GRM_AGENTE_ID: 'agente-a' }, codigoDe('options'));
  assert.match(r.stdout, /RESP 200 ALVO-OK ROTA=tunel/, 'fallback direto funciona (mantém a rota tunel para o disjuntor)');
  assert.match(r.stderr, /túnel indisponível/);
  escreverCfg({ proxy: `127.0.0.1:${portaFechada}`, fallbackDireto: false });
  r = await rodar({ ...base, GRM_AGENTE_ID: 'agente-a' }, codigoDe('options'));
  assert.match(r.stdout, /ERRO ECONNREFUSED/, 'sem fallback, o erro do túnel aparece');

  // 4) proxy que recusa o destino → sem fallback o erro é claro
  const proxyRestrito = criarProxy({ permitidos: ['so-este.test'], portas: [portaAlvo], aceitarPrivados: true, resolver: async () => ['127.0.0.1'] });
  await new Promise((res) => proxyRestrito.server.listen(0, '127.0.0.1', res));
  escreverCfg({ proxy: `127.0.0.1:${proxyRestrito.server.address().port}`, fallbackDireto: false });
  r = await rodar({ ...base, GRM_AGENTE_ID: 'agente-a' }, codigoDe('options'));
  assert.match(r.stdout, /ERRO proxy recusou: HTTP\/1\.1 403/);

  // 5) agent próprio do chamador é respeitado
  escreverCfg();
  const antes5 = proxy.stats.conectados;
  r = await rodar({ ...base, GRM_AGENTE_ID: 'agente-a' }, `${prefixo} const meu = new https.Agent(); https.request({ hostname: 'localhost', port: ${portaAlvo}, path: '/x', agent: meu, ...opts }, cb).on('error', erro).end();`);
  assert.match(r.stdout, /RESP 200/);
  assert.equal(proxy.stats.conectados, antes5, 'quem passa agent próprio não é redirecionado');

  console.log('ok test-grm-egress-proxy');
  alvo.close(); proxy.server.close(); proxyRestrito.server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
