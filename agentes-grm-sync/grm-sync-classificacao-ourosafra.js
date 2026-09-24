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
// 24/09/2026: as placas analisadas são SEMPRE do dia de hoje (regra do usuário) —
// a consulta ao GRM cobre só hoje (0 dias pra trás) e a escolha da carga exige
// a data exata.
const DIAS_BUSCA_GRM = Math.max(0, Number(process.env.OUROSAFRA_GRM_DIAS_BUSCA) || 0);

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
// listarAgendamentosPorCard). Primeiro dobrado pra 6min (360000) em
// 02/09/2026; validado ao vivo que ainda não bastou (um ciclo real estourou
// mesmo os 6min) — subido pra 8min. Ver KILL_SWITCH_MS abaixo, aumentado
// junto pra não matar o processo no meio de um timeout de listagem legítimo.
const PROTOCOL_TIMEOUT_MS = Number(process.env.OUROSAFRA_PROTOCOL_TIMEOUT_MS) || 480000;

// Kill-switch hardcoded no fim do arquivo: já matou pelo menos 1 run real no
// meio do processamento de um backlog grande (job "erro", 19:36 28/08/2026 —
// ver histórico). Também precisa de folga sobre PROTOCOL_TIMEOUT_MS: no pior
// caso as 2 listagens iniciais (Carregando + Aguardando Classificação) podem
// estourar o timeout de protocolo em sequência (2x 8min = 16min) antes mesmo
// do loop de processamento por placa começar — um kill-switch igual ou menor
// que isso mataria o processo ANTES do catch interno conseguir degradar pra
// "0 placas" graciosamente. 20min dá folga sobre esse pior caso + login (~20s).
const KILL_SWITCH_MS = Number(process.env.OUROSAFRA_KILL_SWITCH_MS) || 1200000;

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

