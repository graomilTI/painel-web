'use strict';
// Teste do proxy restrito (proxy-saida.js): o que passa e, principalmente, o que NÃO pode passar.
const assert = require('assert');
const net = require('net');
const { criarProxy, ipPrivado } = require('./proxy-saida');

function conectar(portaProxy, alvo) {
  return new Promise((resolve) => {
    const s = net.connect(portaProxy, '127.0.0.1', () => s.write(`CONNECT ${alvo} HTTP/1.1\r\nHost: ${alvo}\r\n\r\n`));
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n')) resolve({ socket: s, linha: buf.split('\r\n')[0], resto: buf.split('\r\n\r\n').slice(1).join('\r\n\r\n') });
    });
    s.on('error', () => resolve({ socket: s, linha: 'ERRO', resto: '' }));
    s.on('close', () => resolve({ socket: s, linha: buf.split('\r\n')[0] || 'FECHADO', resto: '' }));
  });
}

(async () => {
  // 0) classificação de endereços
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'lixo']) {
    assert.equal(ipPrivado(ip), true, `${ip} deve ser privado`);
  }
  for (const ip of ['104.18.0.1', '172.32.0.1', '8.8.8.8', '2606:4700::1']) assert.equal(ipPrivado(ip), false, `${ip} deve ser público`);

  // servidor "GRM" de mentira: devolve um banner assim que conecta
  const alvo = net.createServer((s) => s.end('BANNER-DO-GRM'));
  await new Promise((r) => alvo.listen(0, '127.0.0.1', r));
  const portaAlvo = alvo.address().port;

  // 1) caso permitido (apontando o DNS de teste para 127.0.0.1 e aceitando "privado" só no teste)
  const logs = [];
  const ok = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], resolver: async () => ['127.0.0.1'], aceitarPrivados: true, log: (m) => logs.push(m) });
  await new Promise((r) => ok.server.listen(0, '127.0.0.1', r));
  let r = await conectar(ok.server.address().port, `www.grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 200/, 'subdomínio permitido conecta');
  await new Promise((res) => { let d = r.resto; r.socket.on('data', (c) => { d += c.toString(); }); r.socket.on('close', () => { assert.match(d, /BANNER-DO-GRM/); res(); }); });
  r = await conectar(ok.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 200/, 'domínio exato permitido'); r.socket.destroy();

  // 2) hosts fora da lista, parecidos com o permitido, e portas fora da lista
  for (const a of [`evil.com:${portaAlvo}`, `grm.test.evil.com:${portaAlvo}`, `xgrm.test:${portaAlvo}`, 'localhost:22', `grm.test:${portaAlvo + 1}`, '127.0.0.1:22', '192.168.0.1:443']) {
    r = await conectar(ok.server.address().port, a);
    assert.match(r.linha, /^HTTP\/1\.1 403/, `${a} deve ser recusado`);
  }
  assert.ok(ok.stats.recusados >= 7);

  // 3) padrão de produção (aceitarPrivados=false): host permitido que resolve para a LAN / loopback é recusado
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1']) {
    const p = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], resolver: async () => [ip] });
    await new Promise((res) => p.server.listen(0, '127.0.0.1', res));
    r = await conectar(p.server.address().port, `grm.test:${portaAlvo}`);
    assert.match(r.linha, /^HTTP\/1\.1 403/, `resolvendo para ${ip} deve recusar`);
    p.server.close();
  }
  // DNS rebinding: se QUALQUER endereço público existe usa o público; se só há privado recusa
  const misto = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], resolver: async () => ['10.0.0.9', '127.0.0.1'] });
  await new Promise((res) => misto.server.listen(0, '127.0.0.1', res));
  r = await conectar(misto.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 403/); misto.server.close();

  // 4) método comum (não CONNECT) → 405; saúde → 200 sem abrir conexão externa
  const http = require('http');
  const status = await new Promise((res) => http.get({ host: '127.0.0.1', port: ok.server.address().port, path: 'http://grm.test/' }, (resp) => res(resp.statusCode)));
  assert.equal(status, 405);
  const antes = ok.stats.conectados;
  r = await conectar(ok.server.address().port, 'saude.tunel:443');
  assert.match(r.linha, /^HTTP\/1\.1 200/);
  assert.equal(ok.stats.conectados, antes, 'saúde não abre conexão externa');

  // 5) falha de DNS → 502
  const semDns = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], resolver: async () => { throw new Error('ENOTFOUND'); } });
  await new Promise((res) => semDns.server.listen(0, '127.0.0.1', res));
  r = await conectar(semDns.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 502/); semDns.server.close();

  // 6) falha passageira num endereço: tenta o próximo (antes só o 1º era tentado e virava 502 -> HTTP 403 no agente)
  const logs6 = [];
  const alterna = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], aceitarPrivados: true, resolver: async () => ['127.0.0.2', '127.0.0.1'], log: (m) => logs6.push(m) });
  await new Promise((res) => alterna.server.listen(0, '127.0.0.1', res));
  r = await conectar(alterna.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 200/, '1º endereço recusa, o 2º atende');
  assert.ok(logs6.some((m) => /127\.0\.0\.2 falhou \(ECONNREFUSED\); tentando o próximo/.test(m)), logs6.join(' | '));
  assert.equal(alterna.stats.conectados, 1);
  assert.equal(alterna.stats.erros, 0, 'se algum endereço atendeu, não conta como erro');
  r.socket.destroy(); alterna.server.close();

  // 7) IPv4 antes de IPv6 (IPv6 vem primeiro no DNS, mas o IPv4 é tentado antes)
  const logs7 = [];
  const v4Primeiro = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], aceitarPrivados: true, resolver: async () => ['::1', '127.0.0.1'], log: (m) => logs7.push(m) });
  await new Promise((res) => v4Primeiro.server.listen(0, '127.0.0.1', res));
  r = await conectar(v4Primeiro.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 200/);
  assert.deepEqual(logs7, [], 'IPv4 atendeu de primeira: nada a registrar');
  r.socket.destroy(); v4Primeiro.server.close();

  // 8) todos os endereços falham: 502, conta 1 erro e registra o motivo (antes o erro era silencioso)
  const logs8 = [];
  const todosFalham = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], aceitarPrivados: true, resolver: async () => ['127.0.0.2', '127.0.0.3'], log: (m) => logs8.push(m) });
  await new Promise((res) => todosFalham.server.listen(0, '127.0.0.1', res));
  r = await conectar(todosFalham.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 502/);
  assert.equal(todosFalham.stats.erros, 1);
  assert.ok(logs8.some((m) => /falha ao conectar em grm\.test:\d+ \(2 endereço\(s\); último erro: ECONNREFUSED\)/.test(m)), logs8.join(' | '));
  todosFalham.server.close();

  // 9) falha de DNS agora também é registrada
  const logs9 = [];
  const semDns2 = criarProxy({ permitidos: ['grm.test'], portas: [portaAlvo], resolver: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); }, log: (m) => logs9.push(m) });
  await new Promise((res) => semDns2.server.listen(0, '127.0.0.1', res));
  r = await conectar(semDns2.server.address().port, `grm.test:${portaAlvo}`);
  assert.match(r.linha, /^HTTP\/1\.1 502/);
  assert.ok(logs9.some((m) => /falha de DNS em grm\.test \(ENOTFOUND\)/.test(m)));
  semDns2.server.close();

  console.log('ok test-proxy-saida');
  ok.server.close(); alvo.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
