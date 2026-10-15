'use strict';
// Teste do preload de saída (grm-egress-proxy.js): roda processos filhos reais com `node -r` e confere o que passa
// pelo proxy (só o host do GRM, só para o agente listado), o fallback e a rota do disjuntor.
// O par chave/certificado abaixo é só de teste (autoassinado, CN=localhost).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const { execFile } = require('child_process');
const { criarProxy } = require('./worker/tunel-escritorio/proxy-saida');

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDRrKs6cHslF6fT
Dl0vdl1mWXbAe6tgMus2nNaLcA3ZnfZIsUqdP8RW41vVd819dpYJ90dYx9mHkUBe
MWca7PIjE7DACQAkEmGTrEmsm/Izh5YQR3IeXKmghFeqlGorEXWHYVQ705kF+WFm
xcmbR+YjiYFYm8wC88S9Tp3Uz5vwS3XLwHFPM/TpCIhnc6rPkswoh7TO6YKCy8ju
f9fh5vItv+4oBt+mnuKCGExdu82QMgubnJbDZ5pw+GoRUSEFAsyRlQxxgkNxwLMJ
JbS3tT7BNeC6tCURJ0NB/Ps9dWrNEj10piBuuIG0dcI17/5AAezSJc5Oc5QuHV1m
lPtYI5aXAgMBAAECggEAZm+nT+u4Hg0KjtBLsm5vfxtiKvPAbEU0KQBCyOi7u3+y
3RzQyTZoI9L8ALSBDjSrZL8MelFY8ySBgAM+zibIvV5XUdqT2Qup5E2dyNh/YbFy
HQ3qsO6waJ1/fvT3UYc8FiH01y2vav3FGkKzFkvwIZiCOtoSt7aEfcA0181978zr
klQiPxkDiTV4D/c6L2OVjeRkspzbtZvm/YkTUp1i6U41goZpFAB4mdcsobjCkXjO
mdKvAYlYwRTyPUUlfGol+giSVNVo1j2irJwJGcKQFpAPXc1qqOZ31j45jGtPRXyt
2l+o7vDnwfxkp2UxXMfTkBxhhn8nkFs4OK+YhMKroQKBgQDtlzjfx0OnEo28E3Kn
pADfgMx8eCa+yhFCxzND5JAzZjMbyUnYkjgFU6KKi7UdfMbsiNvH4bDo4EIZKYK8
7cZuYygm5FaoOe7SsZ6JeFD5onfFcFFu8Da8Nfw3WK4zaT0O1W9k08d9RTz49KYO
I+fNeC+/6EGSTVIv4nGGJM24rwKBgQDh67V5W9dmp3Etaf9M1fjVwqDtF9sRe2wV
V2pg4oQp2YfwH5tGGNGlqIFQmNCvEQpwbjIIp8qZn5H5Ui7sMZeHjHK26RKdcY9A
IEX97kWh6CoDtHayTeWyGt/HBdMh0+Xp+uj9d6aOv+EWHAfv3sBEKcfcc8hCIkVD
tmI6lzSqmQKBgC6CRLrhiefBpQclE3OnkhguYVkYOBVu/tQApJNswaGeJvEQhSkk
7lx0k8PlN04PZ+1TmRpWnsfnZmkAjDwpm4duV6TNW/1QYeTSqkMkz00eta1roDVE
RqKvOrEm5ergdfhaZZTqNAncrOPbGEp6Ut0Q4uABOhzGkAkZnblxqOe3AoGBANZO
mh89F9+xBpNl8WAZuapMrgs6jfzPb3/vJGIzfduVFnaaBNlBwd27MrAZxhvLtnNg
lOXRBUclL3uqkghMIsnaWRdZkOb5SkIyWzK+TB+B9Bj/n3kUm8eP5qcMx3NXZsnF
0i5eygivy/0FKiJI02nVmFlvG5BgogPRhuy9cqBBAoGAEMJYi6S5tluqklH/1088
IG3AqraNcpYY4lAl3zb1SY3+7uKbGMhDhNQUAqueOFhVLjaDEy+TQU+6F4iobjTH
y2fHO40Mofbz8V6flth+Xe4jOGjMpT5gW6h4R8uf9/yCL6f2fTeLsDsnDXVWpSCs
b/QTVRsrPH6DXsnnU94vvc0=
-----END PRIVATE KEY-----`;
const CERT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUAXZ87H+DFG8mEnDNnIUXEIWJPF0wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAxNTExNTkzNFoYDzIxMjYw
OTIxMTE1OTM0WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDRrKs6cHslF6fTDl0vdl1mWXbAe6tgMus2nNaLcA3Z
nfZIsUqdP8RW41vVd819dpYJ90dYx9mHkUBeMWca7PIjE7DACQAkEmGTrEmsm/Iz
h5YQR3IeXKmghFeqlGorEXWHYVQ705kF+WFmxcmbR+YjiYFYm8wC88S9Tp3Uz5vw
S3XLwHFPM/TpCIhnc6rPkswoh7TO6YKCy8juf9fh5vItv+4oBt+mnuKCGExdu82Q
MgubnJbDZ5pw+GoRUSEFAsyRlQxxgkNxwLMJJbS3tT7BNeC6tCURJ0NB/Ps9dWrN
Ej10piBuuIG0dcI17/5AAezSJc5Oc5QuHV1mlPtYI5aXAgMBAAGjbzBtMB0GA1Ud
DgQWBBRvTG0DmdnCSOoVNughGH4WOfChBTAfBgNVHSMEGDAWgBRvTG0DmdnCSOoV
NughGH4WOfChBTAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGCCWxvY2FsaG9z
dIcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEApqlB88eX7sinZ7w0h/PRLY+Gxz53
qlVosxPpBD37GTATYv1qd2ye+VVBUpT3Q5i6DMVhxxHxE5VPZTRrrXBCQYDA1BTU
l/zBWSJPhmkCZhusn7B1u2Pru0OrO+4jxhHe68De8cVXjXqVW/h3SQ/K93D9SRKS
mvTYb7Ltn0vHxpLwD9ySbGzLzWwtgf6p8tZ2KmW3Uis73CYSbPer+y0SAnRmmJsP
/puo7W5O+IYfCRpvzl3AmfN46fBDsgpP9f2g6H4PiVuft3PAjCsuQoccnEtujdYh
ilEF6ZBHC8jsk3nsHbK4XI8SdFKdTQZTPSpgQUF/Hl7vJ/XkDl7AicUVeg==
-----END CERTIFICATE-----`;

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
