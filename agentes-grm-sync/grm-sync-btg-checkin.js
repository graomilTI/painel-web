const fs = require('fs');
const https = require('https');

for (const f of ['.env', '../.env', '/home/grao100/painel-scripts/grm-sync/.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = String(m[2] || '').replace(/^["']|["']$/g, '');
  }
}

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!URL_BASE || !KEY) {
  console.error('[BTG CHECKIN] SUPABASE_URL ou SUPABASE_KEY ausente.');
  process.exit(1);
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, URL_BASE);
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request({
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${method} ${path} HTTP ${res.statusCode}: ${data}`));
          return;
        }
        resolve(json);
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function urlBtg(i) {
  return i.url_checkin_btg || i.url_btg || i.link_checkin_btg || i.checkin_url_btg || '';
}

async function getJob() {
  const qs = new URLSearchParams();
  qs.set('select', 'id,agente_id,status,payload,created_at');
  qs.set('agente_id', 'eq.sync-btg-checkin');
  qs.set('status', 'in.(pendente,rodando)');
  qs.set('order', 'created_at.asc');
  qs.set('limit', '10');

  const jobs = await api('GET', `/rest/v1/grm_sync_jobs?${qs.toString()}`);
  return (jobs || []).find(j => (j.payload || {}).acao === 'enviar_link_checkin_btg');
}

async function main() {
  console.log('[BTG CHECKIN] Iniciando.');

  const job = await getJob();

  if (!job) {
    console.log('[BTG CHECKIN] Nenhum job pendente.');
    return;
  }

  const itens = Array.isArray(job.payload?.itens) ? job.payload.itens : [];

  if (!itens.length) throw new Error(`Job ${job.id} sem itens.`);

  const semUrl = itens.filter(i => !urlBtg(i));

  if (semUrl.length) {
    throw new Error(`Bloqueado: ${semUrl.length} item(ns) sem URL de check-in da BTG.`);
  }

  const itensBtg = itens.map(i => ({ ...i, url_checkin_btg: urlBtg(i) }));

  console.log(`[BTG CHECKIN] Job ${job.id}: ${itensBtg.length} item(ns) com URL da BTG.`);

  const result = await api('POST', '/functions/v1/btg-checkin-send', {
    origem: 'agente-btg-checkin',
    job_id: job.id,
    itens: itensBtg
  });

  console.log('[BTG CHECKIN] Function executada.');
  console.log(JSON.stringify(result || {}, null, 2));
}

main().catch(err => {
  console.error('[BTG CHECKIN] ERRO:', err.message || err);
  process.exit(1);
});
