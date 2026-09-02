/**
 * Agente: Classificação Ouro Safra (cdci) <-> GRM
 *
 * Ao contrário dos agentes só-leitura (grm-sync-nhe.js etc.), este NÃO
 * hardcoda TMPDIR/TEMP/TMP pro caminho do servidor — segue o mesmo padrão de
 * grm-sync-aplicar-distribuicao-os.js (o outro agente com --dry-run/HEADLESS
 * pensado pra rodar supervisionado localmente também). No cron, o crontab já
 * exporta TMPDIR=/home/grao100/tmp antes de chamar o node (ver README).
 *
 * Fluxo (validado manualmente ao vivo em 27/08/2026, placa BDP-1G46 / O.S. 90493):
 *   1. Login no painel Ouro Safra (app.ourosafra.com.br) e no GRM (grmserver.com.br).
 *   2. No Ouro Safra, lista as placas em "Carregando" E em "Aguardando
 *      Classificação" — as duas são tratadas igual: a janela "Classificação -
 *      Agendamento #ID" é a MESMA página rolável nos dois casos, com a
 *      tabela de itens (Impureza/Umidade/Avariados) sempre presente mais
 *      abaixo, não é um modal pequeno. NÃO existe passo separado de "abrir e
 *      salvar vazio" pra promover Carregando → Aguardando Classificação — só
 *      dá pra mexer numa placa (Carregando ou não) quando o laudo já existe
 *      no GRM pra preencher os itens (confirmado com a usuária, 28/08/2026;
 *      uma tentativa anterior de "confirmar vazio" clicava Salvar sem
 *      preencher nada e não mudava status nenhum — descartada).
 *   3. Para cada placa (das duas listas), procura a correspondência no GRM em
 *      report/classification/loads, filtrando Cliente Nacional =
 *      OURO SAFRA INDUSTRIA E COMERCIO LTDA + Placa. Sem correspondência: pula
 *      (tenta de novo na próxima execução).
 *   4. Com a correspondência, preenche os 3 itens de classificação da Ouro
 *      Safra (Impureza = Matérias E. e Imp., Umidade = Umidade, Avariados =
 *      Avariado Total) com os valores do GRM.
 *   5. No GRM, abre a O.S. correspondente, localiza a carga da placa na lista
 *      "Cargas" e baixa o laudo (PDF).
 *   6. Volta no Ouro Safra e anexa o laudo (Upload Laudo) + salva.
 *
 * ATENÇÃO — nível de confiança dos seletores usados (atualizado 28/08/2026):
 *   - Login GRM, formatação BR de percentual (vírgula): reaproveitados de
 *     scripts já em produção neste repo (alta confiança).
 *   - buscarClassificacaoGRM() (Cliente Nacional #clnCode, Placa
 *     #loaLicensePlate, período #loaDateFrom/#loaDateTo dentro de .dr-field,
 *     checkboxes #joinCItems/#addStaffInfo, botão .loadsReport-act-update,
 *     leitura da tabela por cabeçalho): reescrita e RE-TESTADA com Puppeteer
 *     de verdade (não só manualmente no Chrome) em 28/08/2026 contra a placa
 *     BDP-1G46/O.S. 90493 — bateu exato (Umidade 13,90 / Matérias E. Imp.
 *     0,80 / Avariado Total 1,00). Alta confiança agora. IMPORTANTE: o
 *     v-autocomplete do Cliente Nacional só abre com um clique REAL via
 *     Puppeteer (page.click) — um clique disparado dentro de page.evaluate
 *     (DOM sintético) não funciona, e essa era a causa do 1º dry-run travar.
 *   - Fluxo Ouro Safra (cards do painel, modal de classificação, itens,
 *     upload de laudo) e a busca do laudo dentro da O.S. no GRM
 *     (operation/serviceOrder → Cargas → Imprimir Laudo): testados
 *     manualmente passo a passo no navegador (27/08/2026), mas os seletores
 *     no script foram reimplementados de forma estrutural (por texto/posição,
 *     não por classes fixas) porque a Ouro Safra usa Radzen/Blazor Server com
 *     IDs gerados dinamicamente por sessão — e isso AINDA NÃO foi re-testado
 *     com Puppeteer de verdade (só o card-click de listarAgendamentosPendentes
 *     foi corrigido e confirmado: os cards são <div class="rz-card">, não
 *     <button>, e somem do DOM quando a contagem é 0). RODAR SUPERVISIONADO
 *     (HEADLESS=false) na próxima vez que houver placa em "Aguardando
 *     Classificação" antes de colocar no cron.
 *   - Achado crítico: o campo de percentual da Ouro Safra só aceita vírgula
 *     como separador decimal — "0.80" é interpretado como 80,00 (100x maior).
 *     Por isso todo valor é formatado com fmtPercent() antes de digitar.
 *
 * ATUALIZAÇÃO 01/09/2026 — busca no GRM migrada de Puppeteer/UI para API
 * HTTP direta: confirmado ao vivo (via probe temporário) que o Ouro Safra
 * (app.ourosafra.com.br) é Blazor Server puro — todo o tráfego pós-login
 * passa por 1 WebSocket SignalR binário, sem nenhum endpoint JSON por trás
 * (não dá pra migrar esse lado). Já o GRM tem API JSON real por trás da
 * tela (mesmo endpoint POST /api/reports/classification/loads que
 * grm-sync-cargas-geofence.js já usa em produção, e o mesmo login HTTP puro
 * (POST /api/user/login) que grmserver-lista-os-api-realtime.js já usa) —
 * buscarClassificacaoGRM() foi reescrita pra chamar essa API direto (sem
 * abrir página nenhuma), eliminando o Puppeteer do lado GRM na etapa de
 * busca/casamento (o autocomplete #clnCode + tabela renderizada). Validado
 * ao vivo: mesmo período de 10 dias, resposta traz cItems com um código
 * semântico estável por item (pctCodeATT: 'umidade'/'impureza'/'avariado')
 * que independe do rótulo específico por cliente (ex.: "Matérias E. e Imp."
 * vs "Materias E. e imp." têm o mesmo pctCodeATT). O download do laudo
 * (baixarLaudoDaOS) e todo o fluxo Ouro Safra continuam via Puppeteer —
 * sem alternativa de API pra essas partes.
 */

