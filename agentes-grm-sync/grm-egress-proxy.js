'use strict';
/**
 * Preload (NODE_OPTIONS=--require) que manda SÓ o tráfego HTTPS do GRM por um proxy HTTP CONNECT local
 * — o túnel SSH reverso até o PC do escritório (worker/tunel-escritorio/) — em vez de sair direto pelo IP
 * da VPS, que a Cloudflare do GRM passou a bloquear em 15/10/2026 (ver README, "Bloqueio de rede").
 *
 * O worker (grm-sync-job-worker.js) carrega este arquivo só para os agentes listados em
 * grm-egress-proxy.json e exporta GRM_AGENTE_ID. Sem o JSON, com enabled=false ou para um agente fora da
 * lista, este arquivo não faz nada. Para estender a outros agentes basta incluí-los em "agentes" (ou "*").
 *
 * O que ele faz quando ativo:
 *   - troca o agent de https.request/https.get quando o host é do GRM (hosts do JSON, padrão grmserver.com.br),
 *     abrindo CONNECT no proxy e fazendo o TLS por cima (a conexão segue de ponta a ponta com o GRM);
 *   - nunca mexe em outros hosts (Supabase, Groq, etc. continuam saindo direto);
 *   - se o proxy não responde (túnel caído / PC desligado) e fallbackDireto != false, sai direto — o 403 da
 *     Cloudflare então cai no disjuntor GRM_BLOQUEIO_REDE de grm-token-cache.js em vez de um erro obscuro;
 *   - define GRM_EGRESS_ROTA=tunel, para o disjuntor ter marca de bloqueio separada da rota direta.
 * Ainda NÃO cobre `fetch` nem o Chrome do Puppeteer (próxima fase).
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const https = require('https');

const CONFIG_PATH = process.env.GRM_EGRESS_CONFIG || path.join(__dirname, 'grm-egress-proxy.json');

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}

function agenteAtivo(cfg, agenteId) {
  return Boolean(cfg && cfg.enabled === true && Array.isArray(cfg.agentes) && (cfg.agentes.includes('*') || cfg.agentes.includes(agenteId)));
}

function instalar(cfg) {
  const [proxyHost, proxyPortaTxt] = String(cfg.proxy || '127.0.0.1:47213').split(':');
  const proxyPorta = Number(proxyPortaTxt);
  const dominios = (Array.isArray(cfg.hosts) && cfg.hosts.length ? cfg.hosts : ['grmserver.com.br']).map((d) => String(d).toLowerCase());
  const handshakeMs = Number(cfg.handshakeTimeoutMs) || 8000;
  const fallbackDireto = cfg.fallbackDireto !== false;
  const ehHostDoGrm = (h) => { const x = String(h || '').toLowerCase().replace(/:\d+$/, ''); return dominios.some((d) => x === d || x.endsWith(`.${d}`)); };
  const aviso = (m) => process.stderr.write(`[WARN] ${new Date().toISOString()} - [egress] ${m}\n`);
  let avisouFallback = 0;

  function conectarViaProxy(host, porta, cb) {
    let acabou = false;
    const fim = (err, sock) => { if (acabou) { if (sock) sock.destroy(); return; } acabou = true; clearTimeout(timer); cb(err, sock); };
    const s = net.connect({ host: proxyHost, port: proxyPorta });
    const timer = setTimeout(() => { s.destroy(); fim(new Error('timeout no proxy do escritório')); }, handshakeMs);
    let buf = '';
    s.once('error', (e) => fim(e));
    s.once('connect', () => s.write(`CONNECT ${host}:${porta} HTTP/1.1\r\nHost: ${host}:${porta}\r\n\r\n`));
    const aoReceber = (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) { if (buf.length > 4096) { s.destroy(); fim(new Error('resposta do proxy inválida')); } return; }
      s.removeListener('data', aoReceber);
      s.pause();
      const linha = buf.split('\r\n')[0];
      if (!/^HTTP\/1\.[01] 200/.test(linha)) { s.destroy(); fim(new Error(`proxy recusou: ${linha}`)); return; }
      const resto = buf.slice(i + 4);
      if (resto) s.unshift(Buffer.from(resto, 'latin1'));
      fim(null, s);
    };
    s.on('data', aoReceber);
    s.once('close', () => fim(new Error('proxy fechou a conexão')));
  }

  class AgentePorProxy extends https.Agent {
    createConnection(options, callback) {
      const host = options.host || options.hostname;
      const porta = Number(options.port) || 443;
      const direto = () => callback(null, tls.connect({ ...options, host, port: porta, servername: options.servername || host }));
      conectarViaProxy(host, porta, (err, bruto) => {
        if (err) {
          if (!fallbackDireto) { callback(err); return; }
          if (Date.now() - avisouFallback > 60000) { avisouFallback = Date.now(); aviso(`túnel indisponível (${err.message}); saindo direto`); }
          direto();
          return;
        }
        const { host: _h, port: _p, path: _pa, ...resto } = options;
        callback(null, tls.connect({ ...resto, socket: bruto, servername: options.servername || host }));
      });
    }
  }
  const agente = new AgentePorProxy({ keepAlive: true, maxSockets: 16, timeout: 60000 });

  function hostDaChamada(args) {
    const [a, b] = args;
    if (typeof a === 'string') { try { return new URL(a).hostname; } catch { return ''; } }
    if (a instanceof URL) return a.hostname;
    if (a && typeof a === 'object') return a.hostname || a.host || (b && typeof b === 'object' ? (b.hostname || b.host) : '');
    return '';
  }

  function comAgente(args) {
    const [a, b] = args;
    const semAgenteProprio = (o) => !o || !o.agent;
    if (typeof a === 'string' || a instanceof URL) {
      if (b && typeof b === 'object' && typeof b !== 'function') return semAgenteProprio(b) ? [a, { ...b, agent: agente }, ...args.slice(2)] : args;
      return [a, { agent: agente }, ...args.slice(1)];
    }
    if (a && typeof a === 'object') return semAgenteProprio(a) ? [{ ...a, agent: agente }, ...args.slice(1)] : args;
    return args;
  }

  for (const nome of ['request', 'get']) {
    const original = https[nome];
    https[nome] = function chamadaPorProxy(...args) {
      try { if (ehHostDoGrm(hostDaChamada(args))) return original.apply(this, comAgente(args)); } catch { /* cai na chamada original */ }
      return original.apply(this, args);
    };
  }
  process.env.GRM_EGRESS_ROTA = 'tunel';
  console.log(`[INFO] ${new Date().toISOString()} - [egress] GRM via túnel do escritório ${proxyHost}:${proxyPorta} (agente ${process.env.GRM_AGENTE_ID || '?'}).`);
}

const cfg = lerConfig();
const ativo = agenteAtivo(cfg, String(process.env.GRM_AGENTE_ID || ''));
if (ativo && !globalThis.__grmEgressProxyInstalado) {
  globalThis.__grmEgressProxyInstalado = true;
  instalar(cfg);
}

module.exports = { ativo, agenteAtivo };
