require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const REPORT_CONFIG = {
  name: 'Contas a Pagar',
  url: 'https://www.grmserver.com.br/finance/payInvoice',
  apiUrlPattern: 'payInvoice/getRecords',
  tableName: 'grm_contas_pagar_importacoes'
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

async function login(page) {
  log('INFO', 'Iniciando login...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
  log('SUCCESS', 'Login realizado');
}

async function fetchInvoiceData(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });

  log('INFO', 'Chamando API diretamente via fetch autenticado...');
  const json = await page.evaluate(async () => {
    let token = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed && parsed.userToken) { token = parsed.userToken; break; }
      } catch (e) {}
    }
    const res = await fetch('/api/payInvoice/getRecords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ pinStatus: 'A', moreThenOneCompany: 'S' })
    });
    return res.json();
  });

  const data = json.searchData || [];
  log('SUCCESS', `${data.length} registros recebidos`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString() }));

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }

  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
}

async function main() {
  let browser;
  try {
    log('INFO', `=== ${REPORT_CONFIG.name} ===`);
    browser = await puppeteer.launch({
      headless: true,
      dumpio: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ],
      defaultViewport: { width: 1920, height: 1440 }
    });
    const page = await browser.newPage();
    page.setViewport({ width: 1920, height: 1440 });
    await login(page);
    const data = await fetchInvoiceData(page);
    await upsertData(data);
    log('SUCCESS', 'Concluído');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.message); process.exit(1); });
setTimeout(() => process.exit(0), 120000);
