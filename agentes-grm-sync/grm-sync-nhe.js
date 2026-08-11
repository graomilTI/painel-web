process.env.TMPDIR = '/home/grao100/tmp';
process.env.TEMP = '/home/grao100/tmp';
process.env.TMP = '/home/grao100/tmp';

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
const REPORT_CONFIG = { name: 'NHE', url: 'https://www.grmserver.com.br/report/classification/nhe', dateFields: { from: '#lnsDateFrom', to: '#lnsDateTo' }, xlsSelector: '.nheReport-report-to-xls button', tableName: 'grm_nhe_importacoes', daysBack: Math.max(1, Number(process.env.NHE_SYNC_DAYS_BACK) || 1) };
function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { from: `${String(pastDate.getDate()).padStart(2, '0')}/${String(pastDate.getMonth() + 1).padStart(2, '0')}/${pastDate.getFullYear()}`, to: `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}` };
}
async function login(page) {
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
}
async function downloadReport(page) {
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  await page.type(REPORT_CONFIG.dateFields.from, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.to, dateRange.to);
  await page.click('.nheReport-act-update button');
  await page.waitForSelector('.nheReport-report-to-xls button:not([disabled])', { timeout: 15000 });
  const tempDir = setupDownloadDir('nhe');
  return triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
}
async function fetchReportApi(page) {
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  return page.evaluate(async (body) => {
    let token = '';
    for (let i = 0; i < localStorage.length; i += 1) {
      try { const value = JSON.parse(localStorage.getItem(localStorage.key(i))); if (value?.userToken) token = value.userToken; } catch (_) {}
    }
    const response = await fetch('/api/reports/classification/nhe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok || json.result === false) throw new Error(JSON.stringify(json).slice(0, 500));
    return json.searchData || [];
  }, { lnsDateFrom: dateRange.from, lnsDateTo: dateRange.to });
}
async function parseXLS(filePath) {
  const data = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets[XLSX.readFile(filePath).SheetNames[0]]);
  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}
async function upsertData(data) {
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString() }));
  for (let i = 0; i < records.length; i += 100) {
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(records.slice(i, i + 100), { onConflict: 'id' });
    if (error) throw error;
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
        '--noerrdialogs',
        '--disable-breakpad',
        '--disable-crashpad',
        '--disable-crash-reporter',
        '--disable-gpu',
        '--disable-software-rasterizer',
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
      defaultViewport: { width: 1366, height: 768 }
    });
    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });
    await login(page);
    const data = await fetchReportApi(page);
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