require('dotenv').config();
const https = require('https');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } }
);

const EXEC_TABLE = 'ouro_safra_classificacao_execucoes';
const DIAS_BUSCA_GRM = Math.max(1, Number(process.env.OUROSAFRA_GRM_DIAS_BUSCA) || 3);

// A busca da classificação usa só "OURO SAFRA" (não a razão social completa
// "OURO SAFRA INDUSTRIA E COMERCIO LTDA" do Cliente Nacional, que era o que
// a UI buscava no autocomplete #clnCode) porque o campo `cliName` retornado
// pela API é o Cliente Final por unidade (ex.: "OURO SAFRA - PILAR DO SUL"),
// não a razão social — confirmado ao vivo 01/09/2026.
const CLIENTE_FILTRO_GRM = 'OURO SAFRA';
const GRM_API_BASE = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

// Segue o mesmo padrão de segurança do único outro agente de escrita do
// repo (grm-sync-aplicar-distribuicao-os.js): --dry-run/DRY_RUN=true prepara
// tudo (acha a O.S., calcula os valores, baixa o laudo) mas não clica em
// salvar nem anexa; HEADLESS=false roda com o Chrome visível pra supervisão.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const HEADLESS = process.env.HEADLESS === 'false' ? false : true;

// Default do Puppeteer é 180000ms (3min) — a Ouro Safra/GRM já estourou isso
// várias vezes na LISTAGEM de "Carregando"/"Aguardando Classificação" por
// pura lentidão externa (SignalR/Blazor Server), o que faz o ciclo inteiro
// ser tratado como "0 placas" mesmo com backlog real esperando (ver
// listarAgendamentosPorCard). Dobrado pra reduzir a frequência desses
// falsos "0 placas" — o erro do Puppeteer já sugere esse ajuste
// ("Increase the 'protocolTimeout' setting").
const PROTOCOL_TIMEOUT_MS = Number(process.env.OUROSAFRA_PROTOCOL_TIMEOUT_MS) || 360000;

const LAUNCH_ARGS = HEADLESS
  ? [
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
      '--disable-site-isolation-trials',
    ]
  : ['--no-sandbox', '--window-size=1600,1000'];

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBrDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// O servidor roda em UTC. Das 21h às 23h59 em Brasília (=0h-2h59 UTC do dia
// seguinte), `new Date()` cru já mostra o dia seguinte enquanto no GRM ainda
// é "hoje" em horário local — abre risco de gap na janela de busca
// (loaDateFrom/loaDateTo) bem na virada do dia. Usa o calendário de
// America/Sao_Paulo explicitamente em vez do TZ ambiente do processo.
function hojeBrasilia() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return new Date(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
}

