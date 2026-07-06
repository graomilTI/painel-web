process.env.TMPDIR = '/home/grao100/tmp';
process.env.TEMP = '/home/grao100/tmp';
process.env.TMP = '/home/grao100/tmp';

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
  // Quantos meses (a partir do mês atual, inclusive) re-enviar a cada execução.
  // Reenviar sempre os últimos N meses (não só o atual) torna a sincronização
  // auto-curativa: se uma execução falhar ou um mês ficar incompleto, o próximo
  // ciclo (de hora em hora) corrige sozinho, sem precisar de backfill manual.
  monthsBack: Number(process.env.DESPESAS_MONTHS_BACK) || 13
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateBr(d) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

// Lista dos N meses a sincronizar (mais antigo primeiro), cada um como {year, month0, from, to}.
function listMonthsToSync(monthsBack) {
  const today = new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const ref = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    months.push({ year: ref.getFullYear(), month0: ref.getMonth(), from: formatDateBr(first), to: formatDateBr(last) });
  }
  return months;
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
// "agrupar por" em 2 níveis: nível 1 (o de baixo) tem opções fixas (Coordenação/
// Supervisão/Funcionário/Fornecedor/Grupo de Categoria/Categoria/Veículos); nível 2
// (o de cima) só ganha opções DEPOIS que o nível 1 é escolhido (ex.: Ano/Mês/Grupo de
// Categoria/Categoria quando nível 1 = Coordenação).
//
// Escolhemos deliberadamente nível 1 = "Coordenacao" e nível 2 = "Grupo de Categoria":
// esse par devolve uma tabela pivot Coordenação × Categoria (DESPESAS OPERACIONAIS,
// DESPESAS RH, FOLHA DE PAGAMENTO, PATRIMONIO, etc.) — exatamente as mesmas colunas
// que o DRE já espera da planilha "Despesas por Regional" importada manualmente
// (ver parseDespesas em assets/js/modules/dre.js). Confirmado via diagnóstico ao vivo
// em 2026-06-24: as 15 colunas devolvidas batem 1:1 com os tópicos usados no DRE.
//
// IMPORTANTE: precisa ser um clique REAL do Puppeteer (ElementHandle.click()) — clique
// sintético via DOM (.click() dentro de page.evaluate) NÃO abre o menu do Vuetify.
async function pickGroupByOption(page, fieldIdx, wantedText) {
  const fields = await page.$$('.v-autocomplete.required');
  await fields[fieldIdx].click();
  await page.waitForTimeout(800);
  const picked = await page.evaluate((text) => {
    const ov = document.querySelector('.v-overlay--active');
    const opts = Array.from(ov?.querySelectorAll('[role="option"]') || []);
    const norm = (s) => String(s || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const target = opts.find((o) => norm(o.textContent) === norm(text)) || opts[0];
    if (target) { target.click(); return target.textContent.trim(); }
    return null;
  }, wantedText);
  await page.waitForTimeout(800);
  return picked;
}

async function fillGroupBySelects(page) {
  log('INFO', 'Selecionando agrupamento: Coordenação (nível 1) + Grupo de Categoria (nível 2)...');

  let positions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.v-autocomplete.required')).map((el) => el.getBoundingClientRect().top)
  );
  const bottomIdx = positions[0] > positions[1] ? 0 : 1;
  const picked1 = await pickGroupByOption(page, bottomIdx, 'Coordenacao');
  log('INFO', `Agrupamento (nível 1): ${picked1 || 'NENHUMA OPÇÃO ENCONTRADA'}`);

  positions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.v-autocomplete.required')).map((el) => el.getBoundingClientRect().top)
  );
  const topIdx = positions[0] < positions[1] ? 0 : 1;
  const picked2 = await pickGroupByOption(page, topIdx, 'Grupo de Categoria');
  log('INFO', `Agrupamento (nível 2): ${picked2 || 'NENHUMA OPÇÃO ENCONTRADA'}`);

  if (picked1 !== 'Coordenacao' && picked1 !== 'Coordenação') throw new Error(`Agrupamento nível 1 inesperado: ${picked1}`);
  if (picked2 !== 'Grupo de Categoria') throw new Error(`Agrupamento nível 2 inesperado: ${picked2}`);
}

// Ctrl+A + Backspace nem sempre limpa de verdade um campo de data mascarado do
// Vuetify (o "de" pode ficar preso na 1ª data digitada enquanto o "até" avança
// certo a cada mês, fazendo o relatório trazer o acumulado do ano até aquele mês
// em vez do mês isolado). Clique triplo + Backspace/Delete repetidos garante a
// limpeza mesmo se a seleção via teclado não colar no campo.
async function setDateField(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Backspace'); await page.keyboard.press('Delete'); }
  await page.type(selector, value);
}

// Diferente dos outros relatórios do GRM, "Despesas" NÃO gera um arquivo XLS pra
// download - o botão "GERAR RELATÓRIO" dispara um POST que devolve os dados já no
// corpo da resposta (uma tabela pivot agrupada pelos 2 campos escolhidos acima).
async function fetchReportForMonth(page, month) {
  log('INFO', `Buscando despesas de ${pad2(month.month0 + 1)}/${month.year} (${month.from} a ${month.to})...`);
  await setDateField(page, REPORT_CONFIG.dateFields.from, month.from);
  await setDateField(page, REPORT_CONFIG.dateFields.to, month.to);

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
    throw new Error(`Resposta inesperada da API de despesas (${month.from}-${month.to}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  log('SUCCESS', `Mês ${pad2(month.month0 + 1)}/${month.year}: ${json.searchCount ?? 0} grupo(s) de dados.`);
  return json;
}

// Converte a tabela pivot (1 linha por Coordenação, 1 coluna por Categoria + "Total")
// em registros individuais {Coordenação, <categoria>: valor, ...}.
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

function buildRecordsForMonth(month, rows) {
  return rows.map((row) => ({
    data_conta_de: toIso(month.from),
    data_conta_ate: toIso(month.to),
    coordenacao: row['Coordenação'] || null,
    supervisao: null,
    funcionario: null,
    fornecedor: null,
    grupo_categoria: null,
    categoria: null,
    vincular_caixa_operacional: null,
    valor: parseFloat(row['Total'] ?? 0) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(),
  }));
}

async function upsertData(records) {
  log('INFO', `Iniciando upsert de ${records.length} registros (${REPORT_CONFIG.monthsBack} meses)...`);
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

    log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
    await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(2000);
    await fillGroupBySelects(page);

    const months = listMonthsToSync(REPORT_CONFIG.monthsBack);
    const allRecords = [];
    for (const month of months) {
      const json = await fetchReportForMonth(page, month);
      const rows = pivotToRows(json);
      allRecords.push(...buildRecordsForMonth(month, rows));
    }

    await upsertData(allRecords);
    log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.message); process.exit(1); });
// Login + agrupamento + 1 chamada de relatório por mês (até 13 meses) + upsert.
setTimeout(() => process.exit(0), 280000);
