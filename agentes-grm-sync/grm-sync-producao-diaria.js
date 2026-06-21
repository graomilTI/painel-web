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

const supabase = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  { realtime: { transport: WebSocket } }
);

const REPORT_CONFIG = {
  name: 'Produção Diária',
  url: 'https://www.grmserver.com.br/report/classification/staff/dailyProduction',
  dateFields: {
    from: '#loaDateFrom',
    to: '#loaDateTo'
  },
  orderByField: '#orderBy',
  orderByValue: 'Funcionário - Dia - OS',
  xlsSelector: '.dailyProductionReport-report-to-xls button',
  tableName: 'grm_producao_diaria_importacoes',
  daysBack: 30
};

function log(level, msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${level}] ${timestamp} - ${msg}`);
}

function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);

  return {
    from: formatDate(pastDate),
    to: formatDate(today)
  };
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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

  await Promise.all([
    page.click('button.submit-btn'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);

  log('SUCCESS', 'Login realizado com sucesso');
}

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Preencher datas
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);

  log('INFO', `Preenchendo datas: ${dateRange.from} até ${dateRange.to}`);
  await page.type(REPORT_CONFIG.dateFields.from, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.to, dateRange.to);

  // Selecionar ordenação
  log('INFO', `Selecionando ordenação: ${REPORT_CONFIG.orderByValue}`);
  await page.click(REPORT_CONFIG.orderByField);
  await page.waitForTimeout(500);
  await page.evaluate(
    (text) => {
      const option = Array.from(document.querySelectorAll('[role="option"]'))
        .find(el => el.textContent.includes(text));
      if (option) option.click();
    },
    REPORT_CONFIG.orderByValue
  );

  // Gerar relatório (Atualizar) e então clicar em XLS e aguardar download
  log('INFO', 'Clicando em Atualizar...');
  await page.click('.dailyProductionReport-act-update button');
  // 15s era curto demais para um relatório de 30 dias, especialmente com varios agentes
  // batendo no mesmo servidor a cada ~28min (causava "Waiting failed: 15000ms exceeded").
  await page.waitForSelector('.dailyProductionReport-report-to-xls button:not([disabled])', { timeout: 90000 });

  log('INFO', 'Clicando em XLS...');
  const tempDir = setupDownloadDir('producao-diaria');
  const filePath = await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
  log('SUCCESS', `Arquivo baixado: ${filePath}`);

  return filePath;
}

async function parseXLS(filePath) {
  log('INFO', `Parseando arquivo: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);

  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  const records = data.map(row => ({
    periodo_de: toIso(dateRange.from),
    periodo_ate: toIso(dateRange.to),
    funcionario: row['Funcionário'] || row['funcionario'] || null,
    dia: row['Dia'] || row['dia'] || null,
    os: row['O.S.'] || row['os'] || null,
    producao: parseFloat(row['Produção'] || row['producao']) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString()
  }));

  const chunkSize = 100;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase
      .from(REPORT_CONFIG.tableName)
      .upsert(chunk, { onConflict: 'id' });

    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + chunkSize, records.length)}/${records.length}`);
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

main().then(() => process.exit(0)).catch(err => {
  log('ERROR', err.message);
  process.exit(1);
});
// Os waits internos (botao XLS + download) foram de 15s/60s para 90s/90s; 120s aqui
// podia matar o processo silenciosamente (sem logar erro) antes de um caso lento real
// terminar. Aumentado para dar margem real aos timeouts novos.
setTimeout(() => process.exit(0), 280000);