// "YYYY-MM-DD" de hoje no calendário de Brasília.
function hojeISOBrasilia() {
  const h = hojeBrasilia();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

// Ouro Safra só aceita vírgula como separador decimal (ver nota no topo do arquivo).
function fmtPercent(value) {
  return Number(value).toFixed(2).replace('.', ',');
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

// BUG ENCONTRADO 23/09/2026: a versão anterior casava a linha pelo
// textContent INTEIRO — em modo de edição a linha IMPUREZA contém o dropdown
// de Descrição com TODAS as opções ("IMPUREZA MOFADOS ... UMIDADE ..."),
// então buscar "UMIDADE"/"AVARIADOS" devolvia de novo a linha IMPUREZA
// (ainda em edição) e os valores eram redigitados por cima dela. Agora casa
// só pela célula de Descrição (2ª coluna): o rótulo selecionado do dropdown
// quando a linha está em edição, ou o texto simples quando não está.
async function getRowHandleByLabel(page, label) {
  const handle = await page.evaluateHandle((label) => {
    const alvo = label.toUpperCase();
    return Array.from(document.querySelectorAll('table tr')).find((r) => {
      const tds = Array.from(r.children).filter((c) => c.tagName === 'TD');
      if (tds.length < 3) return false;
      const cel = tds[1];
      // Em modo normal o texto da célula é só o rótulo; em edição é o rótulo
      // selecionado seguido das opções do dropdown ("IMPUREZA MOFADOS ...") —
      // por isso aceita igual OU começando pelo rótulo + espaço. (Não usar
      // childNodes[0]: é um comentário HTML `<!--!-->` do Blazor.)
      const sel = cel.querySelector('.rz-dropdown-label');
      const txt = ((sel ? sel.textContent : cel.textContent) || '').replace(/\s+/g, ' ').trim().toUpperCase();
      return txt === alvo || txt.startsWith(`${alvo} `);
    }) || null;
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`Linha "${label}" não encontrada na tabela`);
  return el;
}

// Clica o botão da linha cujo texto (ligature do ícone Material, ex. "edit",
// "check") contém uma das ligatures; cai no índice de fallback se nenhum casar.
async function clickButtonInRowByIcon(row, ligatures, fallbackIndex) {
  const buttons = await row.$$('button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase());
    if (ligatures.some((l) => t.includes(l))) { await b.click(); return; }
  }
  if (!buttons[fallbackIndex]) throw new Error(`Botão ${ligatures.join('/')} não encontrado na linha (${buttons.length} botões)`);
  await buttons[fallbackIndex].click();
}

async function linhaEmEdicao(page, label) {
  try {
    const row = await getRowHandleByLabel(page, label);
    return await row.evaluate((r) => !!r.querySelector('input:not([readonly])'));
  } catch (e) {
    return false;
  }
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
  const t0 = Date.now();
  log('DEBUG', `[timing:definirItensPorPagina] inicio em 0ms`);
  const dropdownHandle = await page.evaluateHandle(() => {
    const table = Array.from(document.querySelectorAll('table')).find((t) => Array.from(t.tHead?.rows[0]?.cells || []).some((th) => th.textContent.trim().toLowerCase().includes('placa')));
    const container = table?.closest('.rz-data-grid');
    return container?.querySelector('.rz-paginator .rz-dropdown') || null;
  });
  log('DEBUG', `[timing:definirItensPorPagina] achou dropdown em ${Date.now() - t0}ms`);
  const dropdownEl = dropdownHandle.asElement();
  if (!dropdownEl) return false;

  const jaEsta = await page.evaluate((el, valor) => el.querySelector('.rz-dropdown-label')?.textContent.trim() === String(valor), dropdownEl, valor);
  log('DEBUG', `[timing:definirItensPorPagina] checou jaEsta=${jaEsta} em ${Date.now() - t0}ms`);
  if (jaEsta) return true;

  // A página tem VÁRIOS .rz-dropdown-panel ao mesmo tempo (o combo de mês
  // dos campos de data também usa essa classe) — document.querySelector
  // pegava o painel errado e nunca achava a opção "70" (confirmado ao vivo
  // 28/08). O painel de cada dropdown Radzen tem id="popup-<id-do-dropdown>",
  // usa isso pra achar o painel certo.
  const dropdownId = await page.evaluate((el) => el.id, dropdownEl);
  log('DEBUG', `[timing:definirItensPorPagina] dropdownId=${dropdownId} em ${Date.now() - t0}ms`);
  await dropdownEl.click();
  log('DEBUG', `[timing:definirItensPorPagina] click dropdown em ${Date.now() - t0}ms`);
  await wait(300);
  const opcaoHandle = await page.evaluateHandle((valor, dropdownId) => {
    const panel = document.getElementById(`popup-${dropdownId}`);
    return Array.from(panel?.querySelectorAll('li[role="option"]') || []).find((li) => li.textContent.trim() === String(valor)) || null;
  }, valor, dropdownId);
  log('DEBUG', `[timing:definirItensPorPagina] achou opcao em ${Date.now() - t0}ms`);
  const opcaoEl = opcaoHandle.asElement();
  if (!opcaoEl) return false;
  await opcaoEl.click();
  log('DEBUG', `[timing:definirItensPorPagina] click opcao em ${Date.now() - t0}ms`);
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
  // Instrumentação temporária (17/09/2026) pra achar o ponto exato em que a
  // listagem trava/estoura o protocolTimeout — 95% das execuções desde
  // 15/09 vêm falhando aqui com "Runtime.callFunctionOn timed out" e o
  // agente não processa uma placa real desde 28/08 (ver memória do
  // projeto). Cada checkpoint loga o tempo decorrido desde o início desta
  // chamada; remover assim que a causa for identificada e corrigida.
  const t0 = Date.now();
  const checkpoint = (etapa) => log('DEBUG', `[timing:${label}] ${etapa} em ${Date.now() - t0}ms`);

  checkpoint('inicio');
  await page.goto('https://app.ourosafra.com.br/app/cdci', { waitUntil: 'networkidle2', timeout: 60000 });
  checkpoint('goto concluido');
  // Um wait fixo de 2s às vezes não é suficiente pro painel de KPIs (cards)
  // terminar de renderizar via SignalR (Blazor Server) — o script concluía
  // "0 placas" por engano mesmo com itens reais na tela, pulando o card
  // inteiro naquele ciclo (confirmado ao vivo 28/08). Espera ativamente
  // pelo menos 1 .rz-card aparecer antes de decidir se o card do status
  // existe ou não.
  await page.waitForFunction(() => document.querySelectorAll('.rz-card').length > 0, { timeout: 15000 }).catch(() => {});
  checkpoint('waitForFunction rz-card concluido');
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
  checkpoint(`card clicado=${cardClicado}`);
  if (!cardClicado) {
    log('INFO', `Card "${label}" não existe agora (0 placas).`);
    return [];
  }
  await wait(1500);
  // Diagnóstico temporário (17/09/2026): screenshot logo antes do passo que
  // trava (definirItensPorPagina) — captura da tela funciona mesmo com a
  // thread de JS da página ocupada (é um comando do compositor, não
  // Runtime.callFunctionOn), então mostra o estado real sem depender do
  // próprio passo que está hipoteticamente travando.
  await page.screenshot({ path: `/home/grao100/painel-scripts/grm-sync/logs/debug-screenshot-${label.replace(/[^a-zA-Z0-9]/g, '')}.png`, fullPage: true }).catch((e) => log('DEBUG', `screenshot falhou: ${e.message}`));
  checkpoint('screenshot tirado');
  await definirItensPorPagina(page, ITENS_POR_PAGINA);
  checkpoint('definirItensPorPagina concluido');
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
    // Coluna de data do agendamento (ex.: "9/23/2026", formato M/D/YYYY do
    // Ouro Safra) — usada pra escolher a carga certa do GRM quando a mesma
    // placa aparece em mais de um dia.
    const idxData = headerCells.findIndex((h) => h === 'data' || h.startsWith('data '));
    return Array.from(table.tBodies[0]?.rows || [])
      .map((tr, rowIndex) => {
        const cells = Array.from(tr.cells);
        return {
          rowIndex,
          placa: idxPlaca >= 0 ? (cells[idxPlaca]?.textContent || '').trim() : null,
          id: idxId >= 0 ? (cells[idxId]?.textContent || '').trim() : null,
          dataTexto: idxData >= 0 ? (cells[idxData]?.textContent || '').trim() : null,
        };
      })
      .filter((r) => r.placa);
  });
  checkpoint(`leitura da tabela concluida (${agendamentos.length} linha(s))`);

  // A Ouro Safra mostra a placa sem hífen (ex.: "EOE5D72") — reformata pro
  // padrão com hífen (ver normalizePlaca) antes de usar em qualquer busca no GRM.
  return agendamentos.map((a) => ({ ...a, placa: normalizePlaca(a.placa), dataISO: parseDataAgendamento(a.dataTexto) }));
}

// "9/23/2026" (M/D/YYYY) ou "23/09/2026" (D/M/YYYY) -> "2026-09-23"; null se não der.
function parseDataAgendamento(texto) {
  const m = String(texto || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  // M/D/YYYY (Ouro Safra): se o 1º número > 12 só pode ser dia (D/M).
  let mes = a;
  let dia = b;
  if (a > 12) { dia = a; mes = b; }
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
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
  await wait(1500);
  // Descoberta ao vivo em 17/09/2026: o modal abre SEM a tabela "Itens da
  // Classificação" na primeira vez (só tem os campos de metadado) — precisa
  // clicar em "Salvar" uma vez (mesmo com tudo vazio/default) pra criar o
  // registro de classificação no Ouro Safra; a mesma tela então passa a
  // mostrar a tabela de itens (Impureza/Umidade/Avariados, todos a 0,00%)
  // sem precisar fechar/reabrir o modal. Só faz esse Salvar extra quando a
  // tabela ainda não existe (idempotente — se já existir, não clica de novo).
  const temTabelaDeItens = async () => page.evaluate(() => Array.from(document.querySelectorAll('body *')).some((e) => e.children.length === 0 && (e.textContent || '').toUpperCase().includes('IMPUREZA')));
  if (!(await temTabelaDeItens())) {
    await clickButtonByText(page, 'Salvar', { exact: true });
    await wait(2000);
    if (!(await temTabelaDeItens())) {
      throw new Error('Clicou em Salvar pra criar o registro de classificação, mas a tabela de itens continua sem aparecer.');
    }
    log('INFO', 'Registro de classificação criado (Salvar inicial) — tabela de itens liberada.');
  }
}

let disjuntorAcionado = false;
async function acionarDisjuntor(motivo) {
  disjuntorAcionado = true;
  log('ERROR', `[DISJUNTOR] valor errado gravado na Ouro Safra — ${motivo}. Abortando ciclo e pausando o agente.`);
  try {
    const { error } = await supabase.from('grm_sync_agent_settings').update({ enabled: false }).eq('agent_id', 'sync-classificacao-ourosafra');
    if (error) log('ERROR', `[DISJUNTOR] falha ao pausar o agente: ${error.message}`);
  } catch (e) {
    log('ERROR', `[DISJUNTOR] falha ao pausar o agente: ${e.message}`);
  }
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
    let passo = 'lápis';
    try {
      let row = await getRowHandleByLabel(page, label);
      await clickButtonInRowByIcon(row, ['edit', 'mode_edit', 'create'], 0); // lápis
      await wait(500);
      passo = 'input';
      row = await getRowHandleByLabel(page, label);
      // Achado ao vivo 18/09/2026: em modo de edição a coluna "Descrição"
      // também vira um componente (dropdown do Radzen) que tem seu PRÓPRIO
      // <input> oculto/readonly (helper de acessibilidade, aria-label
      // "Select customer") ANTES do campo de percentual de verdade no HTML
      // — row.$('input') pegava esse input errado (invisível, sem
      // boundingBox) e o .click() falhava com "Node is either not
      // clickable". Filtra por não-readonly pra achar o campo certo.
      const candidatos = await row.$$('input');
      let input = null;
      for (const candidato of candidatos) {
        const somenteLeitura = await page.evaluate((el) => el.readOnly, candidato);
        if (!somenteLeitura) { input = candidato; break; }
      }
      if (!input) throw new Error(`Campo de percentual não encontrado para ${label}`);
      await input.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      // BUG ENCONTRADO 23/09/2026: digitar tecla a tecla (`input.type` com
      // delay) fazia o valor gravado sair errado — "0,50" virava 50,00%,
      // "11,80" virava 100,00%, "0,80" virava 80,00% (a vírgula era
      // descartada: cada tecla dispara um round-trip Blazor que re-renderiza
      // o valor do input no meio da digitação). Insere o texto INTEIRO de
      // uma vez (Input.insertText, um único evento de input) e confere o que
      // ficou no campo ANTES de confirmar — nunca confirma valor diferente
      // do esperado.
      // TESTE 23/09/2026 (autorizado pelo usuário): digita com PONTO
      // ("0.50") — hipótese: o JS do campo Radzen usa o separador do locale
      // do navegador (en-US no headless), descarta a vírgula e o servidor
      // recebe "050" = 50. O texto exibido após confirmar continua sendo em
      // vírgula ("0,50%"), que é o que `formatted` verifica.
      const digitado = Number(valor).toFixed(2);
      await page.keyboard.sendCharacter(digitado);
      await wait(400);
      const valorNoInput = await page.evaluate((el) => el.value, input).catch(() => null);
      if (String(valorNoInput).replace(',', '.') !== digitado) {
        throw new Error(`Item ${label}: campo ficou "${valorNoInput}" em vez de "${digitado}" — não confirmado pra não gravar valor errado.`);
      }
      passo = 'confirmar';
      row = await getRowHandleByLabel(page, label);
      await clickButtonInRowByIcon(row, ['check', 'done', 'save'], 0); // confirmar (check verde)
      await wait(800);
      // Verifica que a linha REALMENTE saiu do modo edição (comitou); se não,
      // clica de novo uma vez antes de desistir com erro claro.
      if (await linhaEmEdicao(page, label)) {
        row = await getRowHandleByLabel(page, label);
        await clickButtonInRowByIcon(row, ['check', 'done', 'save'], 0);
        await wait(1200);
        if (await linhaEmEdicao(page, label)) {
          const htmlEdicao = await (await getRowHandleByLabel(page, label)).evaluate((r) => r.outerHTML.slice(0, 2500)).catch(() => null);
          log('DEBUG', `[diag:confirmar-item] ${label} continua em edição apos 2 cliques no check | html: ${htmlEdicao}`);
          throw new Error(`Item ${label}: confirmar não comitou a edição (linha continua em modo edição).`);
        }
      }
      // Diagnóstico 23/09/2026: screenshot do modal na hora do anexo mostrou
      // IMPUREZA ainda em edição com "100" e UMIDADE/AVARIADOS em 0,00%,
      // mesmo com o log dizendo que os 3 itens foram preenchidos — este log
      // não verificava o resultado do clique. Registra o que a UI mostra.
      const estadoLinha = await getRowHandleByLabel(page, label)
        .then((r) => r.evaluate((x) => ({ texto: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), emEdicao: !!x.querySelector('input:not([readonly])') })))
        .catch(() => null);
      log('INFO', `${label} = ${formatted}% (digitado no input="${valorNoInput}", linha apos confirmar=${JSON.stringify(estadoLinha)})`);
      if (!estadoLinha || !estadoLinha.texto.includes(`${formatted}%`)) {
        // DISJUNTOR: valor errado JÁ foi gravado no Ouro Safra — aborta o
        // ciclo inteiro e pausa o agente pra não repetir em outras placas.
        await acionarDisjuntor(`${label}: exibido "${estadoLinha ? estadoLinha.texto : 'linha não encontrada'}" ≠ esperado "${formatted}%" (digitado "${digitado}")`);
        throw new Error(`Item ${label}: valor exibido depois de confirmar (${estadoLinha ? estadoLinha.texto : 'linha não encontrada'}) não bate com o esperado (${formatted}%).`);
      }
    } catch (err) {
      // Diagnóstico temporário (18/09/2026): "Node is either not clickable
      // or not an HTMLElement" apareceu em 100% das placas reais desde que
      // o Salvar inicial passou a liberar a tabela de itens — precisa saber
      // em qual dos 3 cliques (lápis/input/confirmar) e pra qual item isso
      // acontece antes de decidir a correção certa.
      await page.screenshot({ path: `/home/grao100/painel-scripts/grm-sync/logs/debug-erro-item-${label}.png`, fullPage: true }).catch(() => {});
      const rowHtml = await page.evaluate((label) => {
        const row = Array.from(document.querySelectorAll('table tr')).find((r) => (r.textContent || '').toUpperCase().includes(label.toUpperCase()));
        return row ? row.outerHTML.slice(0, 1500) : null;
      }, label).catch(() => null);
      log('DEBUG', `[diag:preencherItensClassificacao] falhou no passo "${passo}" pro item ${label}: ${err.message} | linha: ${rowHtml}`);
      throw err;
    }
  }
}