// Ouro Safra só aceita vírgula como separador decimal (ver nota no topo do arquivo).
function fmtPercent(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

function parseBrNumber(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/\./g, '').replace(',', '.').replace('%', '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// A Ouro Safra normaliza a placa sem hífen (ex.: "EOE5D72"), enquanto o GRM
// usa o formato com hífen na posição do padrão Mercosul/antigo (ex.:
// "EOE-5D72", confirmado ao vivo com BDP-1G46 — ver nota no topo do
// arquivo). Reformata pro padrão com hífen assim que a placa é lida da
// Ouro Safra, pra manter o mesmo valor daqui em diante (busca no GRM e
// casamento de linha na lista de Cargas).
function normalizePlaca(value) {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 7 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value));
  await page.evaluate((payload) => {
    const input = document.querySelector(payload.selector);
    if (!input) return;
    input.value = payload.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector, value: String(value) });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function loginGRM(page) {
  log('INFO', 'Login GRM...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 30000 });
  await clearAndType(page, 'input#input-v-2', process.env.GRMSERVER_USER);
  await clearAndType(page, 'input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await page.click('button.submit-btn');
  for (let i = 0; i < 45; i += 1) {
    await wait(1000);
    if (!page.url().includes('/login')) {
      log('SUCCESS', 'Login GRM OK');
      return;
    }
  }
  throw new Error('Login GRM falhou: página não saiu de /login após 45s.');
}

async function loginOuroSafra(page) {
  log('INFO', 'Login Ouro Safra...');
  await page.goto('https://app.ourosafra.com.br/app/cdci', { waitUntil: 'networkidle2', timeout: 60000 });
  if (page.url().includes('/auth/Account/Login')) {
    await page.waitForSelector('#UserName', { timeout: 30000 });
    await clearAndType(page, '#UserName', process.env.OUROSAFRA_USER);
    await clearAndType(page, '#Password', process.env.OUROSAFRA_PASSWORD);
    await Promise.all([
      page.click('form button[value="login"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    ]);
  }
  if (!page.url().includes('ourosafra.com.br/app')) {
    throw new Error(`Login Ouro Safra falhou, URL final: ${page.url()}`);
  }
  log('SUCCESS', 'Login Ouro Safra OK');
}

// ---------------------------------------------------------------------------
// Helpers genéricos de DOM (Ouro Safra é Radzen/Blazor com IDs dinâmicos por
// sessão — por isso tudo aqui navega por texto/posição estrutural).
// ---------------------------------------------------------------------------

async function clickButtonByText(page, text, { exact = false, timeout = 15000 } = {}) {
  // Os botões do Radzen colocam a ligature do ícone (Material Symbols, ex.:
  // "save") ANTES do label visível — textContent nunca é só "Salvar", é
  // "save\n...\nSalvar" (confirmado ao vivo 28/08, causava timeout em todo
  // clickButtonByText(..., {exact:true})). Por isso "exact" compara o fim do
  // texto normalizado (label precedido de espaço), não igualdade estrita.
  await page.waitForFunction(
    (text, exact) => Array.from(document.querySelectorAll('button')).some((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      return exact ? (t === text || t.endsWith(` ${text}`)) : t.includes(text);
    }),
    { timeout },
    text,
    exact
  );
  const handle = await page.evaluateHandle((text, exact) => Array.from(document.querySelectorAll('button')).find((b) => {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    return exact ? (t === text || t.endsWith(` ${text}`)) : t.includes(text);
  }), text, exact);
  const el = handle.asElement();
  if (!el) throw new Error(`Botão "${text}" não encontrado`);
  await el.click();
  return el;
}

async function getRowHandleByLabel(page, label) {
  const handle = await page.evaluateHandle((label) => Array.from(document.querySelectorAll('table tr')).find(
    (r) => (r.textContent || '').toUpperCase().includes(label.toUpperCase())
  ), label);
  const el = handle.asElement();
  if (!el) throw new Error(`Linha "${label}" não encontrada na tabela`);
  return el;
}

async function clickNthButtonInRow(row, index) {
  const buttons = await row.$$('button');
  if (!buttons[index]) throw new Error(`Botão índice ${index} não encontrado na linha (${buttons.length} botões)`);
  await buttons[index].click();
}

// ---------------------------------------------------------------------------
// Ouro Safra — lista de agendamentos pendentes de classificação
// ---------------------------------------------------------------------------

// A grid pagina em ~10 registros por padrão — com o backlog de Carregando
// passando de 40+, ficar só na 1ª página deixa placas presas sem nunca
// serem alcançadas (confirmado ao vivo 28/08: placa real na página 4/5).
// Em vez de percorrer página por página, sobe o "items per page" pro
// máximo disponível (70) — cobre o backlog observado até agora numa
// tacada só. O dropdown (Radzen, não é <select> nativo) e o paginador
// ficam dentro do mesmo container .rz-data-grid da tabela de dados —
// busca aí em vez de document inteiro pra não pegar o dropdown menor do
// filtro de Empresa.
const ITENS_POR_PAGINA = 70;

async function definirItensPorPagina(page, valor) {
  const dropdownHandle = await page.evaluateHandle(() => {
    const table = Array.from(document.querySelectorAll('table')).find((t) => Array.from(t.tHead?.rows[0]?.cells || []).some((th) => th.textContent.trim().toLowerCase().includes('placa')));
    const container = table?.closest('.rz-data-grid');
    return container?.querySelector('.rz-paginator .rz-dropdown') || null;
  });
  const dropdownEl = dropdownHandle.asElement();
  if (!dropdownEl) return false;

  const jaEsta = await page.evaluate((el, valor) => el.querySelector('.rz-dropdown-label')?.textContent.trim() === String(valor), dropdownEl, valor);
  if (jaEsta) return true;

  // A página tem VÁRIOS .rz-dropdown-panel ao mesmo tempo (o combo de mês
  // dos campos de data também usa essa classe) — document.querySelector
  // pegava o painel errado e nunca achava a opção "70" (confirmado ao vivo
  // 28/08). O painel de cada dropdown Radzen tem id="popup-<id-do-dropdown>",
  // usa isso pra achar o painel certo.
  const dropdownId = await page.evaluate((el) => el.id, dropdownEl);
  await dropdownEl.click();
  await wait(300);
  const opcaoHandle = await page.evaluateHandle((valor, dropdownId) => {
    const panel = document.getElementById(`popup-${dropdownId}`);
    return Array.from(panel?.querySelectorAll('li[role="option"]') || []).find((li) => li.textContent.trim() === String(valor)) || null;
  }, valor, dropdownId);
  const opcaoEl = opcaoHandle.asElement();
  if (!opcaoEl) return false;
  await opcaoEl.click();
  await wait(500);
  return true;
}

// A Ouro Safra (ou o GRM, via as chamadas encadeadas) fica lenta com
// frequência o bastante (confirmado ao vivo várias vezes 28/08) pra
// estourar o timeout de protocolo do Puppeteer (~3min, "Runtime.
// callFunctionOn timed out"). Quando isso acontece durante a LISTAGEM
// (fora do try/catch por placa de processarPlaca), derrubava o job
// inteiro com "Script saiu com código 1" mesmo sem nenhuma ação real ter
// sido tentada. Encapsula pra tratar como "0 placas nesse ciclo" e deixar
// o próximo ciclo do cron tentar de novo, em vez de crashar.
async function listarAgendamentosPorCard(page, label) {
  try {
    return await listarAgendamentosPorCardInterno(page, label);
  } catch (err) {
    log('ERROR', `Falha ao listar "${label}" (provável lentidão externa) — tratando como 0 placas nesse ciclo: ${String(err.message || err).slice(0, 300)}`);
    return [];
  }
}

async function listarAgendamentosPorCardInterno(page, label) {
  await page.goto('https://app.ourosafra.com.br/app/cdci', { waitUntil: 'networkidle2', timeout: 60000 });
  // Um wait fixo de 2s às vezes não é suficiente pro painel de KPIs (cards)
  // terminar de renderizar via SignalR (Blazor Server) — o script concluía
  // "0 placas" por engano mesmo com itens reais na tela, pulando o card
  // inteiro naquele ciclo (confirmado ao vivo 28/08). Espera ativamente
  // pelo menos 1 .rz-card aparecer antes de decidir se o card do status
  // existe ou não.
  await page.waitForFunction(() => document.querySelectorAll('.rz-card').length > 0, { timeout: 15000 }).catch(() => {});
  await wait(500);
  // Os cards do painel (Carregando / Aguardando Classificação / Aguardando
  // Laudo Classificação) são <div class="rz-card">, não <button> — e o card
  // some do DOM quando a contagem daquele status é 0 (confirmado ao vivo).
  const cardClicado = await page.evaluate((label) => {
    const card = Array.from(document.querySelectorAll('.rz-card')).find((el) => (el.textContent || '').includes(label));
    if (!card) return false;
    card.click();
    return true;
  }, label);
  if (!cardClicado) {
    log('INFO', `Card "${label}" não existe agora (0 placas).`);
    return [];
  }
  await wait(1500);
  await definirItensPorPagina(page, ITENS_POR_PAGINA);
  await wait(500);

  const agendamentos = await page.evaluate(() => {
    // A página tem vários <table> ao mesmo tempo (calendário dos campos de
    // data, grid interno do dropdown Empresa) — e a PRÓPRIA grid de dados
    // tem tabelas de calendário ANINHADAS dentro do popup de filtro de cada
    // coluna de data. querySelectorAll('thead th')/('tbody tr') descem
    // recursivamente por essas tabelas aninhadas e misturam tudo (confirmado
    // ao vivo 28/08 — cabeçalho vinha com 108 células em vez de 10). Por
    // isso usa table.tHead/table.tBodies (API nativa da tabela, só pega os
    // filhos diretos da PRÓPRIA tabela, não das aninhadas).
    const table = Array.from(document.querySelectorAll('table')).find((t) => Array.from(t.tHead?.rows[0]?.cells || []).some((th) => th.textContent.trim().toLowerCase().includes('placa')));
    if (!table) return [];
    const headerCells = Array.from(table.tHead.rows[0].cells).map((th) => th.textContent.trim().toLowerCase());
    const idxPlaca = headerCells.findIndex((h) => h.includes('placa'));
    const idxId = headerCells.findIndex((h) => h.startsWith('id'));
    return Array.from(table.tBodies[0]?.rows || [])
      .map((tr, rowIndex) => {
        const cells = Array.from(tr.cells);
        return {
          rowIndex,
          placa: idxPlaca >= 0 ? (cells[idxPlaca]?.textContent || '').trim() : null,
          id: idxId >= 0 ? (cells[idxId]?.textContent || '').trim() : null,
        };
      })
      .filter((r) => r.placa);
  });

  // A Ouro Safra mostra a placa sem hífen (ex.: "EOE5D72") — reformata pro
  // padrão com hífen (ver normalizePlaca) antes de usar em qualquer busca no GRM.
  return agendamentos.map((a) => ({ ...a, placa: normalizePlaca(a.placa) }));
}

function listarAgendamentosPendentes(page) {
  return listarAgendamentosPorCard(page, 'Aguardando Classificação');
}

function listarAgendamentosCarregando(page) {
  return listarAgendamentosPorCard(page, 'Carregando');
}

async function abrirAgendamento(page, rowIndex) {
  // Blazor Server só reage a eventos de clique "de verdade" (Puppeteer
  // ElementHandle.click(), via CDP) — um btn.click() sintético dentro de
  // page.evaluate() não dispara o handler @onclick e o modal nunca abre
  // (confirmado ao vivo 28/08: 100% dos rowIndex reais estouravam os 15s
  // esperando o modal, mesmo com o botão certo sendo encontrado). Mesmo
  // cuidado já documentado no topo do arquivo pro v-autocomplete do GRM.
  // rowIndex é relativo à página atual — listarAgendamentosPorCard já
  // deixou o grid com ITENS_POR_PAGINA itens por página logo antes de
  // chamar essa função, então não precisa navegar entre páginas aqui.
  const rowHandle = await page.evaluateHandle((rowIndex) => {
    // Mesmo cuidado de listarAgendamentosPorCard: usa tHead/tBodies (API
    // nativa) em vez de querySelectorAll, que desceria pelas tabelas de
    // calendário aninhadas nos popups de filtro de cada coluna.
    const table = Array.from(document.querySelectorAll('table')).find((t) => Array.from(t.tHead?.rows[0]?.cells || []).some((th) => th.textContent.trim().toLowerCase().includes('placa')));
    return table?.tBodies[0]?.rows[rowIndex] || null;
  }, rowIndex);
  const row = rowHandle.asElement();
  if (!row) throw new Error(`Linha ${rowIndex} não encontrada na tabela`);
  const btn = await row.$('td button, td a');
  if (!btn) throw new Error('Botão de ação não encontrado na linha');
  await btn.click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('*')).some((el) => (el.textContent || '').trim().startsWith('Classificação - Agendamento')),
    { timeout: 15000 }
  );
  await wait(500);
}

async function preencherItensClassificacao(page, valores) {
  // valores: { impureza, umidade, avariados } (números, ex.: 0.80)
  const itens = [
    ['IMPUREZA', valores.impureza],
    ['UMIDADE', valores.umidade],
    ['AVARIADOS', valores.avariados],
  ];
  for (const [label, valor] of itens) {
    const formatted = fmtPercent(valor);
    let row = await getRowHandleByLabel(page, label);
    await clickNthButtonInRow(row, 0); // lápis
    await wait(500);
    row = await getRowHandleByLabel(page, label);
    const input = await row.$('input');
    if (!input) throw new Error(`Campo de percentual não encontrado para ${label}`);
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await input.type(formatted, { delay: 30 });
    await wait(200);
    row = await getRowHandleByLabel(page, label);
    await clickNthButtonInRow(row, 0); // confirmar (check verde)
    await wait(800);
    log('INFO', `${label} = ${formatted}%`);
  }
}

async function anexarLaudo(page, pdfPath) {
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 15000 }),
    clickButtonByText(page, 'Upload Laudo'),
  ]);
  await fileChooser.accept([pdfPath]);
  await wait(2000);
  const temSalvar = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    return t === 'Salvar' || t.endsWith(' Salvar');
  }));
  if (temSalvar) {
    await clickButtonByText(page, 'Salvar', { exact: true });
    await wait(1500);
  }
  log('SUCCESS', 'Laudo anexado');
}

