process.env.TMPDIR = '/home/grao100/tmp';
process.env.TEMP = '/home/grao100/tmp';
process.env.TMP = '/home/grao100/tmp';

require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { setupDownloadDir, triggerAndWaitForDownload } = require('./download-utils');

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
  xlsSelector: '.serviceOrder-os-list-to-xls button',
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

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await page.waitForTimeout(4000);

  log('INFO', 'Clicando em XLS...');
  const tempDir = setupDownloadDir('lista-os');
  const filePath = await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
  log('SUCCESS', `Arquivo baixado: ${filePath}`);

  return filePath;
}

function parseXLS(filePath) {
  log('INFO', `Parseando arquivo: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}

// Já aconteceu de o clique no XLS disparar, por uma instabilidade de timing da tela, um
// export diferente (ex.: "Produção Ordem de Serviço.xlsx", sem Situação/Supervisão) em vez
// da Lista de OS de fato. Confere a coluna "Situação" pra não deixar passar batido numa
// execução automática sem ninguém olhando o log.
function validarColunas(data) {
  if (!data.length) throw new Error('XLS baixado sem nenhuma linha.');
  if (!('Situação' in data[0])) {
    throw new Error(`XLS baixado não é a Lista de OS esperada (faltou a coluna "Situação"; colunas recebidas: ${Object.keys(data[0]).join(', ')}).`);
  }
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


async function enfileirarOperacionalOs(totalImportado) {
  const { data, error } = await supabase.rpc('enqueue_grm_sync_job_internal', {
    p_agent_id: 'sync-operacional-os',
    p_payload: {
      origem: 'sync-lista-os',
      motivo: 'pos_importacao_lista_os',
      total_importado: Number(totalImportado || 0),
      solicitado_em: new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(
      `Lista de OS importada, mas falhou ao enfileirar sync-operacional-os: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      'Lista de OS importada, mas sync-operacional-os está desabilitado.'
    );
  }

  log(
    'SUCCESS',
    `Derivação operacional garantida na fila | sync-operacional-os | job=${data}`
  );

  return data;
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

    let data;
    const tentativas = 2;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      const filePath = await downloadReport(page);
      data = parseXLS(filePath);
      try {
        validarColunas(data);
        break;
      } catch (error) {
        if (tentativa === tentativas) throw error;
        log('WARN', `${error.message} Tentando exportar de novo (tentativa ${tentativa + 1}/${tentativas})...`);
        await page.waitForTimeout(3000);
      }
    }

    await upsertData(data);

    // PIPELINE_V2: operacional_os é responsabilidade exclusiva de sync-operacional-os.
    await enfileirarOperacionalOs(data.length);

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
