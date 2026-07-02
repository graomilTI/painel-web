const { replaceTableSafely, replaceTablePeriodSafely } = require('./safe-table-load');
require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { setupDownloadDir, waitForFileDownload } = require('./download-utils');

puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const REPORT_CONFIG = {
  name: 'Resultado Diário',
  url: 'https://www.grmserver.com.br/report/classification/dailyResultReport',
  dateFields: { from: '#requestDateFrom', to: '#requestDateTo' },
  incluirValoresField: '#addValues',
  xlsSelector: '.dailyResultReport-daily-result-report-to-xls button',
  tableName: 'grm_resultado_diario_importacoes',
  painelTableName: 'relatorio_resultado_diario',
  monthsBack: 1
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function calculateDateRange() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 29);
  const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { from: formatDate(pastDate), to: formatDate(today) };
}

function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getByAliases(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const expected = normalizeText(alias);
    const key = keys.find((candidate) => normalizeText(candidate) === expected);
    if (key && clean(row[key]) !== '') return row[key];
  }
  return null;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = clean(value);
  const br = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

async function login(page) {
  log('INFO', 'Iniciando login...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
  log('SUCCESS', 'Login realizado');
}

async function ensureAddValuesSim(page) {
  const field = REPORT_CONFIG.incluirValoresField;

  const already = await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    const wrap = input?.closest('.v-field__input');
    const text = wrap?.querySelector('.v-autocomplete__selection-text')?.textContent?.trim();
    return text || null;
  }, field);

  if (already && /^sim$/i.test(already)) {
    log('INFO', 'Campo "Incluir valores" já está em "Sim".');
    return;
  }

  log('INFO', 'Selecionando "Sim" no campo "Incluir valores" (necessário para trazer Embarcado/Afla/Vomitoxina/etc.)...');
  await page.click(field);
  await page.waitForTimeout(500);

  const selected = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.v-overlay--active.v-menu .v-list-item, .v-overlay--active.v-menu [role="option"]'))
      .find((el) => /^sim$/i.test((el.textContent || '').trim()));
    if (item) { item.click(); return true; }
    return false;
  });
  await page.waitForTimeout(400);

  if (!selected) {
    log('WARN', 'Não encontrei a opção "Sim" no campo "Incluir valores" — o relatório pode vir sem as colunas de valor.');
  } else {
    log('SUCCESS', '"Incluir valores" definido como "Sim".');
  }
}

async function downloadReport(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  await ensureAddValuesSim(page);

  const dateRange = calculateDateRange();
  log('INFO', `Preenchendo datas: ${dateRange.from} até ${dateRange.to}`);
  await page.type(REPORT_CONFIG.dateFields.from, dateRange.from);
  await page.keyboard.press('Tab');
  await page.type(REPORT_CONFIG.dateFields.to, dateRange.to);
  await page.keyboard.press('Tab');

  log('INFO', 'Clicando em Atualizar...');
  await page.click('.dailyResultReport-act-update button');
  log('INFO', 'Aguardando o GRM processar o relatório e liberar o XLS...');
  await page.waitForSelector('.dailyResultReport-daily-result-report-to-xls button:not([disabled])', { timeout: 120000 });

  log('INFO', 'Clicando em XLS...');
  const tempDir = setupDownloadDir('resultado-diario');

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir, eventsEnabled: true });

  await page.waitForSelector(REPORT_CONFIG.xlsSelector, { timeout: 30000 });
  await page.click(REPORT_CONFIG.xlsSelector);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.v-overlay--active.v-menu .v-list-item, .v-overlay--active.v-menu [role="option"]'))
      .find(el => /modelo padr/i.test(el.textContent || ''));
    if (item) item.click();
  });

  return waitForFileDownload(tempDir, 120000);
}