// ---------------------------------------------------------------------------
// GRM — encontrar a classificação da placa, via API (report/classification/loads)
// ---------------------------------------------------------------------------

// HTTP puro (sem Puppeteer) — mesmo endpoint e mesmo login que
// grm-sync-cargas-geofence.js / grmserver-lista-os-api-realtime.js já usam
// em produção. Ver nota datada 01/09/2026 no topo do arquivo.
function requestJsonGrm(url, method, body, headers) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          reject(new Error(`GRM API retornou conteúdo inválido (HTTP ${res.statusCode}).`));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GRM API respondeu HTTP ${res.statusCode}: ${data.message || 'erro'}`));
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('GRM API: timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function loginGrmApi() {
  log('INFO', 'Login GRM (API)...');
  const res = await requestJsonGrm(`${GRM_API_BASE}user/login`, 'POST', {
    userEmail: process.env.GRMSERVER_USER,
    userPass: process.env.GRMSERVER_PASSWORD,
    loginInfo: {
      ip: '', browser: 'grm-sync-classificacao-ourosafra', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!res.result || !res.token) throw new Error(`Login GRM (API) recusado: ${res.message || 'sem token'}`);
  log('SUCCESS', 'Login GRM (API) OK');
  return res.token;
}

// Busca UMA VEZ (não por placa) todas as cargas classificadas dos últimos
// DIAS_BUSCA_GRM dias, com joinCItems=S pra trazer os itens de classificação
// junto — mesmo formato de payload que grm-sync-cargas-geofence.js já
// valida em produção. Sem filtro de cliente/placa no request (a API não
// exige clnCode) — filtra client-side em buscarClassificacaoGRM, do mesmo
// jeito que o geofence já faz.
async function fetchClassificacoesGRM(token) {
  const hoje = hojeBrasilia();
  const inicio = new Date(hoje.getTime() - DIAS_BUSCA_GRM * 24 * 60 * 60 * 1000);
  const res = await requestJsonGrm(`${GRM_API_BASE}reports/classification/loads`, 'POST', {
    loaDateFrom: toBrDate(inicio),
    loaDateTo: toBrDate(hoje),
    loaType: 'EMB',
    includeTotal: 'N',
    addStaffInfo: 'S',
    addLocalInfo: 'S',
    addTestsInfo: 'N',
    addSchedulesInfo: 'N',
    joinCItems: 'S',
  }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!res.result) throw new Error(`GRM recusou a consulta de classificação: ${res.message || 'erro desconhecido'}`);
  const loads = [];
  for (const group of res.searchData || []) {
    for (const load of group.loads || []) loads.push(load);
  }
  return loads;
}

// cItems traz um código semântico estável por item (pctCodeATT), que não
// muda com o rótulo específico do cliente (confirmado ao vivo 01/09/2026:
// "Matérias E. e Imp." e "Materias E. e imp." têm ambos pctCodeATT=
// 'impureza'). O item de Avariados vem marcado com pciIsTotal='S' — é o
// único item "total" da lista, mesmo quando há vários itens de dano
// individuais (Queimados, Mofados etc.) que não entram no cálculo aqui.
function buscarClassificacaoGRM(loadsGRM, placa) {
  const alvo = normalizePlaca(placa);
  const load = loadsGRM.find((l) => {
    const cliente = (l.cliName || '').toUpperCase();
    if (!cliente.includes(CLIENTE_FILTRO_GRM)) return false;
    return normalizePlaca(l.loaLicensePlate) === alvo;
  });
  if (!load) return null;

  const itens = load.cItems || [];
  const porCodigo = (codigo) => itens.find((i) => i.pctCodeATT === codigo);
  const umidadeItem = porCodigo('umidade');
  const impurezaItem = porCodigo('impureza');
  const avariadoItem = itens.find((i) => i.pctCodeATT === 'avariado' && i.pciIsTotal === 'S') || porCodigo('avariado');

  return {
    os: load.sorCode,
    dataCadastro: load.loaDate,
    horaCadastro: (load.loaRegisterDate || '').split(' ')[1] || null,
    umidade: umidadeItem ? umidadeItem.lciValue : null,
    materiasImp: impurezaItem ? impurezaItem.lciValue : null,
    avariadoTotal: avariadoItem ? avariadoItem.lciValue : null,
  };
}

// ---------------------------------------------------------------------------
// GRM — baixar o laudo da carga dentro da O.S.
// ---------------------------------------------------------------------------

async function baixarLaudoDaOS(page, browser, numeroOS, placa) {
  await page.goto('https://www.grmserver.com.br/operation/serviceOrder', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2000);
  await preencherCampoTexto(page, 'O.S.', String(numeroOS)).catch(() => {});
  // campo de busca livre da toolbar como alternativa
  await page.evaluate((numeroOS) => {
    const input = document.querySelector('input[placeholder="Filtrar Pesquisa"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(numeroOS));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, numeroOS);
  await page.keyboard.press('Enter');
  await wait(1500);

  // marca a checkbox da linha da O.S. e abre o modal "Cargas"
  await page.evaluate(() => {
    const row = document.querySelector('table tbody tr');
    const checkbox = row?.querySelector('input[type=checkbox]');
    checkbox?.click();
  });
  await wait(500);
  // 4º ícone da toolbar principal = "Cargas" (confirmado manualmente)
  await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar, [class*="toolbar"]') || document;
    const buttons = Array.from(toolbar.querySelectorAll('button'));
    buttons[3]?.click();
  });
  await wait(1500);

  // expande o grupo de data cujo cadastro bate com a data de hoje/ontem e marca a placa
  await page.evaluate((placa) => {
    const groups = Array.from(document.querySelectorAll('[class*="date"], tr, div')).filter((el) => /\d{2}\/\d{2}\/\d{4}/.test(el.textContent || '') && (el.textContent || '').length < 60);
    groups.forEach((g) => g.click());
  }, placa);
  await wait(1000);
  const placaMarcada = await page.evaluate((placa) => {
    // Compara ignorando hífen dos dois lados — a Ouro Safra normaliza sem
    // hífen e não dá pra garantir que a lista de Cargas do GRM sempre mostre
    // a placa formatada do mesmo jeito que o restante do GRM.
    const alvo = placa.toUpperCase().replace(/-/g, '');
    const row = Array.from(document.querySelectorAll('table tr')).find((r) => (r.textContent || '').toUpperCase().replace(/-/g, '').includes(alvo));
    const checkbox = row?.querySelector('input[type=checkbox]');
    if (!checkbox) return false;
    checkbox.click();
    return true;
  }, placa);
  if (!placaMarcada) {
    throw new Error(`Placa ${placa} não encontrada na lista de Cargas da O.S. ${numeroOS} — laudo não baixado.`);
  }
  await wait(500);

  const newTargetPromise = browser.waitForTarget((t) => t.url().startsWith('blob:'), { timeout: 20000 });
  // 2º ícone da barra do modal de cargas = "Imprimir Laudo" (confirmado manualmente)
  await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll('*')).find((el) => (el.textContent || '').includes('Lista de Cargas'))?.closest('div');
    const toolbar = modal?.querySelector('[class*="toolbar"]') || modal;
    const buttons = Array.from((toolbar || document).querySelectorAll('button'));
    buttons[1]?.click();
  });
  const target = await newTargetPromise;
  const laudoPage = await target.page();
  await wait(1000);
  const base64 = await laudoPage.evaluate(async (url) => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, laudoPage.url());
  await laudoPage.close();
  return Buffer.from(base64, 'base64');
}

// ---------------------------------------------------------------------------
// Execução / auditoria
// ---------------------------------------------------------------------------

async function registrarExecucao(registro) {
  try {
    const { error } = await supabase.from(EXEC_TABLE).insert(registro);
    if (error) log('ERROR', `Falha ao gravar auditoria: ${error.message}`);
  } catch (err) {
    log('ERROR', `Falha ao gravar auditoria: ${err.message}`);
  }
}

async function processarPlaca(pageOuroSafra, pageGRM, browserGRM, agendamento, classificacoesGRM) {
  const inicio = Date.now();
  const registro = {
    agendamento_id: agendamento.id,
    placa: agendamento.placa,
    iniciado_em: new Date().toISOString(),
  };
  try {
    const grm = buscarClassificacaoGRM(classificacoesGRM, agendamento.placa);
    if (!grm || !grm.os) {
      log('INFO', `${agendamento.placa}: sem correspondência no GRM ainda, pulando.`);
      registro.status = 'sem-correspondencia';
      return;
    }

    const valores = {
      impureza: parseBrNumber(grm.materiasImp),
      umidade: parseBrNumber(grm.umidade),
      avariados: parseBrNumber(grm.avariadoTotal),
    };
    if (valores.impureza == null || valores.umidade == null || valores.avariados == null) {
      throw new Error(`Valores de classificação incompletos do GRM: ${JSON.stringify(grm)}`);
    }

    registro.os_grm = grm.os;
    registro.umidade = valores.umidade;
    registro.impureza = valores.impureza;
    registro.avariados = valores.avariados;

    if (DRY_RUN) {
      registro.status = 'dry-run';
      log('INFO', `[DRY-RUN] ${agendamento.placa} bateria com O.S. ${grm.os} (Impureza ${fmtPercent(valores.impureza)}%, Umidade ${fmtPercent(valores.umidade)}%, Avariados ${fmtPercent(valores.avariados)}%) — nada foi salvo/anexado.`);
      return;
    }

    await abrirAgendamento(pageOuroSafra, agendamento.rowIndex);
    await preencherItensClassificacao(pageOuroSafra, valores);

    const pdfBuffer = await baixarLaudoDaOS(pageGRM, browserGRM, grm.os, agendamento.placa);
    const tmpPath = path.join(os.tmpdir(), `laudo-${agendamento.placa}-${grm.os}.pdf`);
    fs.writeFileSync(tmpPath, pdfBuffer);

    await anexarLaudo(pageOuroSafra, tmpPath);
    fs.rmSync(tmpPath, { force: true });

    registro.status = 'sucesso';
    log('SUCCESS', `${agendamento.placa} (agendamento ${agendamento.id}) classificado com O.S. ${grm.os}`);
  } catch (err) {
    registro.status = 'erro';
    registro.erro = String(err.message || err).slice(0, 1000);
    log('ERROR', `${agendamento.placa}: ${registro.erro}`);
  } finally {
    registro.duracao_ms = Date.now() - inicio;
    await registrarExecucao(registro);
  }
}

async function main() {
  let browser;
  try {
    log('INFO', `=== Classificação Ouro Safra <-> GRM${DRY_RUN ? ' (DRY-RUN)' : ''} ===`);
    browser = await puppeteer.launch({
      headless: HEADLESS,
      dumpio: true,
      args: LAUNCH_ARGS,
      defaultViewport: HEADLESS ? { width: 1440, height: 900 } : null,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
    });

    const pageOuroSafra = await browser.newPage();
    if (HEADLESS) await pageOuroSafra.setViewport({ width: 1440, height: 900 });
    await loginOuroSafra(pageOuroSafra);

    const pageGRM = await browser.newPage();
    if (HEADLESS) await pageGRM.setViewport({ width: 1440, height: 900 });
    await loginGRM(pageGRM);

    // Busca via API (HTTP puro, sem Puppeteer) — 1 chamada só pra todo o
    // lote, em vez de 1 navegação de página por placa (ver nota 01/09/2026
    // no topo do arquivo).
    const tokenGrmApi = await loginGrmApi();
    const classificacoesGRM = await fetchClassificacoesGRM(tokenGrmApi);
    log('INFO', `${classificacoesGRM.length} carga(s) classificada(s) no GRM nos últimos ${DIAS_BUSCA_GRM} dia(s).`);

    // "Carregando" e "Aguardando Classificação" são processados igual: a
    // janela do agendamento tem a MESMA tabela de itens (Impureza/Umidade/
    // Avariados) nos dois casos, só que mais abaixo na página (confirmado ao
    // vivo 28/08 — não é um passo separado de "confirmar vazio", a
    // classificação só é preenchida quando o laudo já existe no GRM).
    const carregando = await listarAgendamentosCarregando(pageOuroSafra);
    const pendentes = await listarAgendamentosPendentes(pageOuroSafra);
    log('INFO', `${carregando.length} placa(s) em "Carregando", ${pendentes.length} em "Aguardando Classificação"`);

    const fila = [
      ...carregando.map((a) => ({ ...a, card: 'Carregando' })),
      ...pendentes.map((a) => ({ ...a, card: 'Aguardando Classificação' })),
    ];

    for (const agendamento of fila) {
      // relista a cada iteração: abrir/fechar o modal e navegar re-renderiza a tabela
      // e invalida rowIndex/handles anteriores.
      const listaAtual = await listarAgendamentosPorCard(pageOuroSafra, agendamento.card);
      const atual = listaAtual.find((a) => a.id === agendamento.id);
      if (!atual) continue;
      await processarPlaca(pageOuroSafra, pageGRM, browser, atual, classificacoesGRM);
    }

    log('SUCCESS', 'Concluído');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => process.exit(1), 600000);
