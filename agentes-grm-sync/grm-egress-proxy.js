'use strict';
/**
 * Preload (NODE_OPTIONS=--require) que manda SÓ o tráfego do GRM por um proxy HTTP CONNECT local
 * — o túnel SSH reverso até o PC do escritório (worker/tunel-escritorio/) — em vez de sair direto pelo IP
 * da VPS, que a Cloudflare do GRM passou a bloquear em 15/10/2026 (ver README, "Bloqueio de rede").
 *
 * O worker (grm-sync-job-worker.js) carrega este arquivo só para os agentes listados em
 * grm-egress-proxy.json e exporta GRM_AGENTE_ID. Sem o JSON, com enabled=false ou para um agente fora da
 * lista, este arquivo não faz nada. Para estender a outros agentes basta incluí-los em "agentes" (ou "*").
 *
 * O que ele faz quando ativo (sempre só para hosts do GRM — "hosts" do JSON, padrão grmserver.com.br):
 *   - https.request / https.get: troca o agent por um que abre CONNECT no proxy e faz o TLS por cima (a conexão
 *     segue de ponta a ponta com o GRM). Quem passa um agent próprio não é alterado;
 *   - fetch (global): o shim monta a requisição com `new Request(...)` (cobre string/JSON, FormData, Blob, signal,
 *     headers), envia pelo mesmo agent e devolve um `Response` normal (gzip/deflate/br descompactados, redirect
 *     "follow" até 5 saltos). Outros hosts (Supabase, Groq...) continuam no fetch original;
 *   - Chrome (puppeteer-extra / puppeteer / puppeteer-core): `launch()` ganha --proxy-server apontando para um mini-proxy
 *     local, dentro do próprio processo do agente, que decide por host: GRM → túnel; todo o resto → direto. (PAC não
 *     serve: os agentes usam --single-process e nesse modo o Chrome não tem o resolvedor V8 de proxy.);
 *   - se o proxy não responde (túnel caído / PC desligado) e fallbackDireto != false, sai direto — o 403 da
 *     Cloudflare então cai no disjuntor GRM_BLOQUEIO_REDE de grm-token-cache.js em vez de um erro obscuro;
 *   - define GRM_EGRESS_ROTA=tunel, para o disjuntor ter marca de bloqueio separada da rota direta.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const Module = require('module');

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
  const handshakeMs = Number(cfg.handshakeTimeoutMs) || 20000;
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

  // O proxy do escritório responde 5xx quando ELE não consegue alcançar o GRM (falha passageira na rede do
  // escritório): o túnel está vivo. Tenta de novo pelo túnel (até 2 vezes) em vez de cair na saída direta, que a
  // Cloudflare bloqueia — era o "HTTP 403" intermitente dos serviços contínuos. Só cai no direto se o PROXY
  // estiver inacessível (túnel caído / PC desligado) ou recusar (4xx).
  function conectarViaProxyComRetry(host, porta, cb, tentativa = 0) {
    conectarViaProxy(host, porta, (err, sock) => {
      if (err && tentativa < 2 && /proxy recusou: HTTP\/1\.[01] 5\d\d/.test(err.message)) {
        setTimeout(() => conectarViaProxyComRetry(host, porta, cb, tentativa + 1), 300 * (tentativa + 1));
        return;
      }
      cb(err, sock);
    });
  }

  class AgentePorProxy extends https.Agent {
    createConnection(options, callback) {
      const host = options.host || options.hostname;
      const porta = Number(options.port) || 443;
      const direto = () => {
        const s = tls.connect({ ...options, host, port: porta, servername: options.servername || host });
        s.__grmSaidaDireta = true; // keepSocketAlive abaixo: este socket nunca volta para o pool
        callback(null, s);
      };
      conectarViaProxyComRetry(host, porta, (err, bruto) => {
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

    // Socket criado pelo FALLBACK DIRETO (túnel fora) não pode ficar no pool keep-alive: os serviços contínuos
    // consultam a cada 60 s e reaproveitavam esse socket (bloqueado pela Cloudflare -> HTTP 403) para sempre, mesmo
    // com o túnel de volta; só reiniciar o processo resolvia (15/10/2026, 12:44-12:49). Devolver false faz o Agent
    // destruir o socket ao fim da requisição; a próxima chamada tenta o túnel de novo.
    keepSocketAlive(socket) {
      if (socket && socket.__grmSaidaDireta) return false;
      return super.keepSocketAlive(socket);
    }
  }
  const agente = new AgentePorProxy({ keepAlive: true, maxSockets: 16, timeout: 60000 });

  // ---- https.request / https.get ----
  function hostDaChamada(args) {
    const [a, b] = args;
    if (typeof a === 'string') { try { return new URL(a).hostname; } catch { return ''; } }
    if (a instanceof URL) return a.hostname;
    if (a && typeof a === 'object') return a.hostname || a.host || (b && typeof b === 'object' ? (b.hostname || b.host) : '');
    return '';
  }

  // Compressão: o tráfego passa pela internet do escritório, e uma consulta de colaboradores sem gzip tem 4,5 MB
  // (0,6 MB com gzip). Só pede gzip quando o chamador NÃO definiu accept-encoding e usa callback (é nele que
  // entregamos a resposta já descompactada); "gzip": false no JSON desliga.
  const gzipAtivo = cfg.gzip !== false;
  const temCabecalho = (h, nome) => h && !Array.isArray(h) && typeof h === 'object' && Object.keys(h).some((k) => k.toLowerCase() === nome);

  function respostaDescompactada(res) {
    const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
    if ((enc !== 'gzip' && enc !== 'x-gzip') || [204, 304].includes(res.statusCode || 0)) return res;
    const gunzip = zlib.createGunzip();
    res.on('error', (e) => gunzip.destroy(e));
    gunzip.on('close', () => { if (!res.destroyed) res.destroy(); });
    res.pipe(gunzip);
    const headers = { ...res.headers };
    delete headers['content-encoding'];
    delete headers['content-length'];
    for (const [k, v] of Object.entries({
      statusCode: res.statusCode, statusMessage: res.statusMessage, headers, rawHeaders: res.rawHeaders,
      httpVersion: res.httpVersion, socket: res.socket, req: res.req, url: res.url || '',
    })) Object.defineProperty(gunzip, k, { value: v, enumerable: true, configurable: true });
    return gunzip;
  }

  // Normaliza (url?, options?, cb?) → agent do túnel (se o chamador não passou o dele) + gzip transparente.
  function prepararChamada(args) {
    const [a, b, c] = args;
    const comUrl = typeof a === 'string' || a instanceof URL;
    let opts;
    let cb;
    if (comUrl) {
      if (typeof b === 'function') { opts = {}; cb = b; } else { opts = b && typeof b === 'object' ? { ...b } : {}; cb = typeof c === 'function' ? c : undefined; }
    } else if (a && typeof a === 'object') {
      opts = { ...a }; cb = typeof b === 'function' ? b : undefined;
    } else return args;
    if (!opts.agent) opts.agent = agente;
    let cbFinal = cb;
    const metodo = String(opts.method || 'GET').toUpperCase();
    if (gzipAtivo && cb && metodo !== 'HEAD' && opts.agent === agente && !temCabecalho(opts.headers, 'accept-encoding') && !Array.isArray(opts.headers)) {
      opts.headers = { ...(opts.headers || {}), 'accept-encoding': 'gzip' };
      cbFinal = (res) => cb(respostaDescompactada(res));
    }
    const novo = comUrl ? [a, opts] : [opts];
    if (cbFinal) novo.push(cbFinal);
    return novo;
  }

  const requestOriginal = https.request;
  for (const nome of ['request', 'get']) {
    const original = https[nome];
    https[nome] = function chamadaPorProxy(...args) {
      try { if (ehHostDoGrm(hostDaChamada(args))) return original.apply(this, prepararChamada(args)); } catch { /* cai na chamada original */ }
      return original.apply(this, args);
    };
  }

  // ---- fetch (global) ----
  const fetchOriginal = globalThis.fetch;
  const REDIRECTS_MAX = 5;

  function descompactar(corpo, codificacao) {
    const enc = String(codificacao || '').toLowerCase().trim();
    if (!corpo.length || !enc || enc === 'identity') return corpo;
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(corpo);
    if (enc === 'br') return zlib.brotliDecompressSync(corpo);
    if (enc === 'deflate') { try { return zlib.inflateSync(corpo); } catch { return zlib.inflateRawSync(corpo); } }
    return corpo;
  }

  function enviarFetch(req, url, corpo, saltos) {
    return new Promise((resolve, reject) => {
      const headers = {};
      req.headers.forEach((v, k) => { headers[k] = v; });
      if (!headers['accept-encoding']) headers['accept-encoding'] = 'gzip, deflate, br';
      if (!headers['user-agent']) headers['user-agent'] = 'node';
      if (corpo) headers['content-length'] = String(corpo.length); else delete headers['content-length'];
      const sinal = req.signal;
      const abortar = () => { reqHttp.destroy(); reject(sinal.reason || new DOMException('This operation was aborted', 'AbortError')); };
      const reqHttp = requestOriginal.call(https, {
        protocol: 'https:', hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`,
        method: req.method, headers, agent: agente,
      }, (res) => {
        const pedacos = [];
        res.on('data', (c) => pedacos.push(c));
        res.on('error', (e) => reject(Object.assign(new TypeError('fetch failed'), { cause: e })));
        res.on('end', () => {
          if (sinal) sinal.removeEventListener('abort', abortar);
          try {
            const status = res.statusCode || 0;
            const local = res.headers.location;
            if ([301, 302, 303, 307, 308].includes(status) && local && req.redirect === 'follow') {
              if (saltos >= REDIRECTS_MAX) { reject(Object.assign(new TypeError('fetch failed'), { cause: new Error('redirect count exceeded') })); return; }
              const destino = new URL(local, url);
              const viraGet = status === 303 || ((status === 301 || status === 302) && req.method === 'POST');
              const proxima = new Request(destino, { method: viraGet ? 'GET' : req.method, headers: req.headers, redirect: 'follow', signal: sinal });
              if (!ehHostDoGrm(destino.hostname)) { resolve(fetchOriginal(proxima)); return; }
              enviarFetch(proxima, destino, viraGet ? null : corpo, saltos + 1).then(resolve, reject);
              return;
            }
            const bruto = Buffer.concat(pedacos);
            const cabecalhos = new Headers();
            const comprimido = res.headers['content-encoding'];
            const dados = descompactar(bruto, comprimido);
            for (let i = 0; i < res.rawHeaders.length; i += 2) {
              const k = res.rawHeaders[i].toLowerCase();
              if (k === 'transfer-encoding' || k === 'content-length' || (comprimido && k === 'content-encoding')) continue;
              cabecalhos.append(k, res.rawHeaders[i + 1]);
            }
            const semCorpo = [101, 204, 205, 304].includes(status) || req.method === 'HEAD';
            const resposta = new Response(semCorpo ? null : dados, { status, statusText: res.statusMessage || '', headers: cabecalhos });
            Object.defineProperty(resposta, 'url', { value: url.href });
            resolve(resposta);
          } catch (e) { reject(Object.assign(new TypeError('fetch failed'), { cause: e })); }
        });
      });
      reqHttp.on('error', (e) => { if (sinal) sinal.removeEventListener('abort', abortar); reject(Object.assign(new TypeError('fetch failed'), { cause: e })); });
      if (sinal) { if (sinal.aborted) { abortar(); return; } sinal.addEventListener('abort', abortar, { once: true }); }
      reqHttp.end(corpo || undefined);
    });
  }

  if (typeof fetchOriginal === 'function') {
    globalThis.fetch = async function fetchPorProxy(input, init) {
      let url;
      try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url); } catch { return fetchOriginal.call(this, input, init); }
      if (url.protocol !== 'https:' || !ehHostDoGrm(url.hostname)) return fetchOriginal.call(this, input, init);
      const req = new Request(input, init);
      const corpo = req.body ? Buffer.from(await req.arrayBuffer()) : null;
      return enviarFetch(req, url, corpo, 0);
    };
  }

  // ---- Chrome (puppeteer-extra / puppeteer / puppeteer-core) ----
  // Mini-proxy local (um por processo, na primeira chamada de launch): o Chrome manda tudo para ele e ele decide
  // por host. Só CONNECT (https/wss) é roteado; http puro é repassado direto (o GRM é sempre https).
  let proxyLocalChrome = null;
  function iniciarProxyLocalChrome() {
    if (proxyLocalChrome) return proxyLocalChrome;
    proxyLocalChrome = new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        let u;
        try { u = new URL(req.url); } catch { res.writeHead(400); res.end(); return; }
        const saida = http.request({ hostname: u.hostname, port: u.port || 80, path: `${u.pathname}${u.search}`, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
        saida.on('error', () => { try { res.writeHead(502); res.end(); } catch { /* já respondeu */ } });
        req.pipe(saida);
      });
      srv.on('connect', (req, cliente, head) => {
        cliente.on('error', () => {});
        const alvo = String(req.url || '');
        const i = alvo.lastIndexOf(':');
        const host = (i > 0 ? alvo.slice(0, i) : alvo).replace(/^\[|\]$/g, '');
        const porta = i > 0 ? Number(alvo.slice(i + 1)) : 443;
        const ligar = (upstream) => {
          upstream.on('error', () => cliente.destroy());
          upstream.on('close', () => cliente.destroy());
          cliente.on('close', () => upstream.destroy());
          // Relay não pode segurar o processo do agente: sem isto, hosts que nunca fecham a sua ponta depois do
          // FIN do Chrome (ex.: GCM do Google em :5228) deixavam sockets em FIN-WAIT-2/CLOSE-WAIT e o agente que
          // sai por encerramento natural (sem process.exit) ficava "rodando" para sempre, travando a lane inteira.
          cliente.unref();
          upstream.unref();
          // Túnel HTTPS não usa meia-conexão: depois do 1º FIN (de qualquer lado) dá 5 s para o resto escoar e derruba.
          const encerrarEmBreve = () => { const t = setTimeout(() => { cliente.destroy(); upstream.destroy(); }, 5000); t.unref(); };
          cliente.once('end', encerrarEmBreve);
          upstream.once('end', encerrarEmBreve);
          cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length) upstream.write(head);
          upstream.pipe(cliente);
          cliente.pipe(upstream);
        };
        const direto = () => {
          const u = net.connect({ host, port: porta });
          u.once('connect', () => ligar(u));
          u.once('error', () => { try { cliente.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n'); } catch { /* já fechado */ } });
        };
        if (!ehHostDoGrm(host)) { direto(); return; }
        conectarViaProxyComRetry(host, porta, (err, s) => {
          if (!err) { ligar(s); return; }
          if (fallbackDireto) { if (Date.now() - avisouFallback > 60000) { avisouFallback = Date.now(); aviso(`túnel indisponível no Chrome (${err.message}); saindo direto`); } direto(); return; }
          try { cliente.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n'); } catch { /* já fechado */ }
        });
      });
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => { srv.unref(); resolve(srv.address().port); });
    });
    return proxyLocalChrome;
  }

  function patchLaunch(m) {
    const alvo = m && typeof m.launch === 'function' ? m : (m && m.default && typeof m.default.launch === 'function' ? m.default : null);
    if (!alvo || alvo.__grmEgress) return;
    const original = alvo.launch;
    alvo.launch = async function launchPorProxy(opcoes, ...resto) {
      const o = { ...(opcoes || {}) };
      const args = Array.isArray(o.args) ? [...o.args] : [];
      if (!args.some((a) => /^--proxy-(server|pac-url)/.test(String(a)))) {
        const porta = await iniciarProxyLocalChrome();
        args.push(`--proxy-server=http://127.0.0.1:${porta}`);
      }
      o.args = args;
      return original.call(this, o, ...resto);
    };
    alvo.__grmEgress = true;
  }
  const requireOriginal = Module.prototype.require;
  Module.prototype.require = function requirePorProxy(id) {
    const m = requireOriginal.apply(this, arguments);
    if (id === 'puppeteer-extra' || id === 'puppeteer' || id === 'puppeteer-core') { try { patchLaunch(m); } catch { /* segue sem proxy no Chrome */ } }
    return m;
  };

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