function normalizeHeaderCell(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

// Com "Incluir valores" = Sim, o GRM passa a inserir uma linha de aviso/disclaimer
// acima do cabeçalho real. Procuramos a linha que de fato contém "Data" e "Toneladas".
function findHeaderRowIndex(matrix) {
  const required = ['data', 'toneladas'];
  for (let i = 0; i < Math.min(matrix.length, 10); i += 1) {
    const cells = (matrix[i] || []).map(normalizeHeaderCell);
    const hits = required.filter((req) => cells.some((c) => c === req || c.includes(req)));
    if (hits.length === required.length) return i;
  }
  return -1;
}

async function parseXLS(filePath) {
  log('INFO', `Parseando arquivo: ${filePath}`);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null, raw: true });

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex === -1) {
    log('WARN', 'Não encontrei a linha de cabeçalho real (procurando "Data" e "Toneladas") — usando a primeira linha do arquivo.');
  }
  const usedIndex = headerRowIndex >= 0 ? headerRowIndex : 0;
  const headerRow = (matrix[usedIndex] || []).map((h, idx) => String(h ?? `COLUNA_${idx + 1}`).trim());

  const data = matrix.slice(usedIndex + 1)
    .map((line) => {
      const obj = {};
      headerRow.forEach((h, idx) => { if (h) obj[h] = line[idx] ?? null; });
      return obj;
    })
    .filter((row) => Object.values(row).some((v) => v !== null && String(v).trim() !== ''));

  log('INFO', `Cabeçalhos encontrados: ${headerRow.join(' | ')}`);
  log('SUCCESS', `${data.length} linhas parseadas`);
  return data;
}

// Mapeamento alinhado com a importação manual (assets/js/modules/relatorios.js,
// readResultadoDiarioRowsFromFile) — mesmas colunas, mesma regra: sem "Embarcado"
// preenchido a linha não entra no painel (é o que o DRE exige).
function mapResultadoDiarioToPainelRows(data) {
  return (data || []).map((row) => {
    const dataRegistro = toIsoDateValue(getByAliases(row, [
      'Data',
      'Data Classificação',
      'Data de Classificação',
      'Dt Classificação',
      'Dt. Classificação',
      'Data Resultado',
      'Data Embarque',
      'Data de Embarque',
    ]));

    const coordenacao = clean(getByAliases(row, ['Coordenação', 'Coordenacao', 'Regional']));
    const toneladas = toNumber(getByAliases(row, ['Toneladas', 'Tons', 'Ton', 'Ton.', 'Peso Líquido', 'Peso Liquido', 'Volume', 'Quantidade', 'Volume Classificado']));
    const embarcadoRaw = getByAliases(row, ['Embarcado', 'Volume Embarcado']);
    const embarcado = embarcadoRaw === null ? null : toNumber(embarcadoRaw);
    const totalEmbTeste = toNumber(getByAliases(row, ['Total Embarcado + Teste', 'Total Embarcado Mais Teste', 'Total Embarcado']));
    const cargas = toNumber(getByAliases(row, ['Cargas', 'Carga', 'Qtd Cargas', 'Qtde Cargas', 'Quantidade de Cargas']));

    return {
      os: clean(getByAliases(row, ['O.S.', 'O.S', 'OS', 'Ordem de Serviço', 'Ordem Servico', 'Nº OS', 'N° OS', 'Nr OS'])),
      contrato: clean(getByAliases(row, ['Contrato'])) || null,
      produto: clean(getByAliases(row, ['Produto'])) || null,
      data: dataRegistro,
      funcionario: clean(getByAliases(row, ['Funcionário', 'Funcionario', 'Classificador', 'Colaborador', 'Nome'])),
      coordenacao,
      supervisao: clean(getByAliases(row, ['Supervisão', 'Supervisao'])) || null,
      cliente_nacional: clean(getByAliases(row, ['Cliente Nacional', 'Cli. Nacional'])) || null,
      cliente_regional: clean(getByAliases(row, ['Cliente Regional', 'Cli. Regional'])) || null,
      cliente_final: clean(getByAliases(row, ['Cliente Final', 'Cli. Final'])) || null,
      local_embarque: clean(getByAliases(row, ['Local de Embarque', 'Local Embarque', 'Local', 'Cidade Embarque', 'Cidade de Embarque', 'Embarque', 'Ponto de Embarque'])),
      destino: clean(getByAliases(row, ['Destino'])) || null,
      cargas,
      toneladas,
      valor_ton: toNumber(getByAliases(row, ['R$/Ton', 'Valor Ton', 'Valor/Ton'])),
      cadencia: toNumber(getByAliases(row, ['Cadência', 'Cadencia'])),
      tons_cadencia: toNumber(getByAliases(row, ['Tons Cadência', 'Tons Cadencia'])),
      embarcado,
      valor_embarcado: toNumber(getByAliases(row, ['Valor Embarcado'])),
      valor_afla: toNumber(getByAliases(row, ['Valor Afla'])),
      total_afla: toNumber(getByAliases(row, ['Total Afla'])),
      valor_vomitoxina: toNumber(getByAliases(row, ['Valor Vomitoxina'])),
      total_vomitoxina: toNumber(getByAliases(row, ['Total Vomitoxina'])),
      valor_falling_number: toNumber(getByAliases(row, ['Valor Falling Number'])),
      total_falling_number: toNumber(getByAliases(row, ['Total Falling Number'])),
      valor_intacta: toNumber(getByAliases(row, ['Valor Intacta'])),
      total_intacta: toNumber(getByAliases(row, ['Total Intacta'])),
      valor_gmo: toNumber(getByAliases(row, ['Valor GMO'])),
      total_gmo: toNumber(getByAliases(row, ['Total GMO'])),
      total_embarcado_mais_teste: totalEmbTeste,
      remanescente: toNumber(getByAliases(row, ['Remanescente'])),
      motivo_nhe: clean(getByAliases(row, ['Motivo NHE'])) || null,
      observacoes_nhe: clean(getByAliases(row, ['Observações NHE', 'Observacoes NHE'])) || null,
      situacao: clean(getByAliases(row, ['Situação', 'Situacao'])) || null,
      observacoes: clean(getByAliases(row, ['Observações', 'Observacoes'])) || null,
    };
  }).filter((row) => {
    if (!(row.data && row.coordenacao !== '' && row.toneladas !== null)) return false;
    // mesma regra da importação manual: precisa de pelo menos um indicador de volume/embarcado/carga.
    const hasMetric = [row.toneladas, row.embarcado, row.total_embarcado_mais_teste, row.cargas].some((v) => v !== null && v !== 0);
    if (!hasMetric) return false;
    if (row.embarcado === null) {
      log('WARN', `O.S. ${row.os || '(sem número)'}: sem coluna "Embarcado" no XLS — verifique se "Incluir valores" está em "Sim".`);
      return false;
    }
    return true;
  });
}