async function anexarLaudo(page, pdfPath) {
  // 23/09/2026: o clique em "Upload Laudo" (habilitado) nunca abria o file
  // chooser em headless; o <input type=file> só passa a existir DEPOIS do
  // clique (confirmado: inputsArquivo=0 antes, 1 depois) — clica, espera o
  // input aparecer e anexa direto nele (uploadFile dispara o change que o
  // Blazor escuta).
  try {
    await clickButtonByText(page, 'Upload Laudo');
    const inputArquivo = await page.waitForSelector('input[type=file]', { timeout: 8000 }).catch(() => null);
    if (!inputArquivo) throw new Error('input[type=file] não apareceu depois de clicar em Upload Laudo');
    await inputArquivo.uploadFile(pdfPath);
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 }).catch(() => {});
    await wait(3000);
    const estadoUpload = await inputArquivo.evaluate((el) => {
      const raiz = el.closest('.rz-fileupload') || el.parentElement?.parentElement || el.parentElement;
      return { arquivos: el.files ? Array.from(el.files).map((f) => `${f.name}:${f.size}`) : null, html: raiz ? raiz.outerHTML.replace(/\s+/g, ' ').slice(0, 700) : null };
    }).catch((e) => ({ erroDiag: e.message }));
    log('DEBUG', `[diag:upload] ${JSON.stringify(estadoUpload)}`);
    await page.screenshot({ path: '/home/grao100/painel-scripts/grm-sync/logs/debug-pos-upload-laudo.png', fullPage: false }).catch(() => {});
  } catch (err) {
    const diag = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Upload Laudo'));
      return {
        visibilidade: document.visibilityState,
        botaoExiste: !!btn,
        botaoDesabilitado: btn ? (btn.disabled || btn.className.includes('rz-state-disabled')) : null,
        inputsArquivo: document.querySelectorAll('input[type=file]').length,
      };
    }).catch((e) => ({ erroDiag: e.message }));
    log('DEBUG', `[diag:anexarLaudo] ${JSON.stringify(diag)}`);
    await page.screenshot({ path: '/home/grao100/painel-scripts/grm-sync/logs/debug-erro-upload-laudo.png', fullPage: true }).catch(() => {});
    throw err;
  }
  await wait(1000);
  // Depois do uploadFile abre o sub-modal "Upload Laudo Classificação #<id>"
  // (Filial/Tipo Arquivo/Referência + arquivo escolhido) que tem o SEU PRÓPRIO
  // "Salvar" — o clickButtonByText('Salvar') global pegava o primeiro "Salvar"
  // do documento (o do modal de trás), então o upload nunca era salvo e o
  // "Laudo anexado" era logado sem confirmação (screenshot 23/09/2026). Acha o
  // Salvar do sub-modal (menor ancestral do título que contém um Salvar),
  // clica de verdade e só considera anexado se o sub-modal fechar.
  const rectSalvarUpload = await page.evaluate(() => {
    const ehSalvar = (b) => { const t = (b.textContent || '').replace(/\s+/g, ' ').trim(); return t === 'Salvar' || t.endsWith(' Salvar'); };
    const titulo = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && (e.textContent || '').includes('Upload Laudo Classificação'));
    let el = titulo;
    while (el && !Array.from(el.querySelectorAll('button')).some(ehSalvar)) el = el.parentElement;
    const btn = el ? Array.from(el.querySelectorAll('button')).find(ehSalvar) : null;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!rectSalvarUpload) {
    await page.screenshot({ path: '/home/grao100/painel-scripts/grm-sync/logs/debug-erro-upload-laudo.png', fullPage: true }).catch(() => {});
    throw new Error('Sub-modal "Upload Laudo Classificação" com botão Salvar não encontrado depois do uploadFile.');
  }
  // Empresa/Filial do agendamento — o erro `sys_Arquivo violates not-null
  // constraint` (bytes do arquivo não chegam ao servidor) apareceu só em
  // parte das placas (OS Bom Despacho/OS Tibagi; OS Cuiabá funcionou), então
  // registra pra correlacionar.
  const empresaFilial = await page.evaluate(() => {
    // Rótulos SELECIONADOS dos dropdowns Radzen (Empresa, Local, Classificadora,
    // Produto do modal e Filial/Tipo do sub-modal), na ordem do DOM.
    return Array.from(document.querySelectorAll('.rz-dropdown-label')).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
  }).catch(() => null);
  log('DEBUG', `[diag:upload-empresa] ${JSON.stringify(empresaFilial)}`);

  // Até 3 tentativas: clica Salvar; se o sub-modal não fechar (toast de erro
  // sys_Arquivo), reenvia o arquivo no mesmo input e tenta Salvar de novo.
  let subModalFechou = false;
  for (let tentativa = 1; tentativa <= 3 && !subModalFechou; tentativa += 1) {
    if (tentativa > 1) {
      const inputDeNovo = await page.$('input[type=file]');
      if (!inputDeNovo) break;
      await inputDeNovo.uploadFile(pdfPath);
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 }).catch(() => {});
      await wait(5000);
    }
    const rect = tentativa === 1 ? rectSalvarUpload : await page.evaluate(() => {
      const ehSalvar = (b) => { const t = (b.textContent || '').replace(/\s+/g, ' ').trim(); return t === 'Salvar' || t.endsWith(' Salvar'); };
      const titulo = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && (e.textContent || '').includes('Upload Laudo Classificação'));
      let el = titulo;
      while (el && !Array.from(el.querySelectorAll('button')).some(ehSalvar)) el = el.parentElement;
      const btn = el ? Array.from(el.querySelectorAll('button')).find(ehSalvar) : null;
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) break;
    await page.mouse.click(rect.x, rect.y);
    for (let t = 0; t < 16 && !subModalFechou; t += 1) {
      await wait(500);
      subModalFechou = !(await page.evaluate(() => Array.from(document.querySelectorAll('*')).some((e) => e.children.length === 0 && (e.textContent || '').includes('Upload Laudo Classificação'))));
    }
    if (!subModalFechou) log('WARN', `Upload do laudo: sub-modal não fechou na tentativa ${tentativa}/3.`);
  }
  await page.screenshot({ path: '/home/grao100/painel-scripts/grm-sync/logs/debug-pos-salvar-upload-laudo.png', fullPage: false }).catch(() => {});
  if (!subModalFechou) {
    throw new Error('Clicou em Salvar no sub-modal de upload do laudo (3 tentativas), mas ele não fechou — anexo não confirmado.');
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
// `placaHifenizada` (opcional, ex. "ATP-2B69"): filtra a consulta por placa no
// servidor (campo `loaLicensePlate`, confirmado ao vivo 23/09/2026).
async function fetchClassificacoesGRM(token, placaHifenizada = null) {
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
    ...(placaHifenizada ? { loaLicensePlate: placaHifenizada } : {}),
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
// 24/09/2026: a versão anterior pegava a PRIMEIRA carga do cliente com aquela
// placa na janela de 3 dias, sem olhar a data — placa que carregou em mais de
// um dia podia casar com a carga (valores/O.S./laudo) do dia errado. Agora
// filtra por placa+cliente e, quando a data do agendamento é conhecida
// (`dataISO`, "YYYY-MM-DD"), só aceita carga do MESMO dia (ou ±1 dia, pra
// virada de noite), preferindo a mais próxima e, em empate, a mais recente.
// REGRA DO USUÁRIO (24/09/2026): as placas analisadas são sempre do dia de
// HOJE — a carga do GRM precisa ter EXATAMENTE a data alvo (a do agendamento;
// hoje se não der pra ler) e não há tolerância de ±1 dia.
function buscarClassificacaoGRM(loadsGRM, placa, dataISO = null) {
  const alvo = normalizePlaca(placa);
  let candidatas = loadsGRM.filter((l) => {
    const cliente = (l.cliName || '').toUpperCase();
    if (!cliente.includes(CLIENTE_FILTRO_GRM)) return false;
    return normalizePlaca(l.loaLicensePlate) === alvo;
  });
  const dataAlvo = dataISO || hojeISOBrasilia();
  candidatas = candidatas
    .filter((l) => String(l.loaDate).slice(0, 10) === dataAlvo)
    .sort((x, y) => String(y.loaRegisterDate).localeCompare(String(x.loaRegisterDate)));
  const load = candidatas[0];
  if (!load) return null;

  const itens = load.cItems || [];
  const porCodigo = (codigo) => itens.find((i) => i.pctCodeATT === codigo);
  const umidadeItem = porCodigo('umidade');
  const impurezaItem = porCodigo('impureza');
  const avariadoItem = itens.find((i) => i.pctCodeATT === 'avariado' && i.pciIsTotal === 'S') || porCodigo('avariado');

  return {
    loaCode: load.loaCode,
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

// 24/09/2026: o laudo agora vem DIRETO da API do GRM (`load/generateLoadPDF`,
// a mesma chamada que o botão "Imprimir Laudo" da tela faz), identificado pelo
// `loaCode` da carga exata escolhida — sem Puppeteer no GRM. O caminho antigo
// (clicar na tela, abrir a aba blob: e dar fetch no blob) devolvia um PDF
// vazio de 583 bytes, que o Ouro Safra rejeitava ("sys_Arquivo violates
// not-null constraint"); a API devolve o PDF real (~56 KB) em base64.
async function baixarLaudoViaApi(token, loaCode) {
  if (!loaCode) throw new Error('Carga do GRM sem loaCode — laudo não baixado.');
  const res = await requestJsonGrm(`${GRM_API_BASE}load/generateLoadPDF`, 'POST', {
    loaCode,
    returnType: 'base64',
  }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!res.result || !res.fileBase64) throw new Error(`GRM não gerou o laudo da carga ${loaCode}: ${res.message || 'resposta sem fileBase64'}`);
  const pdf = Buffer.from(res.fileBase64, 'base64');
  if (pdf.slice(0, 5).toString('latin1') !== '%PDF-' || pdf.length < 5000) {
    throw new Error(`Laudo da carga ${loaCode} inválido (${pdf.length} bytes, cabeçalho "${pdf.slice(0, 5).toString('latin1')}").`);
  }
  return pdf;
}

async function baixarLaudoDaOS(page, browser, numeroOS, placa) {
  // Diagnóstico temporário (22/09/2026): investigar a causa do travamento
  // intermitente (~500s, "Runtime.callFunctionOn timed out") logo depois da
  // busca da O.S. Esse listener NÃO depende de nenhum evaluate — é
  // orientado a eventos de rede via CDP (Network domain), então continua
  // logando normalmente mesmo que a thread de JS da página trave (o que
  // seria a própria causa do problema, no mesmo padrão já confirmado pro
  // lado do Ouro Safra com o Google Maps). Se durante o travamento aparecer
  // uma requisição repetindo sem parar (polling, websocket, retry), é forte
  // candidato à causa raiz.
  const t0Rede = Date.now();
  const onRequest = (req) => {
    const tipo = req.resourceType();
    if (tipo === 'image' || tipo === 'font' || tipo === 'stylesheet') return;
    log('DEBUG', `[rede-grm +${Date.now() - t0Rede}ms] ${tipo} ${req.method()} ${req.url().slice(0, 150)}`);
  };
  page.on('request', onRequest);
  try {
    return await baixarLaudoDaOSInterno(page, browser, numeroOS, placa);
  } finally {
    page.off('request', onRequest);
  }
}

async function baixarLaudoDaOSInterno(page, browser, numeroOS, placa) {
  const t0 = Date.now();
  const checkpoint = (etapa) => log('DEBUG', `[timing:baixarLaudoDaOS] ${etapa} em ${Date.now() - t0}ms`);
  checkpoint('inicio');
  await page.goto('https://www.grmserver.com.br/operation/serviceOrder', { waitUntil: 'networkidle2', timeout: 60000 });
  checkpoint('goto concluido');
  // Hipótese 23/09/2026: em produção o navegador tem 2 abas (Ouro Safra +
  // GRM); a do GRM fica em segundo plano e o Chrome throttla rAF/render, o
  // que pode impedir o Vuetify de montar o conteúdo dos painéis de data do
  // modal (o diagnóstico isolado, de aba única em primeiro plano, achava a
  // placa; produção não). Traz a aba pra frente.
  await page.bringToFront().catch(() => {});
  await wait(2000);
  // Busca pelo número da O.S. no campo de busca livre da toolbar (única
  // implementação real — uma chamada anterior a uma função inexistente
  // "preencherCampoTexto" foi removida em 18/09/2026: sempre lançava
  // ReferenceError antes mesmo do .catch() poder suprimir, então nunca
  // executou nada além do que este trecho já faz).
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
  checkpoint('busca da O.S. concluida');
  // Hipótese testada em 22/09/2026: logo depois da busca, a página do GRM
  // dispara uma rajada de ~8 chamadas AJAX de uma vez (getForSelect dos
  // dropdowns de Serviço/Cliente/Coordenação/Produto, getStates, e o
  // getRecords que efetivamente popula a tabela de resultados) — confirmado
  // ao vivo pelo log de rede (log de requisições, não depende de nenhum
  // evaluate). As duas travadas capturadas ao vivo aconteceram bem depois
  // dessa rajada, exatamente ao tentar CLICAR na checkbox recém-encontrada
  // — suspeita de que o re-render disparado por essas respostas (populando
  // a tabela) ocupa a thread de JS da página por um tempo, no mesmo padrão
  // já confirmado com o Google Maps do lado do Ouro Safra. Espera a rede
  // ficar realmente ociosa (não só o fixed wait de antes) antes de mexer no
  // DOM da tabela.
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => {});
  checkpoint('rede ociosa apos busca (ou timeout de 15s)');
  await wait(1500);

  // CORREÇÃO 18/09/2026: todos os cliques daqui pra baixo usavam .click()
  // sintético DENTRO de page.evaluate() — o mesmo erro que o topo do
  // arquivo já documentava pra outros elementos ("Blazor Server só reage a
  // eventos de clique de verdade via CDP"). Isso fazia o modal "Lista de
  // Cargas" NUNCA abrir de verdade (confirmado ao vivo: diagnóstico mostrou
  // temModalListaCargas=false toda vez), e por consequência a placa nunca
  // era encontrada mais adiante — o erro "Placa não encontrada na lista de
  // Cargas" era só um sintoma. Trocado por evaluateHandle + ElementHandle
  // .click() (clique real via CDP) em cada etapa, no mesmo padrão já usado
  // em abrirAgendamento().

  // marca a checkbox da linha da O.S. e abre o modal "Cargas"
  // CORREÇÃO 22/09/2026: nas 3 reproduções ao vivo capturadas com
  // checkpoints, travava sempre no MESMO ponto exato — achar a checkbox via
  // evaluateHandle funcionava rápido, mas o .click() (ElementHandle real,
  // via CDP) sobre ela travava ~500s até o protocolTimeout. waitForNetworkIdle
  // não resolveu (a rede já estava ociosa quando travou). Hipótese: seguar
  // um ElementHandle vivo entre o evaluateHandle e o .click() faz o
  // ElementHandle.click() precisar computar a posição na tela via CDP
  // (DOM.getBoxModel) sobre um nó que pode estar sendo re-renderizado
  // àquela altura, e é exatamente aí que trava.
  // TENTATIVA (revertida no mesmo dia): achar+clicar num só page.evaluate()
  // com .click() sintético eliminou o travamento, mas reintroduziu o bug já
  // documentado em 18/09 logo abaixo — o clique sintético NUNCA abre o modal
  // "Lista de Cargas" no GRM (confirmado ao vivo pelo screenshot de debug:
  // checkbox aparecia marcada — isso é comportamento nativo do input,
  // acontece mesmo sem handler nenhum reagir — mas o modal simplesmente não
  // abria, e a rede não mostrava nenhuma chamada de dados da O.S. depois do
  // clique no botão Cargas). CORREÇÃO FINAL: pega a posição do elemento
  // (getBoundingClientRect) dentro de um evaluate atômico — sem manter
  // handle vivo, sem DOM.getBoxModel — e dispara o clique de verdade via
  // page.mouse.click(x, y) (Input.dispatchMouseEvent via CDP, clique
  // confiável/isTrusted, mas independente de qualquer referência a nó do
  // DOM). Isso junta as duas propriedades: sem janela de corrida com handle
  // velho E com clique de verdade que o GRM exige pra reagir.
  const checkboxRect = await page.evaluate(() => {
    const row = document.querySelector('table tbody tr');
    const checkbox = row?.querySelector('input[type=checkbox]');
    if (!checkbox) return null;
    checkbox.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = checkbox.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (checkboxRect) await page.mouse.click(checkboxRect.x, checkboxRect.y);
  checkpoint(`checkbox O.S. clicada (real, sucesso=${!!checkboxRect})`);

  // Espera de verdade o botão "Cargas" ficar habilitado (em vez de um wait
  // fixo) — CORREÇÃO 23/09/2026: com wait(500) fixo, uma fração das
  // tentativas em produção clicava no botão Cargas ANTES do Vue terminar de
  // reagir à checkbox (re-render que tira `v-btn--disabled` do botão), e o
  // clique nesse estado intermediário não abre o modal (confirmado ao vivo:
  // screenshot mostrava a mesma tela de listagem, sem modal e sem nenhum
  // efeito visível, depois de "sucesso=true" no clique — ou seja, achou e
  // clicou no botão certo, só que ele ainda não reagia).
  const CARGAS_POLL_TIMEOUT_MS = 5000;
  async function acharBotaoCargasHabilitado() {
    const t0Poll = Date.now();
    while (Date.now() - t0Poll < CARGAS_POLL_TIMEOUT_MS) {
      const rect = await page.evaluate(() => {
        const toolbar = document.querySelector('header.action-bar, [class*="action-bar"]') || document;
        const btn = Array.from(toolbar.querySelectorAll('button'))[3];
        if (!btn || btn.disabled || btn.className.includes('v-btn--disabled')) return null;
        btn.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (rect) return rect;
      await wait(200);
    }
    return null;
  }
  // 4º ícone da toolbar principal = "Cargas" (confirmado manualmente).
  // BUG ENCONTRADO 22/09/2026 (diagnóstico ao vivo, script read-only à
  // parte): `.toolbar, [class*="toolbar"]` casa com QUALQUER elemento cujo
  // className contenha "toolbar" — e o PRIMEIRO em ordem de documento não é
  // a barra de ações da O.S. (que fica mais abaixo na página), é o HEADER
  // GLOBAL do GRM (Vuetify `v-app-bar topbar`). O botão índice [3] desse
  // header global é o botão da CONTA do usuário — confirmado ao vivo que
  // era exatamente esse o "clique fantasma" que abria o dropdown "Mobile
  // Key/Minha Conta/Logout" nos screenshots de debug, nunca a Cargas de
  // verdade. A barra de ações real da O.S. tem classe própria
  // `action-bar legend-data` (elemento `<header class="... action-bar ...">`),
  // sem colisão com o header global (que não tem "action-bar" na classe).
  // Confirmado ao vivo: com esse seletor corrigido, o índice [3] dentro
  // dela É o ícone de caminhão (Cargas) — abre o modal "Lista de Cargas" de
  // verdade (validado via diagnóstico dedicado, sem esse fix o modal nunca
  // abria em nenhuma das reproduções).
  let cargasRect = await acharBotaoCargasHabilitado();
  if (cargasRect) await page.mouse.click(cargasRect.x, cargasRect.y);
  checkpoint(`botao Cargas clicado (real, sucesso=${!!cargasRect})`);

  // Espera de verdade o modal "Lista de Cargas" abrir (em vez de wait fixo);
  // se não abrir dentro do timeout, tenta clicar de novo uma vez (pode ter
  // sido um clique perdido por transição de estado do botão).
  async function modalCargasAbriu() {
    const t0Poll = Date.now();
    while (Date.now() - t0Poll < 4000) {
      const abriu = await page.evaluate(() => !!document.querySelector('.modal-wrp') && (document.querySelector('.modal-wrp').textContent || '').includes('Lista de Cargas'));
      if (abriu) return true;
      await wait(200);
    }
    return false;
  }
  if (!(await modalCargasAbriu())) {
    checkpoint('modal Lista de Cargas nao abriu na 1a tentativa, retentando clique');
    cargasRect = await acharBotaoCargasHabilitado();
    if (cargasRect) await page.mouse.click(cargasRect.x, cargasRect.y);
    await modalCargasAbriu();
  }
  checkpoint('modal Lista de Cargas confirmado aberto (ou timeout apos retry)');

  // expande o(s) grupo(s) de data — CORREÇÃO 18/09/2026: a versão anterior
  // (ainda com clique sintético) selecionava QUALQUER elemento (div/tr) com
  // um padrão de data no texto, sem filtrar qual data — trocar isso pra
  // clique real (obrigatório pra Blazor reagir) sem restringir a busca
  // fazia o loop percorrer centenas de elementos candidatos na página
  // inteira, cada um com 2 round-trips ao navegador, travando por vários
  // minutos. Restringe aos grupos de HOJE/ONTEM (a intenção original do
  // comentário) usando as mesmas funções de data já usadas no resto do
  // arquivo — no máximo ~2 cliques reais em vez de uma quantidade
  // desconhecida. CORREÇÃO 22/09/2026: coordenadas via evaluate atômico +
  // clique de verdade via page.mouse.click (mesmo motivo do bloco acima —
  // clique sintético não abre/expande nada no GRM).
  // BUG ENCONTRADO 22/09/2026 (2ª rodada, depois de corrigir o botão
  // Cargas): a lista de grupos é um ACORDEÃO de verdade
  // (`v-expansion-panels--variant-accordion`, confirmado ao vivo) — abrir um
  // grupo FECHA o anterior automaticamente, removendo do DOM as linhas que
  // acabaram de aparecer. O código antigo clicava em HOJE e depois em ONTEM
  // sem procurar a placa entre um clique e outro — se a placa estava no
  // grupo de HOJE, o clique seguinte em ONTEM fechava esse grupo antes da
  // busca da placa rodar, fazendo dar "não encontrada" mesmo com a placa lá
  // (confirmado ao vivo: script de diagnóstico isolado, clicando só em
  // HOJE e sem tocar em ONTEM, achou a placa numa O.S. que a produção
  // reportava repetidamente como "não encontrada"). Corrigido: clica numa
  // data, procura a placa NA HORA, só passa pra próxima data se não achou.
  // BUG ENCONTRADO 23/09/2026 (3ª rodada): o localizador do grupo buscava
  // `div/tr` com o texto da data no DOCUMENTO INTEIRO — a linha da própria
  // O.S. (atrás do modal) também mostra uma data (a da O.S., que em O.S. novas
  // é hoje/ontem) e casava ANTES do painel do modal, então o clique caía na
  // tela errada e o painel nunca abria ("tentativa na data ... sucesso=false"
  // em O.S. novas, mesmo com a placa presente na lista — confirmado ao vivo
  // com diagnóstico isolado na O.S. 93641, que achou as 3 placas que a
  // produção reportava como não encontradas). Corrigido: escopa tudo ao
  // modal (`.modal-wrp`) e itera pelos painéis reais (título do acordeão) em
  // ordem — os mais recentes vêm primeiro — em vez de casar por texto de
  // data. Limita a 5 painéis pra não varrer O.S. antigas inteiras.
  // 23/09/2026 (4ª rodada): mesmo escopado ao modal, produção ainda falhava
  // com a placa presente (diagnóstico isolado, com a MESMA lógica de busca,
  // achava a placa + checkbox na O.S. 93409). Única diferença real: timing —
  // o diagnóstico espera 3s depois de abrir o modal antes de clicar nos
  // painéis; produção clicava assim que o cabeçalho "Lista de Cargas"
  // aparecia, e o re-render que vem com a resposta de getDaysAndLoads pode
  // resetar o painel recém-aberto. Agora: espera a lista de painéis
  // estabilizar, confere `aria-expanded` depois do clique (reclica se não
  // abriu) e faz polling pela linha da placa em vez de uma checagem só.
  async function contarPaineis() {
    return page.evaluate(() => document.querySelectorAll('.modal-wrp button.v-expansion-panel-title').length).catch(() => 0);
  }
  let qtdPaineis = 0;
  for (let t = 0; t < 25 && qtdPaineis === 0; t += 1) {
    qtdPaineis = await contarPaineis();
    if (qtdPaineis === 0) await wait(200);
  }
  await wait(1500);
  qtdPaineis = await contarPaineis();
  checkpoint(`paineis de data no modal: ${qtdPaineis}`);
  const buscarPlacaNoModal = (placaBusca) => page.evaluate((placaAlvo) => {
    // Compara ignorando hífen dos dois lados — a Ouro Safra normaliza sem
    // hífen e não dá pra garantir que a lista de Cargas do GRM sempre
    // mostre a placa formatada do mesmo jeito que o restante do GRM.
    const alvo = placaAlvo.toUpperCase().replace(/-/g, '');
    const row = Array.from(document.querySelectorAll('.modal-wrp table tr')).find((r) => (r.textContent || '').toUpperCase().replace(/-/g, '').includes(alvo));
    const checkbox = row?.querySelector('input[type=checkbox]');
    if (!checkbox) return null;
    checkbox.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = checkbox.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, placaBusca);
  const rectTituloPainel = (idx) => page.evaluate((i) => {
    const titulo = document.querySelectorAll('.modal-wrp button.v-expansion-panel-title')[i];
    if (!titulo) return null;
    titulo.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = titulo.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, expandido: titulo.getAttribute('aria-expanded') === 'true' };
  }, idx).catch(() => null);
  let placaRect = null;
  for (let i = 0; i < Math.min(qtdPaineis, 5) && !placaRect; i += 1) {
    let titulo = await rectTituloPainel(i);
    if (!titulo) continue;
    if (!titulo.expandido) await page.mouse.click(titulo.x, titulo.y).catch(() => {});
    for (let t = 0; t < 8 && !placaRect; t += 1) {
      await wait(400);
      placaRect = await buscarPlacaNoModal(placa);
      if (!placaRect && t === 2) {
        titulo = await rectTituloPainel(i);
        if (titulo && !titulo.expandido) await page.mouse.click(titulo.x, titulo.y).catch(() => {});
      }
    }
    checkpoint(`tentativa no painel ${i} (real, sucesso=${!!placaRect})`);
  }
  await page.screenshot({ path: `/home/grao100/painel-scripts/grm-sync/logs/debug-cargas-${placa.replace(/[^a-zA-Z0-9]/g, '')}.png`, fullPage: true }).catch(() => {});

  checkpoint(`placa marcada na lista de Cargas (real, sucesso=${!!placaRect})`);
  if (!placaRect) {
    const diagFalha = await page.evaluate(() => ({
      visibilidade: document.visibilityState,
      modais: document.querySelectorAll('.modal-wrp').length,
      tabelasNoModal: document.querySelectorAll('.modal-wrp table').length,
      trsNoModal: document.querySelectorAll('.modal-wrp table tr').length,
      paineis: Array.from(document.querySelectorAll('.modal-wrp button.v-expansion-panel-title')).map((b) => b.getAttribute('aria-expanded')),
      placasVisiveis: Array.from(document.querySelectorAll('.modal-wrp table tr')).map((t) => (t.textContent || '').match(/[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i)?.[0]).filter(Boolean),
    })).catch((e) => ({ erroDiag: e.message }));
    log('DEBUG', `[diag:placa-nao-encontrada] ${JSON.stringify(diagFalha)}`);
    throw new Error(`Placa ${placa} não encontrada na lista de Cargas da O.S. ${numeroOS} — laudo não baixado.`);
  }
  await page.mouse.click(placaRect.x, placaRect.y);
  await wait(500);

  const newTargetPromise = browser.waitForTarget((t) => t.url().startsWith('blob:'), { timeout: 20000 });
  // 2º ícone da barra do modal de cargas = "Imprimir Laudo" (confirmado
  // manualmente e revalidado ao vivo em 22/09/2026 — alterna de desabilitado
  // pra habilitado exatamente quando uma carga é selecionada, mesma posição
  // de sempre). BUG ENCONTRADO 22/09/2026: o localizador do modal
  // (`document.querySelectorAll('*').find(...).closest('div')`) sempre
  // resolvia pra `null` — `querySelectorAll('*')` lista elementos em ordem
  // de documento, então o PRIMEIRO cujo textContent (agregado dos
  // descendentes) contém "Lista de Cargas" é ancestral de tudo (tipo
  // `<html>`/`<body>`), que não tem nenhum `<div>` acima — `.closest('div')`
  // sempre dava `null`, caindo no fallback `document` inteiro e clicando em
  // qualquer botão aleatório da página toda. Corrigido: usa a classe real do
  // card do modal (`.modal-wrp`, confirmada ao vivo via inspeção da árvore
  // DOM) em vez de tentar re-derivar o container a partir do texto.
  const imprimirRect = await page.evaluate(() => {
    const modal = document.querySelector('.modal-wrp');
    const toolbar = modal?.querySelector('[class*="action-bar"]') || modal;
    // ÍNDICE 2 (não 1) — confirmado ao vivo em 23/09/2026: [0] é o contador
    // de cargas selecionadas ("1"), [1] é o lápis EDITAR (abre o formulário
    // de edição da carga — chamadas productType/conveyor/restrictiveSeed),
    // e [2] é o ícone de documento que chama POST /api/load/generateLoadPDF
    // e abre a aba blob: com o laudo. Com [1], o script nunca recebia o
    // target blob: e estourava "waiting for target failed: timeout".
    const btn = Array.from((toolbar || document).querySelectorAll('button'))[2];
    if (!btn) return null;
    btn.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (imprimirRect) await page.mouse.click(imprimirRect.x, imprimirRect.y);
  checkpoint(`botao Imprimir Laudo clicado (real, sucesso=${!!imprimirRect})`);
  const target = await newTargetPromise;
  checkpoint('target blob: recebido');
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

async function processarPlaca(pageOuroSafra, tokenGrmApi, agendamento, classificacoesGRM) {
  const inicio = Date.now();
  const registro = {
    agendamento_id: agendamento.id,
    placa: agendamento.placa,
    iniciado_em: new Date().toISOString(),
  };
  try {
    const grm = buscarClassificacaoGRM(classificacoesGRM, agendamento.placa, agendamento.dataISO);
    if (!grm || !grm.os) {
      log('INFO', `${agendamento.placa}: sem correspondência no GRM ainda, pulando.`);
      registro.status = 'sem-correspondencia';
      return;
    }

    // BUG CRÍTICO corrigido em 17/09/2026: grm.materiasImp/umidade/avariadoTotal
    // vêm de load.cItems[].lciValue da API do GRM (ver buscarClassificacaoGRM),
    // que já é um NUMBER nativo do JSON (ex.: 12.2) — não um texto brasileiro
    // com vírgula decimal. parseBrNumber() foi escrito pra texto raspado de
    // tabela HTML (era o fluxo ANTES da migração pra API em 01/09/2026) e
    // trata "." como separador de milhar: ao rodar String(12.2) -> "12.2" ->
    // remove o ponto -> "122", INFLANDO todo valor ~10-1000x (confirmado ao
    // vivo: PPB-4E37 tinha Umidade real 12,2% no GRM e o dry-run calculou
    // 122,00%; ILS-0C10 tinha 1,398% e virou 1398,00%). Como a produção roda
    // sem DRY_RUN, isso escreveria classificação errada na Ouro Safra em
    // qualquer ciclo que conseguisse casar uma placa — só não aconteceu
    // ainda porque o bug de timeout na listagem (ver memória do projeto)
    // impediu 95% dos ciclos de chegar até aqui. Os valores já vêm certos da
    // API, só precisam de Number() por segurança (ex.: string vinda de JSON).
    const valores = {
      impureza: Number.isFinite(Number(grm.materiasImp)) ? Number(grm.materiasImp) : null,
      umidade: Number.isFinite(Number(grm.umidade)) ? Number(grm.umidade) : null,
      avariados: Number.isFinite(Number(grm.avariadoTotal)) ? Number(grm.avariadoTotal) : null,
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

    const pdfBuffer = await baixarLaudoViaApi(tokenGrmApi, grm.loaCode);
    const tmpPath = path.join(os.tmpdir(), `laudo-${agendamento.placa}-${grm.os}.pdf`);
    fs.writeFileSync(tmpPath, pdfBuffer);
    // Diagnóstico 23/09/2026: Ouro Safra rejeitou o upload com "sys_Arquivo
    // violates not-null constraint" (bytes não chegaram) — confere se o PDF
    // baixado do GRM tem conteúdo/cabeçalho válidos e guarda uma cópia.
    log('INFO', `Laudo baixado: ${pdfBuffer.length} bytes, cabeçalho="${pdfBuffer.slice(0, 5).toString('latin1')}"`);
    try { fs.copyFileSync(tmpPath, '/home/grao100/painel-scripts/grm-sync/logs/debug-ultimo-laudo.pdf'); } catch (e) { /* diagnóstico */ }

    // 23/09/2026: baixarLaudoDaOS traz a aba do GRM pra frente
    // (bringToFront), deixando a do Ouro Safra em segundo plano — e o
    // FileChooser do Upload Laudo não abre numa aba em segundo plano
    // ("Waiting for FileChooser failed: 15000ms exceeded", confirmado ao vivo
    // logo depois do PDF ser baixado com sucesso). Devolve o foco.
    await pageOuroSafra.bringToFront().catch(() => {});
    await wait(500);
    await pageOuroSafra.screenshot({ path: '/home/grao100/painel-scripts/grm-sync/logs/debug-antes-upload-laudo.png', fullPage: false }).catch(() => {});
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
    // Achado ao vivo 02/09/2026: o mesmo fluxo (login, clicar card, subir
    // itens por página, ler a grid) roda limpo em ~8s local — só trava no
    // servidor, sempre no mesmo ponto, com ou sem o protocolTimeout maior e
    // com ou sem o Maps bloqueado. O único diferencial visível nos logs do
    // servidor é o "Puppeteer old Headless deprecation warning" (o Headless
    // ANTIGO, mais bugado/pesado, especialmente sem GPU — o servidor loga
    // "vkCreateInstance: Found no drivers!", caindo pra renderização por
    // software). Troca pro Headless NOVO, como o próprio aviso já sugere.
    browser = await puppeteer.launch({
      headless: HEADLESS ? 'new' : false,
      dumpio: true,
      args: LAUNCH_ARGS,
      defaultViewport: HEADLESS ? { width: 1440, height: 900 } : null,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
    });

    const pageOuroSafra = await browser.newPage();
    if (HEADLESS) await pageOuroSafra.setViewport({ width: 1440, height: 900 });
    // A tela cdci (Painel Classificação Ext.) carrega a Google Maps
    // JavaScript API DUAS VEZES (2 chaves, 2 callbacks — initializeMap e
    // callbackMap), e o callbackMap nunca resolve ("Uncaught (in promise)
    // InvalidValueError: callbackMap is not a function", confirmado ao vivo
    // 02/09/2026 inspecionando a página manualmente). Isso deixa o loader do
    // Maps girando e prende a aba num loop que consome 260%+ de CPU
    // contínuo no Chrome headless do servidor (confirmado via `top` durante
    // um run real: 1 processo chrome, >10min de CPU acumulada num run de
    // ~10min) — essa é a causa real dos timeouts de listagem (não lentidão
    // de rede como se pensava antes), porque o Runtime.callFunctionOn do
    // Puppeteer nunca consegue rodar com a thread da aba saturada. A tela
    // de classificação não usa mapa nenhum, só a grid — bloqueando essas
    // requisições a página nunca tenta inicializar o Maps.
    await pageOuroSafra.setRequestInterception(true);
    pageOuroSafra.on('request', (req) => {
      const url = req.url();
      if (url.includes('maps.googleapis.com') || url.includes('markerclustererplus')) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await loginOuroSafra(pageOuroSafra);


    // Busca via API (HTTP puro, sem Puppeteer) — 1 chamada só pra todo o
    // lote, em vez de 1 navegação de página por placa (ver nota 01/09/2026
    // no topo do arquivo).
    const tokenGrmApi = await loginGrmApi();
    // 23/09/2026: a API do GRM passou a devolver HTTP 404 com erro interno
    // deles (`SyntaxError ... "pciCode":]`) na consulta em lote de HOJE — o
    // join de itens (`joinCItems`) quebra o JSON deles por causa de UMA carga
    // com item de classificação corrompido (pciCode vazio); sem o join
    // funciona, e com filtro por placa funciona. Fallback: se o lote falhar,
    // consulta placa a placa só as pendentes (mais abaixo, depois de listar a
    // fila), pulando só a placa que eventualmente for a corrompida.
    let classificacoesGRM = [];
    let loteGrmFalhou = false;
    try {
      classificacoesGRM = await fetchClassificacoesGRM(tokenGrmApi);
      log('INFO', `${classificacoesGRM.length} carga(s) classificada(s) no GRM (${DIAS_BUSCA_GRM === 0 ? 'só hoje' : `últimos ${DIAS_BUSCA_GRM} dia(s)`}).`);
    } catch (e) {
      loteGrmFalhou = true;
      log('WARN', `Consulta em lote ao GRM falhou (${e.message}) — usando consulta por placa.`);
    }

    // "Carregando" e "Aguardando Classificação" SÃO processados igual, mas
    // não do jeito que o comentário original (28/08) descrevia. Descoberta
    // ao vivo em 17/09/2026 (com ajuda do usuário, que apontou o passo
    // certo): o modal de uma placa em "Carregando" abre só com os campos de
    // metadado (Empresa/Local/Classificadora/Produto) e SEM a tabela de
    // itens — mas clicar em "Salvar" mesmo vazio cria o registro de
    // classificação (toast "Classificação criada com sucesso") e a MESMA
    // tela, sem precisar fechar/reabrir, passa a mostrar a seção "Itens da
    // Classificação" com Impureza/Umidade/Avariados editáveis (ver
    // abrirAgendamento). Ou seja, o "Carregando" não é um bloqueio de
    // negócio — só falta esse Salvar inicial pra "destravar" a placa,
    // independente do card em que ela está.
    const carregando = await listarAgendamentosCarregando(pageOuroSafra);
    const pendentes = await listarAgendamentosPendentes(pageOuroSafra);
    log('INFO', `${carregando.length} placa(s) em "Carregando", ${pendentes.length} em "Aguardando Classificação"`);

    // Só agendamentos de HOJE (regra do usuário, 24/09/2026): placas de outros
    // dias que ficaram penduradas em "Carregando" não são analisadas. Se a
    // data da linha não puder ser lida (dataISO null), mantém — a carga do GRM
    // ainda é exigida com a data de hoje.
    const hojeISO = hojeISOBrasilia();
    const filaTodas = [
      ...carregando.map((a) => ({ ...a, card: 'Carregando' })),
      ...pendentes.map((a) => ({ ...a, card: 'Aguardando Classificação' })),
    ];
    let fila = filaTodas.filter((a) => !a.dataISO || a.dataISO === hojeISO);
    log('INFO', `${fila.length} placa(s) de hoje (${hojeISO}) na fila; ${filaTodas.length - fila.length} de outras datas ignorada(s) (ex.: dataTexto="${filaTodas[0] ? filaTodas[0].dataTexto : null}" -> ${filaTodas[0] ? filaTodas[0].dataISO : null}).`);

    // Dedupe: placas que já tiveram uma execução com status 'sucesso' (itens +
    // laudo anexado e confirmado) não são reprocessadas — sem isso, o
    // agendamento continua listado no card e o agente re-editaria os itens e
    // duplicaria o laudo a cada ciclo.
    const idsFila = fila.map((a) => a.id).filter(Boolean);
    if (idsFila.length > 0) {
      const { data: feitos, error: erroFeitos } = await supabase.from(EXEC_TABLE).select('agendamento_id').eq('status', 'sucesso').in('agendamento_id', idsFila);
      if (erroFeitos) {
        log('WARN', `Não consegui consultar execuções anteriores (${erroFeitos.message}) — seguindo sem dedupe.`);
      } else {
        const jaFeitos = new Set((feitos || []).map((r) => String(r.agendamento_id)));
        const antes = fila.length;
        fila = fila.filter((a) => !jaFeitos.has(String(a.id)));
        if (antes !== fila.length) log('INFO', `${antes - fila.length} placa(s) já concluída(s) com sucesso em ciclos anteriores — ignorada(s).`);
      }

      // 24/09/2026 (pedido do usuário): placas que já falharam no upload do
      // laudo (Ouro Safra rejeita com `sys_Arquivo violates not-null
      // constraint` em algumas filiais, problema do lado deles) não são
      // reprocessadas a cada ciclo — só geravam ruído e repetiam a edição dos
      // itens. Pra reprocessá-las depois que o Ouro Safra for corrigido, rode
      // com OUROSAFRA_REPROCESSAR_FALHAS_UPLOAD=true.
      if (process.env.OUROSAFRA_REPROCESSAR_FALHAS_UPLOAD !== 'true') {
        const { data: falhasUpload, error: erroFalhas } = await supabase.from(EXEC_TABLE).select('agendamento_id').eq('status', 'erro').ilike('erro', '%sub-modal de upload%').in('agendamento_id', idsFila);
        if (erroFalhas) {
          log('WARN', `Não consegui consultar falhas de upload anteriores (${erroFalhas.message}) — seguindo sem esse filtro.`);
        } else {
          const comFalha = new Set((falhasUpload || []).map((r) => String(r.agendamento_id)));
          const antesFalhas = fila.length;
          fila = fila.filter((a) => !comFalha.has(String(a.id)));
          if (antesFalhas !== fila.length) log('INFO', `${antesFalhas - fila.length} placa(s) com falha de upload anterior — reprocesso pausado.`);
        }
      }
    }

    if (loteGrmFalhou) {
      const placasUnicas = [...new Set(fila.map((a) => normalizePlaca(a.placa)).filter(Boolean))];
      for (const p of placasUnicas) {
        const hifenizada = p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
        try {
          classificacoesGRM.push(...(await fetchClassificacoesGRM(tokenGrmApi, hifenizada)));
        } catch (e) {
          log('WARN', `${hifenizada}: consulta por placa ao GRM falhou (${e.message.slice(0, 80)}), pulando.`);
        }
      }
      log('INFO', `Fallback por placa: ${classificacoesGRM.length} carga(s) obtida(s) pra ${placasUnicas.length} placa(s) da fila.`);
    }

    for (const agendamento of fila) {
      // relista a cada iteração: abrir/fechar o modal e navegar re-renderiza a tabela
      // e invalida rowIndex/handles anteriores.
      const listaAtual = await listarAgendamentosPorCard(pageOuroSafra, agendamento.card);
      const atual = listaAtual.find((a) => a.id === agendamento.id);
      if (!atual) continue;
      await processarPlaca(pageOuroSafra, tokenGrmApi, atual, classificacoesGRM);
      if (disjuntorAcionado) {
        log('ERROR', '[DISJUNTOR] ciclo abortado — nenhuma outra placa será processada.');
        break;
      }
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
setTimeout(() => process.exit(1), KILL_SWITCH_MS);
