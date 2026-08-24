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
  name: 'Notas Fiscais',
  url: 'https://www.grmserver.com.br/report/finance/invoices',
  dateFields: { noteFrom: '#biiDateFrom', noteTo: '#biiDateTo', invoiceFrom: '#bilDateFrom', invoiceTo: '#bilDateTo' },
  xlsSelector: '.invoices-report-to-xls button',
  tableName: 'grm_notas_fiscais_importacoes',
  // 90 dias deixava o relatório pesado demais (falha recorrente: clique em XLS nunca
  // gerava arquivo, com erro JS no console da própria página do GRM). Como o agente
  // resincroniza a cada ~28min, uma janela menor ainda cobre tudo com folga.
  daysBack: Number(process.env.GRM_NOTAS_DIAS || 30)
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

async function setDateField(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });

  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('Campo de data não encontrado: ' + sel);

    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }, selector, value);

  await page.waitForTimeout(250);
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

  await setDateField(page, REPORT_CONFIG.dateFields.noteFrom, dateRange.from);
  await setDateField(page, REPORT_CONFIG.dateFields.noteTo, dateRange.to);
  await setDateField(page, REPORT_CONFIG.dateFields.invoiceFrom, dateRange.from);
  await setDateField(page, REPORT_CONFIG.dateFields.invoiceTo, dateRange.to);

  const valoresDatas = await page.evaluate((fields) => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.value : null;
    };

    return {
      noteFrom: read(fields.noteFrom),
      noteTo: read(fields.noteTo),
      invoiceFrom: read(fields.invoiceFrom),
      invoiceTo: read(fields.invoiceTo)
    };
  }, REPORT_CONFIG.dateFields);

  log('INFO', 'Datas confirmadas na tela: ' + JSON.stringify(valoresDatas));

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
    const response = await fetch('/api/reports/finance/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok || !json.result) throw new Error(json.message || `HTTP ${response.status}`);
    return json.searchData || [];
  }, {
    biiDateFrom: dateRange.from,
    biiDateTo: dateRange.to,
    bilDateFrom: dateRange.from,
    bilDateTo: dateRange.to,
  });

  const data = rows.map((row) => ({
    'Fatura': row.bilCode,
    'Data da Fatura': row.bilDate,
    'Situação': row.bilStatus,
    'Empresa': row.scpName,
    'Cliente Nacional': row.cliName,
    'Coordenação': row.olcName,
    'Número NF': row.biiNumber,
    'Data N.F.': row.biiDate,
    'Valor Total': row.biiFinalValue,
    'Valor Bruto': row.biiMainValue,
    'Desconto': row.biiDiscountValue,
    'Acréscimo': row.biiIncreaseValue,
    'Imposto': row.biiTaxWithholdingValue,
    'Tons': row.tons,
  }));
  log('SUCCESS', `${data.length} linhas recebidas pela API`);
  return data;
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
  const mappedRecords = data.map(row => ({
    data_nota_de: toIso(dateRange.from),
    data_nota_ate: toIso(dateRange.to),
    data_fatura_de: toIso(dateRange.from),
    data_fatura_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || null,
    numero_nf: row['Número NF'] || row['NF'] || null,
    empresa: row['Empresa'] || null,
    fatura: row['Fatura'] != null ? String(row['Fatura']) : null,
    valor_total: parseFloat(row['Valor Total'] || row['Valor']) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString()
  }));
  // "N.F." (numero_nf) NAO identifica uma linha unica: uma mesma nota fiscal pode
  // agrupar varias Faturas (cargas/carregamentos distintos, cada um com seu
  // proprio Valor Bruto) - descoberto 24/08 depois de um buraco de ~R$9,36mi
  // (23,6% da receita) causado por essa suposicao errada. A linha de verdade e
  // por (Empresa, Fatura); dedupar so por N.F. descartava a maioria das Faturas.
  const byInvoice = new Map();
  const withoutInvoice = [];
  for (const record of mappedRecords) {
    if (record.empresa == null || record.fatura == null || record.fatura === '') withoutInvoice.push(record);
    else byInvoice.set(`${record.empresa}|${record.fatura}`, record);
  }
  const records = [...byInvoice.values(), ...withoutInvoice];

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'empresa,fatura' });
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
