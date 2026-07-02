const { replaceTableSafely } = require('./safe-table-load');
require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const CONTRATO_BTG_RE = /^P\d{5}\.\d{3}$/i;
const DRY_RUN = process.env.DRY_RUN === '1';
const PAGE_SIZE = 50;
const MAX_PAGES = 40;

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
function clean(v) { return String(v ?? '').trim(); }
function contratoNorm(v) { return clean(v).toUpperCase().replace(/\s+/g, ''); }
function isContratoBtg(v) { return CONTRATO_BTG_RE.test(contratoNorm(v)); }
function contratoLabel(v) { const c = contratoNorm(v); return isContratoBtg(c) ? c : 'CORRIGIR CONTRATO'; }
function fnum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const c = String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const p = parseFloat(c);
  return Number.isFinite(p) ? p : 0;
}

async function login(page) {
  let counterpartyCode = null;
  page.on('request', (r) => {
    const m = r.url().match(/\/api\/productclassifiers\/by-counterparty\/([^/?]+)/i);
    if (m && !counterpartyCode) counterpartyCode = decodeURIComponent(m[1]);
  });

  await page.goto('https://smc.btgpactual.com/freightOrder/classification/classifier', { waitUntil: 'networkidle2', timeout: 60000 });
  // BTG_COOKIE_OK_PATCH
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('button,a,span,div')];
    const el = els.find(e => String(e.innerText || '').trim().toLowerCase() === 'got it!');
    if (el) el.click();
  }).catch(() => {});
  await page.waitForTimeout(800);
  if (/login-smc\.btgpactual\.com/.test(page.url())) {
    await page.type('#input-username', process.env.BTG_SMC_USER);
    await page.type('#Password', process.env.BTG_SMC_PASSWORD);
    await Promise.all([
      page.click('button.btg-button.btg-primary.full'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    ]);
  }
  log('INFO', `URL pós-login: ${page.url()}`);

  await page.waitForSelector('.dx-data-row', { timeout: 30000 });
  await page.waitForTimeout(1000);
  if (!counterpartyCode) throw new Error('Não foi possível identificar o código de contraparte (by-counterparty) na página.');
  log('INFO', `Código de contraparte detectado: ${counterpartyCode}`);
  return counterpartyCode;
}

// A grade usa paginação real no backend; clicar no botão "Exportar" só captura a página
// atualmente carregada (confirmado: 15 de 267 itens). Buscar direto na API que a própria
// grade consome é a única forma confiável de obter todos os registros.

// BTG_OS_DETALHE_PATCH
async function fetchBtgOrderByServiceId(page, counterpartyCode, orderServiceId) {
  const result = await page.evaluate(async (code, osId) => {
    const qs = new URLSearchParams();
    qs.set('page', '1');
    qs.set('pageSize', '20');
    qs.set('searchOrderServiceId', String(osId));

    const url = '/api/productclassifiers/by-counterparty/' + encodeURIComponent(code) + '?' + qs.toString();

    const res = await fetch(url, { credentials: 'include' });
    const text = await res.text();

    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    return {
      ok: res.ok,
      status: res.status,
      text,
      json,
    };
  }, counterpartyCode, orderServiceId);

  if (!result.ok) {
    throw new Error('Erro ao consultar OS BTG ' + orderServiceId + ': HTTP ' + result.status + ' ' + result.text);
  }

  const item = result.json && Array.isArray(result.json.data) ? result.json.data[0] : null;

  if (!item) {
    return null;
  }

  return {
    id: item.id,
    orderId: item.orderId,
    status: item.status,
    classifierName: item.classifierName || '',
    contract: item.contract || '',
    checkInStatus: item.checkInStatus || '',
    tokenOrigin: item.tokenOrigin || '',
    tokenCadence: item.tokenCadence || '',
    raw: item,
  };
}



// BTG_COUNTERPARTY_72_PATCH
async function fetchBtgCounterparty(page, counterpartyId = 72) {
  const result = await page.evaluate(async (id) => {
    const res = await fetch('/api/commoditiesmanagement/counterparty/' + encodeURIComponent(id), {
      credentials: 'include'
    });

    const text = await res.text();
    let json = null;

    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    return {
      ok: res.ok,
      status: res.status,
      text,
      json
    };
  }, counterpartyId);

  if (!result.ok) {
    throw new Error('Erro ao buscar counterparty BTG ' + counterpartyId + ': HTTP ' + result.status + ' ' + result.text);
  }

  return result.json;
}

function getBtgClassifierContactsFromCounterparty(counterparty) {
  return counterparty && counterparty.classifier && Array.isArray(counterparty.classifier.contacts)
    ? counterparty.classifier.contacts
    : [];
}



// BTG_PUT_CONTATOS_PATCH
function buildBtgClassifierContact(pessoa, classifierId = 6) {
  return {
    contactId: pessoa.contactId || 0,
    name: pessoa.nome || pessoa.name || pessoa.classificador || '',
    role: pessoa.role || 'Classificador',
    phone: pessoa.whatsapp || pessoa.telefone || pessoa.phone || '',
    email: pessoa.email || '',
    receiveNewsletters: false,
    isDeleted: false,
    classifierId,
    classifier: null,
    producerPropertyId: null,
    producerProperty: null,
    terminalId: null,
    terminal: null,
    transhipCompanyId: null,
    transhipCompany: null,
    transhipmentId: null,
    transhipment: null,
    producerId: null,
    producer: null
  };
}

