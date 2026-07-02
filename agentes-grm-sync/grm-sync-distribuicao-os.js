require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { setupDownloadDir, triggerAndWaitForDownload } = require('./download-utils');
puppeteer.use(StealthPlugin());
const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });
const REPORT_CONFIG = { name: 'Distribuição de OS', url: 'https://www.grmserver.com.br/operation/sOrderDistribution', xlsSelector: '.sOrderDistribution-OSDistReportXLS button', tableName: 'grm_distribuicao_os_importacoes' };
function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
async function login(page) {
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
}
async function downloadReport(page) {
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  await page.click('.sOrderDistribution-act-update button');
  await page.waitForSelector('.sOrderDistribution-OSDistReportXLS button:not([disabled])', { timeout: 15000 });
  const tempDir = setupDownloadDir('distribuicao-os');
  return triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
}
async function parseXLS(filePath) {
  const data = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets[XLSX.readFile(filePath).SheetNames[0]]);
  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}
async function upsertData(data) {
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString() }));
  for (let i = 0; i < records.length; i += 100) {
    await supabase.from(REPORT_CONFIG.tableName).upsert(records.slice(i, i + 100), { onConflict: 'id' });
  }
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
    const data = await parseXLS(await downloadReport(page));
    await upsertData(data);
    log('SUCCESS', `${data.length} registros sincronizados`);
    log('SUCCESS', 'Concluído');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => process.exit(0), 120000);
