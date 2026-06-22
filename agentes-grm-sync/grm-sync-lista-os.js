require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { setupDownloadDir, prepareDownload, waitForFileDownload } = require('./download-utils');

puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  { realtime: { transport: WebSocket } }
);

// Tela "ORDEM DE SERVIÇO" (/operation/serviceOrder) — não é uma tela de "report/*" como os
// outros agentes, é a grade de Ordem de Serviço do sistema. Situação="Abertas" e
// Financeiro="Não Faturadas" já vêm marcados por padrão; deixamos Coordenação/Supervisão/
// Data em branco para trazer todas as regionais (confirmado com a operação, que exporta
// assim manualmente). O XLS gerado aqui tem as colunas Situação, Financeiro, Supervisão,
// Serviço e Embarcado que o lote anterior do agente não tinha.
const REPORT_CONFIG = {
  name: 'Lista de OS',
  url: 'https://www.grmserver.com.br/operation/serviceOrder',
  tableName: 'grm_lista_os_importacoes',
};

function log(level, msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${level}] ${timestamp} - ${msg}`);
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

// O botão de exportar é um ícone sem classe CSS conhecida (não tivemos acesso ao DOM real
// pra inspecionar) — na tela é o 2º ícone da barra de ferramentas, com a legenda "XLS"
// visível abaixo do ícone. Localiza pelo texto "XLS" e clica no ancestral clicável mais
// próximo. Se a UI do grmserver mudar, isso passa a falhar com a mensagem abaixo — nesse
// caso é preciso inspecionar a tela de novo e ajustar este trecho.
async function clickXlsButton(page) {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('body *')).filter(
      (el) => el.children.length === 0 && el.textContent.trim().toUpperCase() === 'XLS'
    );
    for (const el of candidates) {
      const clickable = el.closest('button, a, [role="button"], .v-btn, [class*="btn" i]') || el;
      clickable.click();
      return true;
    }
    return false;
  });
  if (!clicked) {
    throw new Error('Botão "XLS" não encontrado na tela de Ordem de Serviço — a UI do grmserver pode ter mudado.');
  }
}

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 30000 });
  await page.waitForTimeout(2000);

  const tempDir = setupDownloadDir('lista-os');
  await prepareDownload(page, tempDir);

  log('INFO', 'Clicando em XLS...');
  await clickXlsButton(page);
  const filePath = await waitForFileDownload(tempDir, 90000);
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

  const now = new Date().toISOString();
  const records = data.map((row) => ({
    dados_json: row,
    data_sincronizacao: now,
    sincronizado_em: now,
  }));

  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).insert(chunk);

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
setTimeout(() => process.exit(0), 280000);
