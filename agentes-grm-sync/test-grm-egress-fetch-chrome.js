'use strict';
// Teste do shim de fetch e do gancho do Chrome em grm-egress-proxy.js, com processos filhos reais:
// servidor HTTPS de mentira (o "GRM"), proxy restrito de verdade (worker/tunel-escritorio/proxy-saida.js) e
// um módulo "puppeteer-extra" falso para conferir os argumentos de launch().
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { criarProxy } = require('./worker/tunel-escritorio/proxy-saida');

const KEY = fs.readFileSync(path.join(__dirname, 'test-fixtures', 'localhost.key'), 'utf8');
const CERT = fs.readFileSync(path.join(__dirname, 'test-fixtures', 'localhost.crt'), 'utf8');
const PRELOAD = path.join(__dirname, 'grm-egress-proxy.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-egress-fetch-'));
const cfgPath = path.join(dir, 'cfg.json');
const certPath = path.join(dir, 'localhost.crt');
fs.writeFileSync(certPath, CERT);

function rodar(env, codigo, cwd) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['-r', PRELOAD, '-e', codigo], {
      cwd, env: { PATH: process.env.PATH, GRM_EGRESS_CONFIG: cfgPath, NODE_EXTRA_CA_CERTS: certPath, ...env }, timeout: 40000,
    }, (err, stdout, stderr) => resolve({ codigo: err ? err.code || 1 : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

(async () => {
  const vistos = [];
  const alvo = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    const pedacos = [];
    req.on('data', (c) => pedacos.push(c));
    req.on('end', () => {
      const corpo = Buffer.concat(pedacos);
      vistos.push({ metodo: req.method, url: req.url, tipo: req.headers['content-type'] || '', tamanho: corpo.length });
      if (req.url === '/json') { res.writeHead(200, { 'content-type': 'application/json', 'x-teste': 'sim' }); return res.end(JSON.stringify({ ok: true, eco: corpo.toString() })); }
      if (req.url === '/eco') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`${req.method}|${req.headers['content-type'] || ''}|${corpo.toString('latin1')}`); }
      if (req.url === '/gzip') { const g = zlib.gzipSync('texto-comprimido'); res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' }); return res.end(g); }
      if (req.url === '/negocia') {
        const pediuGzip = /gzip/.test(String(req.headers['accept-encoding'] || ''));
        const texto = pediuGzip ? 'ZIP-NEGOCIADO' : 'PLANO-SEM-GZIP';
        if (pediuGzip) { res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain', 'x-extra': 'preservado' }); return res.end(zlib.gzipSync(texto)); }
        res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(texto);
      }
      if (req.url === '/negocia-204') { res.writeHead(204); return res.end(); }
      if (req.url === '/lento') { setTimeout(() => { try { res.end('tarde'); } catch { /* cliente saiu */ } }, 3000); return; }
      if (req.url === '/redir') { res.writeHead(302, { location: '/destino' }); return res.end(); }
      if (req.url === '/destino') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`chegou ${req.method}`); }
      if (req.url === '/nao-existe') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"result":false,"message":"nada"}'); }
      if (req.url === '/vazio') { res.writeHead(204); return res.end(); }
      res.writeHead(500); res.end('?');
    });
  });
  await new Promise((r) => alvo.listen(0, '127.0.0.1', r));
  const porta = alvo.address().port;
  const proxy = criarProxy({ permitidos: ['localhost'], portas: [porta], aceitarPrivados: true, resolver: async () => ['127.0.0.1'] });
  await new Promise((r) => proxy.server.listen(0, '127.0.0.1', r));
  const escreverCfg = (extra = {}) => fs.writeFileSync(cfgPath, JSON.stringify({ enabled: true, proxy: `127.0.0.1:${proxy.server.address().port}`, agentes: ['agente-a'], hosts: ['localhost'], ...extra }));
  const base = { GRM_AGENTE_ID: 'agente-a' };
  const U = (p) => `https://localhost:${porta}${p}`;
  // cada caso roda o código no filho e imprime uma linha "RES ..."
  const caso = (corpoJs) => `(async () => { try { ${corpoJs} } catch (e) { console.log('FALHOU', e.name, e.message, e.cause && e.cause.code || ''); process.exit(3); } })();`;
  const passouPeloProxy = async (fn) => { const antes = proxy.stats.conectados; const r = await fn(); return { r, usou: proxy.stats.conectados - antes }; };

  escreverCfg();

  // 1) GET simples: status, ok, headers, text, json, url
  let { r, usou } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/json')}'); const j = await res.json(); console.log('RES', res.status, res.ok, res.headers.get('x-teste'), j.ok, res.url, process.env.GRM_EGRESS_ROTA);`)));
  assert.match(r.stdout, new RegExp(`RES 200 true sim true https://localhost:${porta}/json tunel`), `${r.stdout}${r.stderr}`);
  assert.ok(usou >= 1, 'GET precisa usar o proxy');

  // 2) POST com JSON em string + headers
  ({ r, usou } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/eco')}', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer x' }, body: JSON.stringify({ a: 1 }) }); console.log('RES', await res.text());`))));
  assert.match(r.stdout, /RES POST\|application\/json\|\{"a":1\}/, `${r.stdout}${r.stderr}`);
  assert.ok(usou >= 1);

  // 3) POST com FormData (multipart) — o content-type com boundary tem que sair certo
  ({ r, usou } = await passouPeloProxy(() => rodar(base, caso(`const f = new FormData(); f.append('campo', 'valor-ç'); f.append('arq', new Blob(['conteudo'], { type: 'text/plain' }), 'a.txt'); const res = await fetch('${U('/eco')}', { method: 'POST', body: f }); console.log('RES', JSON.stringify(await res.text()));`))));
  assert.match(r.stdout, /multipart\/form-data; boundary=/, r.stdout);
  assert.match(r.stdout, /name=\\"campo\\"/);
  assert.match(r.stdout, /conteudo/);
  assert.ok(usou >= 1);

  // 4) resposta gzip é descompactada; content-encoding some dos headers
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/gzip')}'); console.log('RES', await res.text(), res.headers.get('content-encoding'));`))));
  assert.match(r.stdout, /RES texto-comprimido null/, r.stdout + r.stderr);

  // 5) 404 com corpo e 204 sem corpo
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`const a = await fetch('${U('/nao-existe')}'); const t = await a.text(); const b = await fetch('${U('/vazio')}'); console.log('RES', a.status, a.ok, t, b.status, JSON.stringify(await b.text()));`))));
  assert.match(r.stdout, /RES 404 false \{"result":false,"message":"nada"\} 204 ""/, r.stdout + r.stderr);

  // 6) timeout (AbortSignal.timeout) e AbortController.abort() rejeitam com o erro certo
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`
    try { await fetch('${U('/lento')}', { signal: AbortSignal.timeout(400) }); console.log('SEM-ERRO'); } catch (e) { console.log('T', e.name); }
    const c = new AbortController(); setTimeout(() => c.abort(), 300);
    try { await fetch('${U('/lento')}', { signal: c.signal }); console.log('SEM-ERRO'); } catch (e) { console.log('A', e.name); }
    const j = new AbortController(); j.abort();
    try { await fetch('${U('/json')}', { signal: j.signal }); console.log('SEM-ERRO'); } catch (e) { console.log('J', e.name); }
    process.exit(0);`))));
  assert.match(r.stdout, /T TimeoutError/, r.stdout + r.stderr);
  assert.match(r.stdout, /A AbortError/);
  assert.match(r.stdout, /J AbortError/);

  // 7) redirect 302 é seguido (POST vira GET)
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/redir')}', { method: 'POST', body: 'x' }); console.log('RES', res.status, await res.text());`))));
  assert.match(r.stdout, /RES 200 chegou GET/, r.stdout + r.stderr);

  // 8) objeto Request como entrada
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch(new Request('${U('/eco')}', { method: 'PUT', body: 'abc' })); console.log('RES', await res.text());`))));
  assert.match(r.stdout, /RES PUT\|text\/plain;charset=UTF-8\|abc/, r.stdout + r.stderr);

  // 9) host que NÃO é do GRM segue no fetch original (sem proxy, sem rota)
  escreverCfg({ hosts: ['outro.test'] });
  ({ r, usou } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/json')}'); console.log('RES', res.status);`))));
  assert.match(r.stdout, /RES 200/, r.stdout + r.stderr);
  assert.equal(usou, 0, 'host fora da lista não pode usar o proxy');
  escreverCfg();

  // 10) agente fora da lista: fetch original, sem proxy
  ({ r, usou } = await passouPeloProxy(() => rodar({ GRM_AGENTE_ID: 'agente-b' }, caso(`const res = await fetch('${U('/json')}'); console.log('RES', res.status, process.env.GRM_EGRESS_ROTA || '-');`))));
  assert.match(r.stdout, /RES 200 -/, r.stdout + r.stderr);
  assert.equal(usou, 0);

  // 11) túnel caído: fetch sai direto (fallback) e funciona; sem fallback vira "fetch failed" com a causa
  escreverCfg({ proxy: '127.0.0.1:1' });
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`const res = await fetch('${U('/json')}'); console.log('RES', res.status);`))));
  assert.match(r.stdout, /RES 200/, 'fallback direto no fetch');
  assert.match(r.stderr, /túnel indisponível/);
  escreverCfg({ proxy: '127.0.0.1:1', fallbackDireto: false });
  ({ r } = await passouPeloProxy(() => rodar(base, caso(`await fetch('${U('/json')}');`))));
  assert.match(r.stdout, /FALHOU TypeError fetch failed ECONNREFUSED/, r.stdout + r.stderr);
  escreverCfg();

  // 11b) https.request/get: gzip transparente (o chamador não vê diferença) e respeito a quem já define accept-encoding
  const reqCodigo = (opcoesJs, uso) => caso(`
    const https = require('https');
    const ouve = (res) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => console.log('RES', res.statusCode, JSON.stringify(Buffer.concat(ch).toString()), 'enc=' + (res.headers['content-encoding'] || '-'), 'extra=' + (res.headers['x-extra'] || '-'), 'len=' + (res.headers['content-length'] || '-'))); };
    ${uso}`.split('OPCOES').join(opcoesJs));
  const baseOpts = `hostname: 'localhost', port: ${porta}, path: '/negocia'`;
  // sem accept-encoding + callback → pede gzip, entrega decodificado, esconde content-encoding e content-length
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(baseOpts, "https.request({ OPCOES }, ouve).on('error', (e) => { console.log('ERRO', e.message); process.exit(3); }).end();"))));
  assert.match(r.stdout, /RES 200 "ZIP-NEGOCIADO" enc=- extra=preservado len=-/, r.stdout + r.stderr);
  // https.get(url, options, cb)
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(baseOpts, `https.get('https://localhost:${porta}/negocia', {}, ouve).on('error', (e) => { console.log('ERRO', e.message); process.exit(3); });`))));
  assert.match(r.stdout, /RES 200 "ZIP-NEGOCIADO" enc=-/, r.stdout + r.stderr);
  // chamador que já define accept-encoding: não é alterado (recebe o que pediu)
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(`${baseOpts}, headers: { 'Accept-Encoding': 'identity' }`, "https.request({ OPCOES }, ouve).on('error', (e) => { console.log('ERRO', e.message); process.exit(3); }).end();"))));
  assert.match(r.stdout, /RES 200 "PLANO-SEM-GZIP" enc=-/, r.stdout + r.stderr);
  // sem callback (usa o evento 'response'): não injeta gzip, para não entregar bytes comprimidos
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(baseOpts, "const q = https.request({ OPCOES }); q.on('response', ouve); q.on('error', (e) => { console.log('ERRO', e.message); process.exit(3); }); q.end();"))));
  assert.match(r.stdout, /RES 200 "PLANO-SEM-GZIP" enc=-/, r.stdout + r.stderr);
  // 204 e resposta pequena sem corpo seguem normais
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(`hostname: 'localhost', port: ${porta}, path: '/negocia-204'`, "https.request({ OPCOES }, ouve).on('error', (e) => { console.log('ERRO', e.message); process.exit(3); }).end();"))));
  assert.match(r.stdout, /RES 204 ""/, r.stdout + r.stderr);
  // "gzip": false no JSON desliga a negociação
  escreverCfg({ gzip: false });
  ({ r } = await passouPeloProxy(() => rodar(base, reqCodigo(baseOpts, "https.request({ OPCOES }, ouve).on('error', (e) => { console.log('ERRO', e.message); process.exit(3); }).end();"))));
  assert.match(r.stdout, /RES 200 "PLANO-SEM-GZIP"/, r.stdout + r.stderr);
  escreverCfg();

  // 12) Chrome: módulo falso puppeteer-extra recebe --proxy-pac-url (PAC só para o GRM), sem duplicar e sem mexer em outros agentes
  const falso = path.join(dir, 'node_modules', 'puppeteer-extra');
  fs.mkdirSync(falso, { recursive: true });
  fs.writeFileSync(path.join(falso, 'index.js'), 'module.exports = { launch(o) { return Promise.resolve(o); }, use() {} };');
  // O filho chama launch() e depois usa o --proxy-server recebido como o Chrome usaria: CONNECT + TLS + GET.
  // "localhost" é o host do GRM (hosts do JSON); "127.0.0.1" é um host qualquer (tem que sair direto).
  const CRLF_JS = 'String.fromCharCode(13, 10)';
  const lancar = (args, rotear = false) => caso(`
    const net = require('net'); const tls = require('tls'); const fs = require('fs');
    const CRLF = ${CRLF_JS};
    const p = require('puppeteer-extra');
    const o = await p.launch(${JSON.stringify({ headless: true, args })});
    console.log('ARGS ' + JSON.stringify(o.args)); console.log('HL ' + o.headless);
    ${rotear ? `
    const porta = Number(o.args.find((a) => a.startsWith('--proxy-server=')).split(':').pop());
    function pedir(hostAlvo) { return new Promise((resolve) => {
      const s = net.connect(porta, '127.0.0.1', () => s.write('CONNECT ' + hostAlvo + ':${porta} HTTP/1.1' + CRLF + CRLF));
      let buf = '';
      s.on('data', function onData(d) {
        buf += d.toString('latin1'); if (!buf.includes(CRLF + CRLF)) return; s.removeListener('data', onData);
        if (!/ 200 /.test(buf.split(CRLF)[0])) return resolve(buf.split(CRLF)[0]);
        const t = tls.connect({ socket: s, servername: 'localhost', ca: fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS) });
        let r = ''; t.on('data', (c) => { r += c; }); t.on('end', () => resolve(r.split(CRLF)[0] + ' | ' + r.split(CRLF + CRLF)[1])); t.on('error', (e) => resolve('TLS ' + e.message));
        t.write('GET /json HTTP/1.1' + CRLF + 'host: localhost' + CRLF + 'connection: close' + CRLF + CRLF);
      });
      s.on('error', (e) => resolve('ERRO ' + e.message));
    }); }
    console.log('GRM ' + await pedir('localhost'));
    console.log('OUTRO ' + await pedir('127.0.0.1'));
    process.exit(0);` : ''}
  `);
  const argsDe = (saida) => JSON.parse(saida.split('\n').find((l) => l.startsWith('ARGS ')).slice(5));

  // 12a) args: --proxy-server para um mini-proxy local; demais opções preservadas
  r = await rodar(base, lancar(['--no-sandbox']), dir);
  let args = argsDe(r.stdout);
  assert.equal(args[0], '--no-sandbox');
  const arg = args.find((a) => /^--proxy-server=http:\/\/127\.0\.0\.1:\d+$/.test(a));
  assert.ok(arg, `launch ganhou --proxy-server local: ${r.stdout}${r.stderr}`);
  assert.ok(!args.some((a) => a.startsWith('--proxy-pac-url')), 'sem PAC (não funciona com --single-process)');
  assert.match(r.stdout, /HL true/, 'demais opções preservadas');

  // 12b) roteamento real: GRM pelo túnel, outro host direto
  escreverCfg();
  let antes = proxy.stats.conectados;
  r = await rodar(base, lancar(['--no-sandbox'], true), dir);
  assert.match(r.stdout, /GRM HTTP\/1\.1 200 OK[^]*?\{"ok":true[^]*?OUTRO/, r.stdout + r.stderr);
  assert.match(r.stdout, /OUTRO HTTP\/1\.1 200 OK[^]*?\{"ok":true/, r.stdout + r.stderr);
  assert.equal(proxy.stats.conectados - antes, 1, 'só o host do GRM passou pelo túnel; o outro saiu direto');

  // 12c) túnel caído: com fallback o GRM sai direto pelo mini-proxy; sem fallback o Chrome recebe 502
  escreverCfg({ proxy: '127.0.0.1:1' });
  r = await rodar(base, lancar([], true), dir);
  assert.match(r.stdout, /GRM HTTP\/1\.1 200 OK/, 'fallback direto no Chrome');
  assert.match(r.stderr, /túnel indisponível no Chrome/);
  escreverCfg({ proxy: '127.0.0.1:1', fallbackDireto: false });
  r = await rodar(base, lancar([], true), dir);
  assert.match(r.stdout, /GRM HTTP\/1\.1 502/, r.stdout + r.stderr);
  assert.match(r.stdout, /OUTRO HTTP\/1\.1 200 OK/, 'host fora do GRM segue direto mesmo sem túnel');
  escreverCfg();

  // 12d) quem já passa --proxy-server / --proxy-pac-url não é alterado; agente fora da lista também não
  r = await rodar(base, lancar(['--proxy-server=http://x:1']), dir);
  assert.deepEqual(argsDe(r.stdout), ['--proxy-server=http://x:1']);
  r = await rodar(base, lancar(['--proxy-pac-url=data:,x']), dir);
  assert.deepEqual(argsDe(r.stdout), ['--proxy-pac-url=data:,x']);
  r = await rodar({ GRM_AGENTE_ID: 'agente-b' }, lancar(['--no-sandbox']), dir);
  assert.deepEqual(argsDe(r.stdout), ['--no-sandbox'], 'agente fora da lista não ganha proxy');

  console.log('ok test-grm-egress-fetch-chrome');
  alvo.close(); proxy.server.close(); alvo.closeAllConnections && alvo.closeAllConnections();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
