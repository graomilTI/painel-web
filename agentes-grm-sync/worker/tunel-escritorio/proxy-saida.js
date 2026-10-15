'use strict';
/**
 * Proxy HTTP CONNECT mínimo e RESTRITO, para rodar no PC do escritório (rede aceita pela Cloudflare do GRM).
 *
 * Contexto (15/10/2026): a Cloudflare do GRM barra o IP da VPS dos agentes (Contabo, EUA) mas aceita o IP
 * da empresa. Um túnel SSH reverso (tunel-escritorio.js) expõe este proxy na VPS, e os agentes mandam só o
 * tráfego do GRM por ele (grm-egress-proxy.js).
 *
 * Por ser alcançável por qualquer usuário da VPS, o proxy NÃO é um proxy aberto:
 *   - só aceita CONNECT (nada de HTTP comum);
 *   - só para hosts permitidos (padrão: grmserver.com.br e subdomínios) e portas permitidas (padrão: 443);
 *   - resolve o DNS aqui e recusa qualquer destino que resolva para endereço privado/loopback/link-local
 *     (a LAN do escritório não é alcançável por ele);
 *   - escuta só em 127.0.0.1;
 *   - não grava conteúdo trafegado (a conexão TLS fica de ponta a ponta entre o agente e o GRM).
 * O host especial "saude.tunel" responde 200 sem abrir conexão externa (usado pelo vigia da VPS).
 */
const http = require('http');
const net = require('net');
const dns = require('dns').promises;

const HOST_SAUDE = 'saude.tunel';

function ipv4Privado(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function ipPrivado(ip) {
  const v = String(ip || '').toLowerCase();
  if (net.isIPv4(v)) return ipv4Privado(v);
  if (net.isIPv6(v)) {
    if (v === '::1' || v === '::') return true;
    const mapeado = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipv4Privado(mapeado[1]);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
  }
  return true;
}

/**
 * `timeoutMs` é o tempo de CADA tentativa de conexão ao destino (padrão 5 s; até 4 endereços, IPv4 primeiro).
 * @param {{ permitidos?: string[], portas?: number[], resolver?: (host: string) => Promise<string[]>, aceitarPrivados?: boolean, log?: (msg: string) => void, timeoutMs?: number }} [opcoes]
 */
function criarProxy({ permitidos = ['grmserver.com.br'], portas = [443], resolver, aceitarPrivados = false, log = () => {}, timeoutMs = 5000 } = {}) {
  const dominios = permitidos.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  const hostPermitido = (h) => dominios.some((d) => h === d || h.endsWith(`.${d}`));
  const resolverPadrao = async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address);
  const resolve = resolver || resolverPadrao;
  const stats = { conectados: 0, recusados: 0, erros: 0 };

  const server = http.createServer((req, res) => {
    res.writeHead(405, { 'content-type': 'text/plain', allow: 'CONNECT' });
    res.end('Apenas CONNECT para hosts permitidos.\n');
  });

  server.on('connect', async (req, cliente, head) => {
    cliente.on('error', () => {});
    const alvo = String(req.url || '');
    const i = alvo.lastIndexOf(':');
    const host = (i > 0 ? alvo.slice(0, i) : alvo).replace(/^\[|\]$/g, '').toLowerCase();
    const porta = i > 0 ? Number(alvo.slice(i + 1)) : 443;
    const recusar = (motivo) => {
      stats.recusados += 1;
      log(`recusado ${host}:${porta} (${motivo})`);
      cliente.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
    };

    if (host === HOST_SAUDE) {
      cliente.end('HTTP/1.1 200 Connection Established\r\n\r\n');
      return;
    }
    if (!hostPermitido(host)) return recusar('host fora da lista');
    if (!portas.includes(porta)) return recusar('porta fora da lista');

    let enderecos;
    try { enderecos = await resolve(host); } catch (e) {
      stats.erros += 1;
      log(`falha de DNS em ${host} (${(e && (e.code || e.message)) || 'erro'})`);
      cliente.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    const usaveis = aceitarPrivados ? enderecos : enderecos.filter((ip) => !ipPrivado(ip));
    if (!usaveis.length) return recusar('resolve para endereço privado');

    // IPv4 primeiro (um IPv6 instável na rede do escritório derrubava conexões que o IPv4 teria feito) e, se um
    // endereço falhar, tenta o próximo (até 4) antes de devolver 502 — antes só o primeiro endereço era tentado e
    // qualquer falha passageira virava 502 -> o agente caía na saída direta (bloqueada) -> "HTTP 403" no card.
    const tentativas = [...usaveis.filter((ip) => net.isIPv4(ip)), ...usaveis.filter((ip) => !net.isIPv4(ip))].slice(0, 4);
    let upstream = null;
    cliente.on('close', () => { if (upstream) upstream.destroy(); });
    const falhar = (ultimo) => {
      stats.erros += 1;
      log(`falha ao conectar em ${host}:${porta} (${tentativas.length} endereço(s); último erro: ${(ultimo && (ultimo.code || ultimo.message)) || 'desconhecido'})`);
      if (!cliente.writableEnded && !cliente.headersSent) {
        try { cliente.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n'); } catch { /* socket já fechado */ }
      }
      cliente.destroy();
    };
    const tentar = (n, ultimoErro) => {
      if (cliente.destroyed) return;
      if (n >= tentativas.length) { falhar(ultimoErro); return; }
      const sock = net.connect({ host: tentativas[n], port: porta });
      upstream = sock;
      sock.setTimeout(timeoutMs, () => sock.destroy(Object.assign(new Error('timeout ao conectar'), { code: 'ETIMEDOUT' })));
      let conectou = false;
      sock.once('error', (e) => {
        if (!conectou) {
          log(`${host}:${porta} via ${tentativas[n]} falhou (${e.code || e.message})${n + 1 < tentativas.length ? '; tentando o próximo endereço' : ''}`);
          sock.destroy();
          tentar(n + 1, e);
          return;
        }
        cliente.destroy();
      });
      sock.once('connect', () => {
        conectou = true;
        sock.setTimeout(0);
        stats.conectados += 1;
        cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) sock.write(head);
        sock.pipe(cliente);
        cliente.pipe(sock);
      });
      sock.on('close', () => { if (conectou) cliente.destroy(); });
    };
    tentar(0, null);
  });

  return { server, stats };
}

module.exports = { criarProxy, ipPrivado, HOST_SAUDE };

if (require.main === module) {
  const porta = Number(process.env.PROXY_PORT || 3128);
  const { server } = criarProxy({
    permitidos: String(process.env.PROXY_HOSTS || 'grmserver.com.br').split(','),
    log: (m) => console.log(`${new Date().toISOString()} ${m}`),
  });
  server.listen(porta, '127.0.0.1', () => console.log(`proxy restrito em 127.0.0.1:${porta}`));
}