async function putBtgClassifierContacts(page, contacts, classifierId = 6) {
  const result = await page.evaluate(async (classifierId, contacts) => {
    const res = await fetch('/api/commoditiesmanagement/counterpartyContacts/contact/' + encodeURIComponent(classifierId) + '?type=1', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(contacts)
    });

    const text = await res.text();
    let json = null;

    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    return {
      ok: res.ok,
      status: res.status,
      text,
      json
    };
  }, classifierId, contacts);

  if (!result.ok) {
    throw new Error('Erro ao salvar contatos/classificadores BTG: HTTP ' + result.status + ' ' + result.text);
  }

  return result.json || result.text || true;
}

async function ensureBtgClassifierContact(page, counterpartyCode, pessoa, classifierId = 6) {
  let contacts = [];

  if (typeof fetchBtgClassifierContactsPaged === 'function') {
    contacts = await fetchBtgClassifierContactsPaged(page, counterpartyCode);
  } else if (typeof fetchClassifierContacts === 'function') {
    contacts = await fetchClassifierContacts(page, counterpartyCode);
  }

  const foundBefore = typeof findBtgClassifierContact === 'function'
    ? findBtgClassifierContact(contacts, pessoa)
    : (typeof findClassifierContact === 'function' ? findClassifierContact(contacts, pessoa) : null);

  if (foundBefore) {
    return {
      created: false,
      contact: foundBefore
    };
  }

  const novo = buildBtgClassifierContact(pessoa, classifierId);

  if (!novo.name || !novo.email) {
    throw new Error('Classificador sem nome ou e-mail para cadastrar na BTG: ' + JSON.stringify(pessoa));
  }

  const updated = [...contacts, novo];

  await putBtgClassifierContacts(page, updated, classifierId);

  let refreshed = [];

  if (typeof fetchBtgClassifierContactsPaged === 'function') {
    refreshed = await fetchBtgClassifierContactsPaged(page, counterpartyCode);
  } else if (typeof fetchClassifierContacts === 'function') {
    refreshed = await fetchClassifierContacts(page, counterpartyCode);
  }

  const foundAfter = typeof findBtgClassifierContact === 'function'
    ? findBtgClassifierContact(refreshed, pessoa)
    : (typeof findClassifierContact === 'function' ? findClassifierContact(refreshed, pessoa) : null);

  if (!foundAfter) {
    throw new Error('Contato cadastrado, mas não foi localizado no retorno da BTG.');
  }

  return {
    created: true,
    contact: foundAfter
  };
}


async function fetchAllClassifications(page, counterpartyCode) {
  const all = [];
  const seenIds = new Set();
  let totalCount = null;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const result = await page.evaluate(async (code, pageNum, pageSize) => {
      const res = await fetch(`/api/productclassifiers/by-counterparty/${encodeURIComponent(code)}?page=${pageNum}&pageSize=${pageSize}`, { credentials: 'include' });
      if (!res.ok) return { ok: false, status: res.status };
      const json = await res.json();
      return { ok: true, totalCount: json.totalCount, data: json.data || [] };
    }, counterpartyCode, p, PAGE_SIZE);

    if (!result.ok) {
      if (result.status === 404) { log('INFO', `Página ${p}: HTTP 404 — fim da paginação.`); break; }
      throw new Error(`Falha ao buscar página ${p} (HTTP ${result.status})`);
    }
    totalCount = result.totalCount;
    if (!result.data.length) break;
    for (const item of result.data) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      all.push(item);
    }
    log('INFO', `Página ${p}: +${result.data.length} (acumulado ${all.length}/${totalCount ?? '?'})`);
    if (totalCount != null && all.length >= totalCount) break;
  }
  return all;
}

function mapRows(items) {
  const now = new Date().toISOString();
  return items
    .map((item) => {
      const contratoOriginal = contratoNorm(item.contract);
      return {
        contrato_original: contratoOriginal,
        contrato_status: contratoLabel(contratoOriginal),
        numero_os_relatorio: clean(item.id) || null,
        tipo_solicitacao: clean(item.commodity) || 'Relatório BTG',
        cliente: null,
        commodity: clean(item.commodity) || null,
        quantidade: fnum(item.contractOrigQuan),
        aba: 'Sheet',
        linha: null,
        checkin_diario: clean(item.checkInStatus).toLowerCase() || null,
        updated_at: now,
      };
    })
    .filter((r) => r.contrato_original);
}

async function upsertData(records) {
  if (!records || !records.length) {
    log('WARN', 'Nenhum registro para logistica_btg_solicitacoes; sincronização ignorada.');
    return;
  }

  await replaceTableSafely(supabase, 'logistica_btg_solicitacoes', records, {
    minRows: 1,
    chunkSize: 500,
    logger: console,
  });

  log('SUCCESS', `logistica_btg_solicitacoes sincronizada com segurança: ${records.length} registros.`);
}

async function main() {
  let browser;
  try {
    log('INFO', '=== BTG SMC - Classificador de Frete ===');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setViewport({ width: 1920, height: 1440 });
    const counterpartyCode = await login(page);
    const items = await fetchAllClassifications(page, counterpartyCode);
    log('INFO', `${items.length} registro(s) obtidos da API`);
    const records = mapRows(items);
    log('INFO', `${records.length} registro(s) válidos (com contrato) após mapeamento`);
    await upsertData(records);
    log('SUCCESS', 'Concluído');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => process.exit(0), 180000);
