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
  name: 'Adiantamentos (Solicitações Caixa Operacional)',
  url: 'https://www.grmserver.com.br/finance/oFlowRequest',
  tableName: 'grm_adiantamentos_importacoes'
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

// Mesma chamada que a tela "Solicitações Caixa Operacional" faz por padrão (filtro Status =
// Pendente, sem recorte de data — confirmado ao vivo capturando o POST real da página em
// 2026-07-10). Traz só o que ainda está pendente de decisão, que é o universo relevante pro
// fluxo de pagamento.
async function fetchPendingRequests(page) {
  log('INFO', `Navegando para ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });

  log('INFO', 'Chamando API diretamente via fetch autenticado...');
  const json = await page.evaluate(async () => {
    let token = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed && parsed.userToken) { token = parsed.userToken; break; }
      } catch (e) {}
    }
    const res = await fetch('/api/oFlow/request/getRecords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ofrStatus: 'P', ofrDateFrom: '', ofrDateTo: '' })
    });
    return res.json();
  });

  if (!json || json.result !== true) {
    throw new Error(`Resposta inesperada da API de solicitações: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const data = json.searchData || [];
  log('SUCCESS', `${data.length} solicitação(ões) pendente(s) recebida(s)`);
  return data;
}

function buildRecords(rows) {
  return rows.map((row) => ({
    ofr_code: row.ofrCode,
    ofr_status: row.ofrStatus || null,
    data_solicitacao: row.ofrDate || null,
    data_registro: row.ofrRegisterDate || null,
    colaborador: row.staName || null,
    cpf: row.staCPF || null,
    coordenacao: row.olcName || null,
    supervisao: row.olsName || null,
    conta: row.baccName || null,
    valor: row.ofrValue ?? null,
    // ofsBallance vem invertido em relação à leitura financeira que o painel usa (saldo
    // positivo = colaborador com crédito; negativo = colaborador devendo) — GRM guarda o
    // sinal oposto, por isso invertemos aqui na sincronização.
    saldo: row.ofsBallance != null ? -row.ofsBallance : null,
    embarque: row.lastLoad || null,
    leitura_mais_antiga: row.lastNoShip || null,
    descricao: row.ofrDescription || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(),
  }));
}

async function upsertData(records) {
  log('INFO', `Iniciando upsert de ${records.length} registros...`);
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'ofr_code' });
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

    const rows = await fetchPendingRequests(page);
    const records = buildRecords(rows);
    await upsertData(records);

    log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.message); process.exit(1); });
setTimeout(() => process.exit(0), 120000);
