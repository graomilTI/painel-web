#!/usr/bin/env node
/*
 * Investigação pontual (não faz parte do fluxo automático): abrir a tela de
 * edição de uma O.S. já existente no GRM pra descobrir como localizar/abrir
 * o diálogo de edição e inspecionar o campo "Teste Aflatoxina" já preenchido
 * (O.S. 92531, GRAOMIL/Milho, criada com sorAflatoxinTest="S" errado — ver
 * TESTES_API_MAP em grmserver-abrir-os-api.js). NÃO clica em Salvar — só
 * abre, screenshota e loga o texto do diálogo. Uso:
 *   node descobrir-editar-os.js --sor 92531
 */

process.env.TMPDIR = process.env.TMPDIR || '/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMPDIR;
process.env.TMP = process.env.TMP || process.env.TMPDIR;

require('dotenv').config();

var puppeteer = require('puppeteer-extra');
var StealthPlugin = require('puppeteer-extra-plugin-stealth');
var fs = require('fs');
var path = require('path');
var os = require('os');

puppeteer.use(StealthPlugin());

var GRM_USER = process.env.GRMSERVER_USER;
var GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

function log(level, msg) { console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg); }
function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function instrumentarCapturaRede(page) {
  if (process.env.CAPTURE_NET !== 'true') return;
  page.on('request', function (req) {
    var method = req.method();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1 && /\/api\//.test(req.url())) {
      log('CAPTURE', 'REQ ' + method + ' ' + req.url() + ' :: ' + (req.postData() || ''));
    }
  });
  page.on('response', function (res) {
    var method = res.request().method();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1 && /\/api\//.test(res.url())) {
      res.text().then(function (body) {
        log('CAPTURE', 'RES ' + res.status() + ' ' + res.url() + ' :: ' + body.slice(0, 4000));
      }).catch(function () {});
    }
  });
}

async function clearAndType(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value, { delay: 20 });
}

async function login(page) {
  log('INFO', 'Iniciando login no GRM Server...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 30000 });
  await clearAndType(page, 'input#input-v-2', GRM_USER);
  await clearAndType(page, 'input#input-v-5', GRM_PASSWORD);
  await page.click('button.submit-btn');
  var ok = false;
  for (var i = 0; i < 45; i++) {
    await wait(1000);
    var url = page.url();
    if (!/\/login/.test(url)) { ok = true; break; }
  }
  if (!ok) throw new Error('Login não confirmado (ainda em /login após 45s).');
  log('SUCCESS', 'Login realizado.');
}

async function shot(page, name) {
  var dir = path.join(os.tmpdir(), 'grm-sync-abrir-os-debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var file = path.join(dir, name);
  await page.screenshot({ path: file, fullPage: true });
  log('DEBUG', 'Screenshot salvo em ' + file);
  return file;
}

async function lancarBrowser() {
  return puppeteer.launch({
    headless: process.env.GRM_HEADLESS === 'false' ? false : 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    dumpio: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    defaultViewport: { width: 1600, height: 2200 }
  });
}

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--sor') out.sor = argv[++i];
  }
  return out;
}

