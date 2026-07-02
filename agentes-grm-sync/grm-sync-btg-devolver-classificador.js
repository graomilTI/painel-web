require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

const wait = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
  console.log(`[BTG DEVOLVER] ${new Date().toISOString()} - ${msg}`);
}

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function clickText(page, text) {
  return page.evaluate(t => {
    const els = [...document.querySelectorAll('button,a,span,div')];
    const el = els.find(e => String(e.innerText || '').trim().toLowerCase() === t.toLowerCase());
    if (!el) return false;
    el.click();
    return true;
  }, text).catch(() => false);
}

async function getJob() {
  if (process.env.BTG_JOB_ID) {
    const { data, error } = await supabase
      .from('grm_sync_jobs')
      .select('id,payload')
      .eq('id', process.env.BTG_JOB_ID)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id,payload,status,created_at')
    .eq('agente_id', 'sync-btg-classificador')
    .in('status', ['pendente', 'rodando', 'processando'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data || []).find(j => j.payload && j.payload.acao === 'devolver_classificador_btg') || null;
}

async function login(page) {
  let counterparty = null;

  page.on('request', r => {
    const m = r.url().match(/\/api\/productclassifiers\/by-counterparty\/([^/?]+)/i);
    if (m && !counterparty) counterparty = decodeURIComponent(m[1]);
  });

  log('Abrindo portal BTG.');

  await page.goto('https://smc.btgpactual.com/freightOrder/classification/classifier', {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });

  await wait(2500);
  await clickText(page, 'Got it!');
  await wait(800);

  if (/login-smc\.btgpactual\.com/.test(page.url())) {
    log('Login necessário.');

    await page.waitForSelector('#input-username', { timeout: 30000 });
    await page.waitForSelector('#Password', { timeout: 30000 });

    await page.click('#input-username', { clickCount: 3 });
    await page.type('#input-username', process.env.BTG_SMC_USER || '', { delay: 15 });

    await page.click('#Password', { clickCount: 3 });
    await page.type('#Password', process.env.BTG_SMC_PASSWORD || '', { delay: 15 });

    const clicked = await clickText(page, 'Login');
    if (!clicked) await page.click('button.btg-button.btg-primary.full');

    for (let i = 0; i < 30; i++) {
      await wait(1000);
      if (!/login-smc\.btgpactual\.com/.test(page.url())) break;
    }
  }

  if (/login-smc\.btgpactual\.com/.test(page.url())) {
    throw new Error('Login BTG não avançou.');
  }

  log(`URL pós-login: ${page.url()}`);

  await page.waitForSelector('.dx-data-row', { timeout: 60000 }).catch(() => {});
  await wait(1500);

  if (!counterparty) {
    counterparty = await page.evaluate(() => {
      const urls = performance.getEntriesByType('resource').map(e => e.name);
      const hit = urls.find(u => /\/api\/productclassifiers\/by-counterparty\/([^/?]+)/i.test(u));
      const m = hit && hit.match(/\/api\/productclassifiers\/by-counterparty\/([^/?]+)/i);
      return m ? decodeURIComponent(m[1]) : null;
    });
  }

  return counterparty || 'CJCL0134.P';
}

async function contacts(page, code) {
  const result = await page.evaluate(async c => {
    const qs = new URLSearchParams({
      itasReference: c,
      pageNumber: '1',
      pageSize: '20',
      type: 'classifier'
    });

    const res = await fetch('/api/commoditiesmanagement/counterpartyContacts?' + qs.toString(), {
      credentials: 'include'
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    return { ok: res.ok, status: res.status, text, json };
  }, code);

  if (!result.ok) {
    throw new Error(`Erro contatos BTG HTTP ${result.status}: ${result.text}`);
  }

  const item = result.json && result.json.items && result.json.items[0];
  return item && item.classifier && Array.isArray(item.classifier.contacts)
    ? item.classifier.contacts
    : [];
}

async function order(page, code, osPortal) {
  const result = await page.evaluate(async (c, os) => {
    const qs = new URLSearchParams({
      page: '1',
      pageSize: '20',
      searchOrderServiceId: String(os)
    });

    const res = await fetch('/api/productclassifiers/by-counterparty/' + encodeURIComponent(c) + '?' + qs.toString(), {
      credentials: 'include'
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    return { ok: res.ok, status: res.status, text, json };
  }, code, osPortal);

  if (!result.ok) {
    throw new Error(`Erro OS BTG ${osPortal} HTTP ${result.status}: ${result.text}`);
  }

  return result.json && Array.isArray(result.json.data) ? result.json.data[0] : null;
}

async function assign(page, orderId, contactId) {
  // BTG_SKIP_DUPLICADAS_PATCH
  if (process.env.DRY_RUN === '1') {
    log(`[DRY_RUN] Vincularia OS BTG ${orderId} ao contato ${contactId}`);
    return { ok: true, skipped: false };
  }

  const result = await page.evaluate(async (o, c) => {
    const res = await fetch('/api/productclassifiers/' + encodeURIComponent(o) + '/assign-classifier/' + encodeURIComponent(c), {
      method: 'POST',
      credentials: 'include'
    });

    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, text };
  }, orderId, contactId);

  if (!result.ok) {
    const msg = String(result.text || '');

    if (result.status === 400 && msg.includes('Cannot change status from Pending to Pending')) {
      return {
        ok: true,
        skipped: true,
        reason: msg
      };
    }

    throw new Error(`Erro assign-classifier HTTP ${result.status}: ${result.text}`);
  }

  return { ok: true, skipped: false };
}

async function main() {
  const job = await getJob();

  if (!job || !job.payload || job.payload.acao !== 'devolver_classificador_btg') {
    log('Nenhum job devolver_classificador_btg encontrado.');
    return;
  }

  const itens = Array.isArray(job.payload.itens) ? job.payload.itens : [];
  log(`Job ${job.id}: ${itens.length} item(ns).`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    const code = await login(page);
    log(`Counterparty: ${code}`);

    const lista = await contacts(page, code);
    log(`Contatos carregados: ${lista.length}`);

    let ok = 0;
    let skip = 0;
    const erros = [];
    const osJaProcessadas = new Set();

    for (const item of itens) {
      const label = `${item.os_portal || '-'} / ${item.contrato || '-'} / ${item.classificador || '-'}`;

      try {
        const osKey = String(item.os_portal || '').trim();

        if (osKey && osJaProcessadas.has(osKey)) {
          skip++;
          log(`SKIP: ${label} -> OS repetida no mesmo job`);
          continue;
        }

        if (osKey) osJaProcessadas.add(osKey);

        const contato = lista.find(c => norm(c.name) === norm(item.classificador));

        if (!contato || !contato.contactId) {
          throw new Error(`Classificador não encontrado: ${item.classificador}`);
        }

        const os = await order(page, code, item.os_portal);

        if (!os || !os.id) {
          throw new Error(`OS portal não encontrada: ${item.os_portal}`);
        }

        const assignResult = await assign(page, os.id, contato.contactId);

        if (assignResult && assignResult.skipped) {
          skip++;
          log(`SKIP: ${label} -> BTG não permite alterar status atual`);
          continue;
        }

        ok++;
        log(`OK: ${label} -> contactId ${contato.contactId}`);
      } catch (err) {
        const msg = `${label}: ${err.message || err}`;
        erros.push(msg);
        log(`ERRO: ${msg}`);
      }
    }

    log(`Finalizado: ${ok}/${itens.length} vinculado(s), ${skip} ignorado(s).`);

    if (erros.length) {
      throw new Error(`Falhas em ${erros.length} item(ns): ${erros.slice(0, 5).join(' | ')}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  console.error('[BTG DEVOLVER] ERRO:', err.message || err);
  process.exit(1);
});
