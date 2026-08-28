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
 *   2. No Ouro Safra, lista as placas em "Carregando" e, pra cada uma, abre o
 *      modal "Classificação - Agendamento #ID" e clica Salvar sem alterar
 *      nada — os campos (Empresa/Local/Classificadora/Produto) já vêm certos
 *      do próprio agendamento (confirmado com a usuária, 28/08/2026). Isso
 *      promove a placa pra "Aguardando Classificação".
 *   3. Lista as placas em "Aguardando Classificação" (inclui as recém-promovidas).
 *   4. Para cada placa, procura a correspondência no GRM em
 *      report/classification/loads, filtrando Cliente Nacional =
 *      OURO SAFRA INDUSTRIA E COMERCIO LTDA + Placa. Sem correspondência: pula
 *      (tenta de novo na próxima execução).
 *   5. Com a correspondência, preenche os 3 itens de classificação da Ouro
 *      Safra (Impureza = Matérias E. e Imp., Umidade = Umidade, Avariados =
 *      Avariado Total) com os valores do GRM.
 *   6. No GRM, abre a O.S. correspondente, localiza a carga da placa na lista
 *      "Cargas" e baixa o laudo (PDF).
 *   7. Volta no Ouro Safra e anexa o laudo (Upload Laudo) + salva.
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
 */

require('dotenv').config();
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

const CLIENTE_NACIONAL_GRM = 'OURO SAFRA INDUSTRIA E COMERCIO LTDA';
const EXEC_TABLE = 'ouro_safra_classificacao_execucoes';
const DIAS_BUSCA_GRM = Math.max(1, Number(process.env.OUROSAFRA_GRM_DIAS_BUSCA) || 3);

// Segue o mesmo padrão de segurança do único outro agente de escrita do
// repo (grm-sync-aplicar-distribuicao-os.js): --dry-run/DRY_RUN=true prepara
// tudo (acha a O.S., calcula os valores, baixa o laudo) mas não clica em
// salvar nem anexa; HEADLESS=false roda com o Chrome visível pra supervisão.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const HEADLESS = process.env.HEADLESS === 'false' ? false : true;

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
  await page.waitForFunction(
    (text, exact) => Array.from(document.querySelectorAll('button')).some((b) => {
      const t = (b.textContent || '').trim();
      return exact ? t === text : t.includes(text);
    }),
    { timeout },
    text,
    exact
  );
  const handle = await page.evaluateHandle((text, exact) => Array.from(document.querySelectorAll('button')).find((b) => {
    const t = (b.textContent || '').trim();
    return exact ? t === text : t.includes(text);
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

async function listarAgendamentosPorCard(page, label) {
  await page.goto('https://app.ourosafra.com.br/app/cdci', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2000);
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
  await page.evaluate((rowIndex) => {
    // Mesmo cuidado de listarAgendamentosPorCard: usa tHead/tBodies (API
    // nativa) em vez de querySelectorAll, que desceria pelas tabelas de
    // calendário aninhadas nos popups de filtro de cada coluna.
    const table = Array.from(document.querySelectorAll('table')).find((t) => Array.from(t.tHead?.rows[0]?.cells || []).some((th) => th.textContent.trim().toLowerCase().includes('placa')));
    const row = table?.tBodies[0]?.rows[rowIndex];
    const btn = row?.querySelector('td button, td a');
    if (!btn) throw new Error('Botão de ação não encontrado na linha');
    btn.click();
  }, rowIndex);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('*')).some((el) => (el.textContent || '').trim().startsWith('Classificação - Agendamento')),
    { timeout: 15000 }
  );
  await wait(500);
}

// "Carregando" → "Aguardando Classificação": o modal "Classificação -
// Agendamento #ID" já vem com Empresa/Local/Classificadora/Produto
// preenchidos pelo próprio agendamento — confirmado com a usuária que esses
// campos sempre vêm certos e só precisam ser salvos como estão (28/08/2026).
// Só depois de salvar essa confirmação é que a tabela de itens de
// classificação e o Upload Laudo ficam disponíveis (fluxo já tratado por
// preencherItensClassificacao/anexarLaudo).
async function promoverParaClassificacao(page, rowIndex) {
  await abrirAgendamento(page, rowIndex);
  await clickButtonByText(page, 'Salvar', { exact: true });
  await wait(1500);
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
  const temSalvar = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => (b.textContent || '').trim() === 'Salvar'));
  if (temSalvar) {
    await clickButtonByText(page, 'Salvar', { exact: true });
    await wait(1500);
  }
  log('SUCCESS', 'Laudo anexado');
}

// ---------------------------------------------------------------------------
// GRM — encontrar a classificação da placa (report/classification/loads)
// ---------------------------------------------------------------------------

// Todos os seletores abaixo (IDs e a classe .loadsReport-act-update) foram
// confirmados ao vivo em report/classification/loads em 28/08/2026 — os
// campos do GRM usam os mesmos nomes da API interna (clnCode, loaLicensePlate,
// loaDateFrom/loaDateTo etc.), consistente com o que grm-sync-cargas-geofence.js
// já usa no corpo do POST /api/reports/classification/loads.

async function setNativeInputValue(page, selector, valor) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.evaluate((selector, valor) => {
    const input = document.querySelector(selector);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, valor);
}

