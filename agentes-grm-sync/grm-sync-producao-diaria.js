const { replaceTableSafely, replaceTablePeriodSafely } = require('./safe-table-load');
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

  log('INFO', 'Aguardando relatório estabilizar antes do XLS...');
  await page.waitForTimeout(30000);

  log('INFO', 'Clicando em XLS...');
  const tempDir = setupDownloadDir('producao-diaria');
  const filePath = await triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
  log('SUCCESS', `Arquivo baixado: ${filePath}`);

  return filePath;
}

async function fetchReportData(page) {
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Consultando API: ${dateRange.from} até ${dateRange.to}`);
  const rows = await page.evaluate(async (payload) => {
    let token = '';
    for (let i = 0; i < localStorage.length; i += 1) {
      try {
        const value = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (value?.userToken) token = value.userToken;
      } catch (_) {}
    }
    const response = await fetch('/api/reports/classification/staff/dailyProductionReport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok || !json.result) throw new Error(json.message || `HTTP ${response.status}`);
    return json.searchData || [];
  }, { loaDateFrom: dateRange.from, loaDateTo: dateRange.to, orderBy: 'SDO' });

  const data = rows.map((row) => ({
    'Coordenação': row.olcName,
    'Supervisão': row.olsName,
    'Funcionário': row.staName,
    'Tipo': row.staType === 'D' ? 'Diarista' : row.staType === 'I' ? 'Intermitente' : 'Efetivo',
    'Data': row.loaDate,
    'O.S.': row.sorCode,
    'Cliente': row.cliName,
    'Serviço': row.serName,
    'Cidade': row.citName,
    'Local de Embarque': row.splName,
    'Check-in': row.initHour,
    'Check-out': row.endHour,
    'Cargas': row.countLoads,
    'Tons': row.tons,
  }));
  log('SUCCESS', `${data.length} linhas recebidas pela API`);
  return data;
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

// producao_snapshot é a base de "Meta Mensal"/mapa do dashboard. Antes só era sincronizada
// quando alguém abria o painel no navegador (sincronizarProducaoSnapshotDoAgente, fire-and-
// forget) — sem isso o painel ficava 1-2h atrasado em relação ao grmserver, esperando
// alguém recarregar a página. Sincroniza direto aqui, no mesmo processo que já buscou os
// dados, sem depender de ninguém abrir o app.
function brDateToIsoSnapshot(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? s.slice(0, 10) : null;
}

function toTextSnapshot(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toNumberSnapshot(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const s = String(value).trim().replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return null;

  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  let normalized = s;

  if (comma >= 0 && dot >= 0) {
    // O separador que aparece por último é o decimal. Exemplos suportados:
    // 1.234,56 -> 1234.56 | 1,234.56 -> 1234.56
    normalized = comma > dot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (comma >= 0) {
    // Relatórios em pt-BR podem vir com vírgula decimal.
    normalized = s.replace(',', '.');
  }
  // Quando existe somente ponto, preserva como separador decimal.
  // A API do GRM retorna Tons dessa forma (ex.: "147.06").

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function mapProducaoSnapshotRow(d) {
  const data = brDateToIsoSnapshot(d?.Data);
  return {
    data_referencia: data,
    data,
    coordenacao: toTextSnapshot(d?.Coordenação),
    supervisao: toTextSnapshot(d?.Supervisão),
    funcionario: toTextSnapshot(d?.Funcionário),
    tipo: toTextSnapshot(d?.Tipo),
    os: toTextSnapshot(d?.['O.S.']),
    cliente: toTextSnapshot(d?.Cliente),
    servico: toTextSnapshot(d?.Serviço),
    cidade: toTextSnapshot(d?.Cidade),
    local_embarque: toTextSnapshot(d?.['Local de Embarque']),
    checkin: toTextSnapshot(d?.['Check-in']),
    checkout: toTextSnapshot(d?.['Check-out']),
    cargas: toNumberSnapshot(d?.Cargas),
    tons: toNumberSnapshot(d?.Tons),
  };
}

async function syncProducaoSnapshot(rows) {
  log('INFO', 'Sincronizando producao_snapshot...');

  const mapped = rows
    .map(mapProducaoSnapshotRow)
    .filter((row) => row.os && row.data && row.servico !== 'Total');

  if (!mapped.length) {
    log('WARN', 'Nenhuma linha válida para producao_snapshot; sincronização ignorada.');
    return;
  }

  const datas = mapped.map((row) => row.data).sort();
  const dataMin = datas[0];
  const dataMax = datas[datas.length - 1];

  await replaceTablePeriodSafely(supabase, 'producao_snapshot', mapped, {
    dateColumn: 'data',
    minRows: 1000,
    chunkSize: 500,
    logger: console,
  });

  log('SUCCESS', `producao_snapshot sincronizado: ${mapped.length} linhas (${dataMin} a ${dataMax}).`);
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
    const data = await fetchReportData(page);
    await upsertData(data);
    await syncProducaoSnapshot(data);

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