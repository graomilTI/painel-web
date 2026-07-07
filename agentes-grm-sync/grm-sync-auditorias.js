require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const REPORT_CONFIG = {
  name: 'Auditorias',
  url: 'https://www.grmserver.com.br/report/classification/audit',
  groupByField: '#groupType',
  apiUrlPattern: 'consolidatedAudit',
  tableName: 'grm_auditorias_importacoes'
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

async function fetchAuditData(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  log('INFO', 'Selecionando agrupamento por Coordenação...');
  await page.click(REPORT_CONFIG.groupByField);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes('Coordenação'));
    if (option) option.click();
  });
  await page.waitForTimeout(300);

  log('INFO', 'Clicando em Atualizar e aguardando resposta da API...');
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes(REPORT_CONFIG.apiUrlPattern) && res.request().method() === 'POST', { timeout: 15000 }),
    page.click('.auditReport-act-update button')
  ]);

  const data = await response.json();
  log('SUCCESS', `${data.length} grupos recebidos`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const startedAt = new Date();
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: startedAt.toISOString(), sincronizado_em: startedAt.toISOString() }));

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    // Era upsert com onConflict:'id' sem enviar "id" no payload (coluna é
    // gen_random_uuid() por default) — nunca colidia com nada, então toda
    // sincronização só inseria linhas novas e a tabela crescia sem limite
    // (25 mil linhas em 19 dias). Só o lote mais recente importa (lido por
    // admin-auditoria.js), então trocamos por insert simples + limpeza do
    // que sobrou de execuções anteriores.
    const { error } = await supabase.from(REPORT_CONFIG.tableName).insert(chunk);
    if (error) throw error;
  }

  const { error: cleanupError } = await supabase
    .from(REPORT_CONFIG.tableName)
    .delete()
    .lt('created_at', startedAt.toISOString());
  if (cleanupError) log('WARN', `Falha ao limpar lote antigo de ${REPORT_CONFIG.tableName}: ${cleanupError.message}`);

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
    const data = await fetchAuditData(page);
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
setTimeout(() => process.exit(0), 90000);