async function preencherClienteNacionalGRM(page, valorBusca) {
  // v-autocomplete: precisa de um clique REAL (Puppeteer/CDP) pra abrir o
  // menu — um clique disparado via page.evaluate (DOM sintético) não abre.
  await page.waitForSelector('#clnCode', { timeout: 15000 });
  await page.click('#clnCode');
  await wait(400);
  await page.keyboard.type(valorBusca, { delay: 30 });
  await page.waitForFunction(
    (valorBusca) => Array.from(document.querySelectorAll('[role="option"]')).some((el) => (el.textContent || '').toUpperCase().includes(valorBusca.toUpperCase())),
    { timeout: 10000 },
    valorBusca
  );
  await page.evaluate((valorBusca) => {
    const opt = Array.from(document.querySelectorAll('[role="option"]')).find((el) => (el.textContent || '').toUpperCase().includes(valorBusca.toUpperCase()));
    opt?.click();
  }, valorBusca);
  await wait(400);
}

async function buscarClassificacaoGRM(page, placa) {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - DIAS_BUSCA_GRM * 24 * 60 * 60 * 1000);
  await page.goto('https://www.grmserver.com.br/report/classification/loads', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(3000); // hidratação do app (Vue) — sem isso os inputs ainda não existem no DOM

  await preencherClienteNacionalGRM(page, CLIENTE_NACIONAL_GRM);
  await setNativeInputValue(page, '#loaLicensePlate', placa);

  // "Data de Classificação" só expõe #loaDateFrom/#loaDateTo depois de um
  // clique real no campo composto (.dr-field) — closed by default.
  await page.click('.dr-field');
  await wait(400);
  await setNativeInputValue(page, '#loaDateFrom', toBrDate(inicio));
  await setNativeInputValue(page, '#loaDateTo', toBrDate(hoje));

  // Sem estes 2 marcados, o relatório sai sem as colunas de Umidade/
  // Impureza/Avariados que a gente precisa.
  await page.evaluate(() => {
    ['joinCItems', 'addStaffInfo'].forEach((id) => {
      const cb = document.getElementById(id);
      if (cb && !cb.checked) cb.click();
    });
  });

  await page.waitForSelector('.loadsReport-act-update', { timeout: 15000 });
  await page.click('.loadsReport-act-update');
  await wait(2500);

  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return null;
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map((th) => th.textContent.trim().toUpperCase());
    const idx = (name) => headers.findIndex((h) => h.includes(name));
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (!rows.length) return null;
    const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent.trim());
    const get = (name) => {
      const i = idx(name);
      return i >= 0 ? cells[i] : null;
    };
    return {
      os: get('OS'),
      dataCadastro: get('DATA'),
      horaCadastro: get('HORA CAD'),
      umidade: get('UMIDADE'),
      materiasImp: get('MAT'),
      avariadoTotal: get('AVARIADO TOTAL'),
    };
  });
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

async function promoverPlaca(pageOuroSafra, agendamento) {
  const inicio = Date.now();
  try {
    if (DRY_RUN) {
      log('INFO', `[DRY-RUN] ${agendamento.placa} (agendamento ${agendamento.id}) seria promovida de Carregando para Aguardando Classificação — nada foi salvo.`);
      return;
    }
    await promoverParaClassificacao(pageOuroSafra, agendamento.rowIndex);
    log('SUCCESS', `${agendamento.placa} (agendamento ${agendamento.id}) promovida de Carregando para Aguardando Classificação (${Date.now() - inicio}ms)`);
  } catch (err) {
    log('ERROR', `${agendamento.placa} (agendamento ${agendamento.id}): falha ao promover de Carregando — ${String(err.message || err).slice(0, 500)}`);
  }
}

async function processarPlaca(pageOuroSafra, pageGRM, browserGRM, agendamento) {
  const inicio = Date.now();
  const registro = {
    agendamento_id: agendamento.id,
    placa: agendamento.placa,
    iniciado_em: new Date().toISOString(),
  };
  try {
    const grm = await buscarClassificacaoGRM(pageGRM, agendamento.placa);
    if (!grm || !grm.os) {
      log('INFO', `${agendamento.placa}: sem correspondência no GRM ainda, pulando.`);
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
    });

    const pageOuroSafra = await browser.newPage();
    if (HEADLESS) await pageOuroSafra.setViewport({ width: 1440, height: 900 });
    await loginOuroSafra(pageOuroSafra);

    const pageGRM = await browser.newPage();
    if (HEADLESS) await pageGRM.setViewport({ width: 1440, height: 900 });
    await loginGRM(pageGRM);

    const carregando = await listarAgendamentosCarregando(pageOuroSafra);
    log('INFO', `${carregando.length} placa(s) em "Carregando" aguardando confirmação`);

    for (const agendamento of carregando) {
      // relista a cada iteração pelo mesmo motivo do loop de classificação abaixo.
      const listaAtual = await listarAgendamentosCarregando(pageOuroSafra);
      const atual = listaAtual.find((a) => a.id === agendamento.id);
      if (!atual) continue;
      await promoverPlaca(pageOuroSafra, atual);
    }

    const pendentes = await listarAgendamentosPendentes(pageOuroSafra);
    log('INFO', `${pendentes.length} placa(s) aguardando classificação`);

    for (const agendamento of pendentes) {
      // relista a cada iteração: abrir/fechar o modal e navegar re-renderiza a tabela
      // e invalida rowIndex/handles anteriores.
      const listaAtual = await listarAgendamentosPendentes(pageOuroSafra);
      const atual = listaAtual.find((a) => a.id === agendamento.id);
      if (!atual) continue;
      await processarPlaca(pageOuroSafra, pageGRM, browser, atual);
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
