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

const REPORT_CONFIG = {
  name: 'Locais de Embarque',
  url: 'https://www.grmserver.com.br/report/classification/servicePlaces',
  dateFields: { from: '#requestDateFrom', to: '#requestDateTo' },
  xlsSelector: '.servicePlaces-report-to-xls button',
  tableName: 'grm_locais_embarque_importacoes',
  daysBack: 30
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { from: formatDate(pastDate), to: formatDate(today) };
}

function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

async function login(page) {
  log('INFO', 'Iniciando login...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
  log('SUCCESS', 'Login realizado');
}

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Preenchendo datas: ${dateRange.from} até ${dateRange.to}`);
  await page.type(REPORT_CONFIG.dateFields.from, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.to, dateRange.to);

  log('INFO', 'Clicando em Atualizar...');
  await page.click('.servicePlaces-act-update button');

  // Aguarda o GRM processar o relatório antes de tentar baixar o XLS.
  await page.waitForTimeout(8000);

  try {
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 });
  } catch (_) {
    log('INFO', 'Network idle não confirmou, seguindo com validação do botão XLS...');
  }

  await page.waitForSelector(REPORT_CONFIG.xlsSelector, { visible: true, timeout: 30000 });

  const xlsEnabled = await page.$eval(REPORT_CONFIG.xlsSelector, (btn) => !btn.disabled && !btn.closest('[disabled]'));
  if (!xlsEnabled) {
    throw new Error('Botão XLS encontrado, mas ainda está desabilitado');
  }

  log('INFO', 'Clicando em XLS...');
  const tempDir = setupDownloadDir('locais-embarque');

  try {
    return await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir, { timeout: 120000 });
  } catch (error) {
    const debugDir = '/tmp/grm-sync-debug';
    fs.mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, 'locais-embarque-timeout.png'), fullPage: true });
    fs.writeFileSync(path.join(debugDir, 'locais-embarque-timeout.html'), await page.content());
    log('DEBUG', `Screenshot salvo em ${path.join(debugDir, 'locais-embarque-timeout.png')}`);
    log('DEBUG', `HTML salvo em ${path.join(debugDir, 'locais-embarque-timeout.html')}`);
    throw error;
  }
}

async function parseXLS(filePath) {
  log('INFO', `Parseando arquivo: ${filePath}`);
  const data = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets[XLSX.readFile(filePath).SheetNames[0]]);
  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  const records = data.map(row => ({
    data_solicitacao_de: toIso(dateRange.from),
    data_solicitacao_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || null,
    produto: row['Produto'] || null,
    coordenacao: row['Coordenação'] || null,
    servico: row['Serviço'] || null,
    local_tipo_servico: row['Tipo Local de Serviço'] || null,
    uf: row['UF'] || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString()
  }));

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
    log('INFO', `=== Iniciando sincronização ${REPORT_CONFIG.name} ===`);
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
    const filePath = await downloadReport(page);
    const data = await parseXLS(filePath);
    await upsertData(data);
    log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.message); process.exit(1); });
setTimeout(() => {
  console.error('[ERROR] Timeout global de 5 minutos atingido');
  process.exit(1);
}, 300000);
