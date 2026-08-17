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

const REPORT_CONFIG = {
  name: 'Mapa de Embarque',
  url: 'https://www.grmserver.com.br/boardingMap',
  checkboxField: '#withLogistic',
  xlsSelector: '.act-boardingMap-list-xls button',
  tableName: 'grm_mapa_embarque_importacoes'
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

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  log('INFO', 'Alternando para visualização em lista...');
  const listClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const listButton = buttons.find((btn) =>
      btn.innerHTML.includes('/assets/icons/system/171-view-list-outline.json')
      || String(btn.className || '').includes('act-boardingMap-list')
    );

    if (!listButton) return false;
    listButton.click();
    return true;
  });

  if (!listClicked) {
    log('INFO', 'Botão de lista não encontrado, seguindo no modo atual...');
  }

  await page.waitForTimeout(8000);

  log('INFO', 'Atualizando dados do Mapa de Embarque...');
  const updateClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const updateButton = buttons.find((btn) =>
      btn.innerHTML.includes('/assets/icons/system/18-autorenew-outline.json')
      || btn.getAttribute('type') === 'submit'
    );

    if (!updateButton) return false;
    updateButton.click();
    return true;
  });

  if (!updateClicked) {
    log('INFO', 'Botão de atualizar não encontrado, seguindo sem atualizar...');
  }

  await page.waitForTimeout(20000);

  log('INFO', 'Selecionando "Apenas com logística"...');
  const logisticClicked = await page.evaluate(() => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase();

    const elements = Array.from(document.querySelectorAll('label, .v-label, .v-selection-control, .v-input, .v-checkbox, div, span'));
    const target = elements.find((el) => normalize(el.innerText || el.textContent).includes('apenas com logistica'));

    if (!target) return false;

    const clickable = target.closest('.v-selection-control, .v-input, .v-checkbox, label') || target;
    clickable.click();
    return true;
  });

  if (!logisticClicked) {
    log('INFO', 'Filtro "Apenas com logística" não encontrado por texto, seguindo sem alterar filtro...');
  }

  // Aguarda o mapa atualizar antes de exportar.
  await page.waitForTimeout(15000);

  try {
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 90000 });
  } catch (_) {
    log('INFO', 'Network idle não confirmou, seguindo com validação do XLS...');
  }

  await page.waitForSelector(REPORT_CONFIG.xlsSelector, { visible: true, timeout: 90000 });

  const tempDir = setupDownloadDir('mapa-embarque');

  log('INFO', 'Clicando em XLS...');
  try {
    return await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir, { timeout: 120000 });
  } catch (error) {
    const debugDir = '/tmp/grm-sync-debug';
    fs.mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, 'mapa-embarque-timeout.png'), fullPage: true });
    fs.writeFileSync(path.join(debugDir, 'mapa-embarque-timeout.html'), await page.content());
    log('DEBUG', `Screenshot salvo em ${path.join(debugDir, 'mapa-embarque-timeout.png')}`);
    log('DEBUG', `HTML salvo em ${path.join(debugDir, 'mapa-embarque-timeout.html')}`);
    throw error;
  }
}

async function parseXLS(filePath) {
  log('INFO', `Parseando arquivo: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const data = XLSX.utils.sheet_to_json(ws).filter((row) =>
    Object.values(row || {}).some((value) => String(value ?? '').trim() !== '')
  );

  if (!data.length) {
    const debugDir = '/tmp/grm-sync-debug';
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(path.join(debugDir, 'mapa-embarque-xls-vazio.json'), JSON.stringify({
      filePath,
      sheets: wb.SheetNames,
      range: ws['!ref'],
      primeirasLinhas: rows.slice(0, 15)
    }, null, 2));
    throw new Error(`XLS baixado sem dados úteis. Range: ${ws['!ref'] || 'sem range'}`);
  }

  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const records = data.map(row => ({
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

async function processarAlertasDeAtualizacao() {
  const { data, error } = await supabase.functions.invoke('mapa-embarque-alertas', {
    body: { action: 'scan' }
  });
  if (error) throw new Error(`Falha ao processar alertas do Mapa de Embarque: ${error.message}`);
  if (!data?.ok) throw new Error(`Alertas do Mapa de Embarque recusados: ${data?.error || 'resposta inválida'}`);
  log('SUCCESS', `Alertas processados: ${JSON.stringify(data)}`);
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
    const filePath = await downloadReport(page);
    const data = await parseXLS(filePath);
    await upsertData(data);
    await processarAlertasDeAtualizacao();
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
