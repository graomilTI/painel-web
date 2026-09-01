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

async function fetchReportApi(page) {
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Consultando API: ${dateRange.from} até ${dateRange.to}`);
  return page.evaluate(async (body) => {
    let token = '';
    for (let i = 0; i < localStorage.length; i += 1) {
      try { const value = JSON.parse(localStorage.getItem(localStorage.key(i))); if (value?.userToken) token = value.userToken; } catch (_) {}
    }
    const response = await fetch('/api/reports/classification/servicePlaces', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok || json.result === false) throw new Error(JSON.stringify(json).slice(0, 500));
    return json.searchData || [];
  }, { requestDateFrom: dateRange.from, requestDateTo: dateRange.to });
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
    cliente_nacional: row['Cliente Nacional'] || row.clnName || null,
    produto: row['Produto'] || null,
    coordenacao: row['Coordenação'] || null,
    servico: row['Serviço'] || null,
    local_tipo_servico: row['Tipo Local de Serviço'] || row.sptName || null,
    uf: row['UF'] || row.splCitUF || null,
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

// Promove os locais válidos direto do lote que acabamos de baixar para
// operacional_pontos_embarque (lookup geográfico usado por TODA O.S. via
// trg_operacional_os_resolver_ponto). Antes isso era um efeito colateral de
// sync-operacional-os, que relia numa janela de 5min sobre esta própria tabela
// pra adivinhar "o lote mais recente" — desnecessário agora que temos os dados
// em mãos aqui, na mesma execução que os baixou (01/09).
const LOTE_MINIMO_LOCAIS = 10;

function normKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toGeoNum(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isGeoBrasil(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= -34.5 && a <= 6 && b >= -75 && b <= -33;
}

function getField(row, aliases = []) {
  if (!row) return null;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const map = new Map();
  Object.keys(row).forEach((key) => map.set(normKey(key), row[key]));
  for (const alias of aliases) {
    const hit = map.get(normKey(alias));
    if (hit !== undefined) return hit;
  }
  return null;
}

function pontoKey({ uf, cidade, nome_local }) {
  return `${normKey(uf)}|${normKey(cidade)}|${normKey(nome_local)}`;
}

function mapLocalEmbarqueRow(d) {
  const latitude = toGeoNum(getField(d, ['Latitude', 'Lat', 'splLat']));
  const longitude = toGeoNum(getField(d, ['Longitude', 'Long', 'Lng', 'splLon']));
  return {
    tipo_local: toText(getField(d, ['Tipo do Local', 'Tipo Local', 'Tipo', 'sptName'])),
    nome_local: toText(getField(d, ['Local', 'Nome Local', 'Nome do Local', 'Local de Embarque', 'splName'])),
    uf: toText(getField(d, ['UF', 'Estado', 'splCitUF'])),
    cidade: toText(getField(d, ['Cidade', 'Municipio', 'Município', 'splCitName'])),
    latitude,
    longitude,
    ativo: true,
  };
}

async function promoverPontosEmbarque(rows) {
  const locaisMap = new Map();
  rows.forEach((raw) => {
    const local = mapLocalEmbarqueRow(raw);
    if (!local.uf || !local.cidade || !local.nome_local) return;
    if (!isGeoBrasil(local.latitude, local.longitude)) return;
    locaisMap.set(pontoKey(local), local);
  });

  if (locaisMap.size < LOTE_MINIMO_LOCAIS) {
    log('WARN', `[locais-embarque] lote com poucos locais válidos (${locaisMap.size}/${rows.length}); promoção para operacional_pontos_embarque ignorada.`);
    return;
  }

  const locais = [...locaisMap.values()];
  let sincronizados = 0;
  let ignoradosPorColisao = 0;
  for (let i = 0; i < locais.length; i += 500) {
    const chunk = locais.slice(i, i + 500);
    const { error } = await supabase
      .from('operacional_pontos_embarque')
      .upsert(chunk, { onConflict: 'nome_local,cidade,uf' });
    if (!error) { sincronizados += chunk.length; continue; }

    log('WARN', `[locais-embarque] chunk falhou (${error.message}); tentando linha a linha...`);
    for (const local of chunk) {
      const { error: rowError } = await supabase
        .from('operacional_pontos_embarque')
        .upsert([local], { onConflict: 'nome_local,cidade,uf' });
      if (rowError) ignoradosPorColisao++;
      else sincronizados++;
    }
  }

  log('SUCCESS', `[locais-embarque] ${sincronizados} pontos georreferenciados promovidos para operacional_pontos_embarque${ignoradosPorColisao ? ` (${ignoradosPorColisao} ignorados por colisão de cadastro duplicado)` : ''}.`);
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
    const data = await fetchReportApi(page);
    await upsertData(data);
    await promoverPontosEmbarque(data);
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