async function main() {
  var args = parseArgs(process.argv.slice(2));
  var sorCode = args.sor;
  if (!sorCode) throw new Error('Uso: node descobrir-editar-os.js --sor <numero>');
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('GRMSERVER_USER/GRMSERVER_PASSWORD ausentes no .env');

  var browser = await lancarBrowser();
  try {
    var page = await browser.newPage();
    instrumentarCapturaRede(page);
    await login(page);

    await page.goto('https://www.grmserver.com.br/operation/serviceOrder', { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    await shot(page, 'grid-lista-os.png');

    var info = await page.evaluate(function (numero) {
      function visivel(el) { return !!(el && el.getClientRects().length); }
      var candidatos = Array.from(document.querySelectorAll('tr, li, [role="row"]'));
      var alvo = candidatos.find(function (el) {
        return visivel(el) && el.textContent.indexOf(numero) !== -1;
      });
      if (!alvo) return { achou: false };
      var icones = Array.from(alvo.querySelectorAll('i[class*="mdi-"], button, [role="button"]')).map(function (el) {
        var r = el.getBoundingClientRect();
        return { classe: el.className, aria: el.getAttribute('aria-label') || '', x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }).filter(function (i) { return i.w > 0 && i.h > 0; });
      return { achou: true, htmlCompleto: alvo.outerHTML, icones: icones };
    }, String(sorCode));

    if (!info.achou) {
      log('ERROR', 'Não encontrei nenhuma linha contendo "' + sorCode + '" na grade. Pode precisar rolar/paginar/filtrar antes.');
      await shot(page, 'grid-nao-achou.png');
      return;
    }
    log('INFO', 'HTML completo da linha:\n' + info.htmlCompleto);
    log('INFO', 'Ícones/botões clicáveis na linha (' + info.icones.length + '):');
    info.icones.forEach(function (i, idx) {
      log('INFO', '  [' + idx + '] classe="' + i.classe + '" aria="' + i.aria + '" @ (' + Math.round(i.x) + ',' + Math.round(i.y) + ')');
    });
    log('INFO', 'Nenhum ícone de editar na linha (só checkbox + botão de mapa) — a edição parece ser: marcar o checkbox da linha + clicar no ícone de lápis da barra de ferramentas (topo). Testando isso agora (ainda sem salvar nada).');

    var alvo = await page.evaluate(function (numero) {
      var candidatos = Array.from(document.querySelectorAll('tr'));
      var linha = candidatos.find(function (el) { return el.textContent.indexOf(numero) !== -1; });
      if (!linha) return null;
      var checkbox = linha.querySelector('input[type="checkbox"]');
      var rc = checkbox.getBoundingClientRect();
      var lapis = document.querySelector('.v-toolbar button, .table-toolbar button, header button');
      // toolbar: primeiro botão da barra de ferramentas logo abaixo do título "ORDEM DE SERVIÇO"
      var botoesToolbar = Array.from(document.querySelectorAll('button')).filter(function (b) {
        var r = b.getBoundingClientRect();
        return r.y > 100 && r.y < 200 && r.x < 700 && r.width > 0;
      }).sort(function (a, b) { return a.getBoundingClientRect().x - b.getBoundingClientRect().x; });
      var primeiro = botoesToolbar[0];
      var rl = primeiro ? primeiro.getBoundingClientRect() : null;
      return {
        checkbox: { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 },
        editar: rl ? { x: rl.x + rl.width / 2, y: rl.y + rl.height / 2, classe: primeiro.className } : null,
        totalBotoesToolbar: botoesToolbar.length
      };
    }, String(sorCode));

    if (!alvo || !alvo.editar) { log('ERROR', 'Não consegui localizar o checkbox da linha e/ou o botão de editar na toolbar.'); return; }
    log('INFO', 'Checkbox em (' + Math.round(alvo.checkbox.x) + ',' + Math.round(alvo.checkbox.y) + '); botão editar (1º da toolbar, classe="' + alvo.editar.classe + '") em (' + Math.round(alvo.editar.x) + ',' + Math.round(alvo.editar.y) + '); total de botões na toolbar: ' + alvo.totalBotoesToolbar);

    await page.mouse.click(alvo.checkbox.x, alvo.checkbox.y);
    await wait(500);
    await shot(page, 'apos-marcar-checkbox.png');
    await page.mouse.click(alvo.editar.x, alvo.editar.y);
    await wait(2500);
    await shot(page, 'apos-clique-editar.png');

    var dialogInfo2 = await page.evaluate(function () {
      var overlays = Array.from(document.querySelectorAll('.v-overlay--active .v-card, .v-dialog .v-card'));
      var visivel = overlays.filter(function (el) { return el.getClientRects().length; });
      var dlg = visivel[visivel.length - 1];
      if (!dlg) return { aberto: false };
      return { aberto: true, texto: dlg.innerText };
    });
    if (!dialogInfo2.aberto) {
      log('WARN', 'Clique no ícone de editar não abriu diálogo. Veja apos-clique-editar.png.');
      return;
    }
    log('INFO', 'Diálogo aberto ao clicar no ícone de editar! Texto completo:\n' + dialogInfo2.texto);

    if (process.env.CONFIRMAR_SALVAR !== 'true') {
      log('INFO', 'CONFIRMAR_SALVAR != "true" — parando aqui, nada foi alterado nem salvo.');
      return;
    }

    async function selecionarOpcao(rotuloCampo, textoOpcao, nomeArquivo) {
      var campo = await page.evaluate(function (rotulo) {
        var inputs = Array.from(document.querySelectorAll('.v-input'));
        var alvo = inputs.find(function (el) { return el.textContent.indexOf(rotulo) !== -1; });
        if (!alvo) return null;
        var r = alvo.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, rotuloCampo);
      if (!campo) { log('ERROR', 'Não achei o campo "' + rotuloCampo + '".'); return false; }
      await page.mouse.click(campo.x, campo.y);
      await wait(800);
      var opcao = await page.evaluate(function (texto) {
        function visivel(el) { return !!(el && el.getClientRects().length); }
        var candidatos = Array.from(document.querySelectorAll('.v-overlay--active .v-list-item, .v-overlay-container .v-list-item, [role="option"]'));
        var alvo = candidatos.find(function (el) { return visivel(el) && el.textContent.trim() === texto; });
        if (!alvo) return null;
        var r = alvo.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, textoOpcao);
      if (!opcao) { log('ERROR', 'Não achei a opção "' + textoOpcao + '" pro campo "' + rotuloCampo + '".'); await shot(page, nomeArquivo + '-lista-nao-achada.png'); return false; }
      await page.mouse.click(opcao.x, opcao.y);
      await wait(1200);
      await shot(page, nomeArquivo + '.png');
      return true;
    }

    // Confirmado ao vivo (3 tentativas): selecionar "Tipo do Produto" E
    // "Teste Aflatoxina" na mesma passada não funciona em nenhuma ordem —
    // selecionar qualquer um dos dois reseta o outro de volta pro
    // padrão/vazio antes mesmo de clicar em Salvar (efeito colateral de algum
    // watcher/cascata compartilhado no diálogo). Por isso ETAPA=1 corrige só
    // "Tipo do Produto" e salva; depois de confirmado que colou, rode de novo
    // com ETAPA=2 pra mexer só em "Teste Aflatoxina".
    var etapa = process.env.ETAPA || '1';
    if (etapa === '1') {
      log('INFO', 'ETAPA=1: só "Tipo do Produto" = "Não Definido" (mesmo valor já salvo) — sem tocar em Aflatoxina.');
      if (!(await selecionarOpcao('Tipo do Produto', 'Não Definido', 'etapa1-tipo-produto'))) return;
    } else {
      log('INFO', 'ETAPA=2: só "Teste Aflatoxina" = "Qualitativo e Quantitativo" — sem tocar em Tipo do Produto.');
      if (!(await selecionarOpcao('Teste Aflatoxina', 'Qualitativo e Quantitativo', 'etapa2-aflatoxina'))) return;
    }

    var botaoSalvar = await page.evaluate(function () {
      var btn = Array.from(document.querySelectorAll('button')).find(function (b) { return b.textContent.trim().toUpperCase() === 'SALVAR'; });
      if (!btn) return null;
      var r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!botaoSalvar) { log('ERROR', 'Não achei o botão SALVAR.'); return; }

    log('INFO', '=== CLICANDO EM SALVAR AGORA — gravação real na O.S. ' + sorCode + ' ===');
    await page.mouse.click(botaoSalvar.x, botaoSalvar.y);
    await wait(3000);
    await shot(page, 'apos-salvar.png');

    var posSalvar = await page.evaluate(function () {
      var erro = document.body.innerText.indexOf('Campos Inválidos') !== -1;
      var dialogAindaAberto = !!document.querySelector('.v-overlay--active .v-card, .v-dialog .v-card');
      return { erro: erro, dialogAindaAberto: dialogAindaAberto };
    });
    if (posSalvar.erro) {
      log('ERROR', 'GRM recusou com "Campos Inválidos!" de novo — veja apos-salvar.png pra achar qual campo ficou vermelho.');
      return;
    }
    log('INFO', 'Sem erro de validação visível (diálogo ainda aberto: ' + posSalvar.dialogAindaAberto + '). Veja os logs [CAPTURE] acima pra achar o payload exato enviado (procure por serviceOrder/setRecord ou similar).');
  } finally {
    await browser.close();
  }
}

main().catch(function (err) { log('ERROR', String(err.stack || err)); process.exitCode = 1; });
