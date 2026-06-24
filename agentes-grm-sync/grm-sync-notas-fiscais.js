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
  name: 'Notas Fiscais',
  url: 'https://www.grmserver.com.br/report/finance/invoices',
  dateFields: { noteFrom: '#biiDateFrom', noteTo: '#biiDateTo', invoiceFrom: '#bilDateFrom', invoiceTo: '#bilDateTo' },
  xlsSelector: '.invoices-report-to-xls button',
  tableName: 'grm_notas_fiscais_importacoes',
  // 90 dias deixava o relatório pesado demais (falha recorrente: clique em XLS nunca
  // gerava arquivo, com erro JS no console da própria página do GRM). Como o agente
  // resincroniza a cada ~28min, uma janela menor ainda cobre tudo com folga.
  daysBack: 35
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
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);

  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Preenchendo datas: ${dateRange.from} até ${dateRange.to}`);

  await page.type(REPORT_CONFIG.dateFields.noteFrom, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.noteTo, dateRange.to);
  await page.type(REPORT_CONFIG.dateFields.invoiceFrom, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.invoiceTo, dateRange.to);

  // O download as vezes nao "pega" (provavelmente disputa de recursos quando varios
  // agentes headless rodam ao mesmo tempo no servidor) mesmo com a pagina/relatorio
  // saudaveis - por isso repete Atualizar+XLS antes de desistir.
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tempDir = setupDownloadDir('notas-fiscais');
    try {
      log('INFO', `Clicando em Atualizar... (tentativa ${attempt}/${maxAttempts})`);
      await page.click('.invoices-act-update button');
      await page.waitForSelector('.invoices-report-to-xls button:not([disabled])', { timeout: 90000 });

      log('INFO', 'Clicando em XLS...');
      return await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
    } catch (err) {
      lastError = err;
      log('WARN', `Tentativa ${attempt}/${maxAttempts} falhou: ${err.message}`);
      if (attempt < maxAttempts) await page.waitForTimeout(3000);
    }
  }
  throw lastError;
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
    data_nota_de: toIso(dateRange.from),
    data_nota_ate: toIso(dateRange.to),
    data_fatura_de: toIso(dateRange.from),
    data_fatura_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || row['Cliente'] || null,
    // A planilha real do GRM usa a chave "N.F." (confirmado via dados_json ao vivo em
    // 2026-06-24) - "Número NF"/"NF" nunca existiram, por isso numero_nf ficava sempre
    // nulo e o upsert (onConflict:'id', sem id no registro) so inseria linhas novas a
    // cada sincronizacao, acumulando ~380 mil duplicatas da mesma nota fiscal.
    numero_nf: row['N.F.'] != null ? String(row['N.F.']) : (row['Número NF'] || row['NF'] || null),
    valor_total: parseFloat(row['Valor Total'] || row['Valor Bruto'] || row['Valor']) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString()
  }));

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'numero_nf' });
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
// Com retry (ate 3 tentativas de ~90s cada para Atualizar+XLS) o script pode levar
// varios minutos num pior caso real; 120s matava o processo no meio da 2a tentativa
// SEM logar erro nenhum (parecia so "travar"). Aumentado para caber as 3 tentativas.
setTimeout(() => process.exit(0), 600000);