async function replacePainelResultadoDiario(data) {
  const dateRange = calculateDateRange();
  const fromIso = toIso(dateRange.from);
  const toIsoRange = toIso(dateRange.to);
  const rows = mapResultadoDiarioToPainelRows(data);

  if (!rows.length) {
    log('WARN', `Nenhuma linha compatível com ${REPORT_CONFIG.painelTableName}. Verifique os cabeçalhos do XLS acima.`);
    return;
  }

  log('INFO', `Atualizando ${REPORT_CONFIG.painelTableName}: ${rows.length} registros de ${fromIso} até ${toIsoRange}...`);

  await replaceTablePeriodSafely(supabase, REPORT_CONFIG.painelTableName, rows, {
    dateColumn: 'data',
    minRows: 1000,
    chunkSize: 500,
    logger: console,
  });

  log('SUCCESS', `Tabela ${REPORT_CONFIG.painelTableName} sincronizada com segurança: ${rows.length} registros.`);

  log('SUCCESS', `${REPORT_CONFIG.painelTableName} atualizado: ${rows.length} registros`);
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const dateRange = calculateDateRange();
  const records = data.map(row => ({
    data_classificacao_de: toIso(dateRange.from),
    data_classificacao_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || null,
    uf_embarque: row['UF de Embarque'] || null,
    uf_destino: row['UF de Destino'] || null,
    produto: row['Produto'] || null,
    coordenacao: row['Coordenação'] || null,
    resultado: parseFloat(row['Resultado'] || row['Valor']) || null,
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
  await replacePainelResultadoDiario(data);
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
setTimeout(() => process.exit(0), 300000);
