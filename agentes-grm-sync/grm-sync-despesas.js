require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const REPORT_CONFIG = {
  name: 'Despesas',
  url: 'https://www.grmserver.com.br/report/finance/expensesReport',
  dateFields: { from: '#pipDateFrom', to: '#pipDateTo' },
  tableName: 'grm_despesas_importacoes',
  monthsBack: 1
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function calculateDateRange(monthsBack) {
  const today = new Date();
  const pastDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
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

// O formulário tem 2 campos obrigatórios sem rótulo visível que funcionam como
// "agrupar por" em 2 níveis: nível 1 (o de baixo, posição vertical maior) tem opções
// fixas (Coordenação/Supervisão/Funcionário/Fornecedor/Grupo de Categoria/Categoria/
// Veículos); nível 2 (o de cima) só ganha opções DEPOIS que o nível 1 é escolhido (ex.:
// Ano/Mês/Grupo de Categoria/Categoria quando o nível 1 = Coordenação). A escolha em si
// não filtra dados, só define o agrupamento/pivot do relatório - mas sem preenchê-los o
// formulário nunca valida (sempre mostra "Preencha os campos obrigatórios").
// IMPORTANTE: precisa ser um clique REAL do Puppeteer (ElementHandle.click(), que simula
// um clique de mouse) - clique sintético via DOM (.click() dentro de page.evaluate) NÃO
// abre o menu do Vuetify. Essa era a causa raiz do agente nunca conseguir prosseguir.
async function fillGroupBySelects(page) {
  log('INFO', 'Preenchendo os 2 campos de agrupamento (Selecione)...');

  let fields = await page.$$('.v-autocomplete.required');
  if (fields.length < 2) {
    log('WARN', `Esperava 2 campos de agrupamento, encontrei ${fields.length}.`);
  }
  let positions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.v-autocomplete.required')).map((el) => el.getBoundingClientRect().top)
  );
  const bottomIdx = positions[0] > positions[1] ? 0 : 1;
  await fields[bottomIdx].click();
  await page.waitForTimeout(800);
  const picked1 = await page.evaluate(() => {
    const ov = document.querySelector('.v-overlay--active');
    const opt = ov?.querySelector('[role="option"]');
    if (opt) { opt.click(); return opt.textContent.trim(); }
    return null;
  });
  log('INFO', `Agrupamento (nível 1): ${picked1 || 'NENHUMA OPÇÃO ENCONTRADA'}`);
  await page.waitForTimeout(800);

  fields = await page.$$('.v-autocomplete.required');
  positions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.v-autocomplete.required')).map((el) => el.getBoundingClientRect().top)
  );
  const topIdx = positions[0] < positions[1] ? 0 : 1;
  await fields[topIdx].click();
  await page.waitForTimeout(800);
  const picked2 = await page.evaluate(() => {
    const ov = document.querySelector('.v-overlay--active');
    const opt = ov?.querySelector('[role="option"]');
    if (opt) { opt.click(); return opt.textContent.trim(); }
    return null;
  });
  log('INFO', `Agrupamento (nível 2): ${picked2 || 'NENHUMA OPÇÃO ENCONTRADA'}`);
  await page.waitForTimeout(800);
}

// Diferente dos outros relatórios do GRM, "Despesas" NÃO gera um arquivo XLS pra
// download - o botão "GERAR RELATÓRIO" dispara um POST que devolve os dados já no
// corpo da resposta (uma tabela pivot agrupada pelos 2 campos escolhidos acima, ex.:
// {"searchData":[{"cols":[{"title":2026},{"title":"Total"}],"rows":[["BAHIA",205158.5,205158.5],...]}]}).
// Por isso capturamos a resposta da API diretamente em vez de esperar um download.
async function fetchReportData(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);

  const dateRange = calculateDateRange(REPORT_CONFIG.monthsBack);
  log('INFO', `Preenchendo datas: ${dateRange.from} até ${dateRange.to}`);
  await page.type(REPORT_CONFIG.dateFields.from, dateRange.from);
  await page.type(REPORT_CONFIG.dateFields.to, dateRange.to);

  await fillGroupBySelects(page);

  log('INFO', 'Clicando em GERAR RELATÓRIO e aguardando resposta da API...');
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/reports/expenses') && res.request().method() === 'POST',
      { timeout: 60000 }
    ),
    (async () => {
      const gerarBtn = await page.evaluateHandle(() =>
        Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent.includes('GERAR RELATÓRIO'))
      );
      await page.evaluate((btn) => btn?.click(), gerarBtn);
    })(),
  ]);

  const json = await response.json();
  if (!json || json.result !== true) {
    throw new Error(`Resposta inesperada da API de despesas: ${JSON.stringify(json).slice(0, 300)}`);
  }
  log('SUCCESS', `Relatório recebido: ${json.searchCount ?? 0} grupo(s) de dados.`);
  return json;
}

// Converte a tabela pivot (1 linha por valor do agrupamento nível 1, 1 coluna por valor
// do nível 2 + "Total") em registros individuais {Coordenação, <coluna>: valor}.
function pivotToRows(json) {
  const block = json.searchData?.[0];
  if (!block) return [];
  const colTitles = (block.cols || []).map((c) => c.title);
  return (block.rows || [])
    .filter((row) => row[0] !== 'Total Colunas') // descarta a linha de total geral
    .map((row) => {
      const obj = { 'Coordenação': row[0] };
      colTitles.forEach((title, idx) => { obj[String(title)] = row[idx + 1]; });
      return obj;
    });
}

async function upsertData(rows) {
  log('INFO', `Iniciando upsert de ${rows.length} registros...`);
  const dateRange = calculateDateRange(REPORT_CONFIG.monthsBack);
  const records = rows.map((row) => ({
    data_conta_de: toIso(dateRange.from),
    data_conta_ate: toIso(dateRange.to),
    coordenacao: row['Coordenação'] || null,
    supervisao: null,
    funcionario: null,
    fornecedor: null,
    grupo_categoria: null,
    categoria: null,
    vincular_caixa_operacional: null,
    valor: parseFloat(row['Total'] ?? 0) || null,
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
    const json = await fetchReportData(page);
    const rows = pivotToRows(json);
    await upsertData(rows);
    log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.message); process.exit(1); });
// Login + preencher 2 campos de agrupamento + esperar resposta da API (até 60s) + upsert.
setTimeout(() => process.exit(0), 150000);
