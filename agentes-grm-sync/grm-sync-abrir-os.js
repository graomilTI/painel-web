#!/usr/bin/env node
/*
 * GRM Server - Abertura automática de O.S. a partir do painel de Logística
 * (https://grao1000.com.br/painel/logistica-os#abertura_os)
 *
 * Fluxo (ver migration 20260725173000_logistica_abertura_os_aprovacao_agente.sql
 * e assets/js/logistica-abertura-os-workflow.js):
 *   Gestor solicita -> Operador de Logística decide (Ok/Corrigir/Recusar) ->
 *   Ok chama a RPC decidir_abertura_os, que grava status=APROVADO e insere um
 *   job agente_id='sync-abrir-os' em grm_sync_jobs -> o worker
 *   (worker/grm-sync-job-worker.js, já mapeado pra este arquivo) roda este
 *   script -> aqui abrimos a O.S. de verdade no GRM e devolvemos o número
 *   cadastrado para a tela (status=CADASTRADO, numero_os_cadastrada).
 *
 * IMPORTANTE - seletores do formulário "Nova O.S." NÃO foram confirmados ao
 * vivo (não há registro de nenhum agente anterior criando O.S. nesta tela,
 * só lendo/exportando — ver grm-sync-lista-os.js). Este script:
 *   1) tenta abrir o formulário por vários candidatos de botão/ícone;
 *   2) preenche cada campo por CASAMENTO DE RÓTULO (mesma técnica já validada
 *      ao vivo em grm-sync-lancar-nhe.js: procura o .v-input/.v-select/
 *      .v-autocomplete/.v-field cujo texto contém o rótulo) e decide na hora
 *      se o campo é autocomplete (abre lista -> seleciona opção) ou texto
 *      livre (digita e segue);
 *   3) roda em modo --discover (ou DISCOVER=true) para mapear e logar os
 *      rótulos/seletores reais achados na tela, SEM preencher nada — use
 *      esse modo primeiro após o deploy pra confirmar/ajustar LABEL_MAP e os
 *      candidatos de botão abaixo, antes de deixar o job-worker rodar isto
 *      de verdade.
 */

process.env.TMPDIR = process.env.TMPDIR || '/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMPDIR;
process.env.TMP = process.env.TMP || process.env.TMPDIR;

require('dotenv').config();

var puppeteer = require('puppeteer-extra');
var StealthPlugin = require('puppeteer-extra-plugin-stealth');
var WebSocket = require('ws');
var fs = require('fs');
var path = require('path');
var os = require('os');
var createClient = require('@supabase/supabase-js').createClient;

puppeteer.use(StealthPlugin());

var SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
var GRM_USER = process.env.GRMSERVER_USER;
var GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;
var DEBUG = String(process.env.GRM_DEBUG || '').toLowerCase() === 'true';
var DRY_RUN = String(process.env.ABERTURA_OS_DRY_RUN || '').toLowerCase() === 'true';
var MAX_TENTATIVAS = Number(process.env.ABERTURA_OS_MAX_TENTATIVAS || 3);

var TABLE_SOLICITACOES = 'logistica_abertura_os';
var TABLE_EXECUCOES = 'grm_abertura_os_execucoes';

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
  auth: { persistSession: false, autoRefreshToken: false }
});

var browserAtual = null;

function log(level, msg) {
  console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg);
}

function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function assertConfig() {
  var missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
  if (!GRM_USER) missing.push('GRMSERVER_USER');
  if (!GRM_PASSWORD) missing.push('GRMSERVER_PASSWORD');
  if (missing.length) throw new Error('Variáveis ausentes: ' + missing.join(', '));
}

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--discover') out.discover = true;
    else if (argv[i] === '--debug') out.debug = true;
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--id') out.id = argv[++i];
  }
  return out;
}

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/* ---------------------------------------------------------------------- *
 * Mapa campo Supabase -> rótulos candidatos no formulário do GRM.
 *
 * Confirmado ao vivo em 03/08 via node grm-sync-abrir-os.js --discover
 * (rótulos reais dos 82 elementos .v-input/.v-field do diálogo "ADICIONAR
 * ORDEM DE SERVIÇO", logada como graomil.juliana@gmail.com):
 *   Cliente Nacional | Cliente Regional | Cliente Final
 *   Dados do Cliente (colapsável)
 *   DETALHES DA ORDEM DE SERVIÇO: Data da Solicitação | Contrato | Número
 *     Lote | Serviço · Tipo do Embarque | Tamanho do Lote (Ton) | Tipo do
 *     Transporte · Habilitar OCC? | Bloquear ao Completar Lote? | Habilitar
 *     Módulo Integra? | Solicitar Dados do Motorista? · Arquivos Adicionais ·
 *     Transportadora(s) trabalhando na O.S. · Outras Informações
 *   DADOS DO EMBARQUE: Tipo do Local | UF | Cidade · Local do Serviço (+) |
 *     Supervisão · Produtor (+) | Inscrição Estadual · Desabilitar Bloqueio
 *     de Distância?
 *   DADOS DE DESTINO: UF de Destino | Cidade de Destino | Destino (+)
 *   PRODUTO E TESTES: Produto | Tipo do Produto | Perm. Alteração T. Prod.? ·
 *     Teste Aflatoxina | Teste Intacta | Teste Soja GMO Free · Teste
 *     Vomitoxina | Teste Falling Number | Teste Falling Number (nº)
 *   ITENS DE CLASSIFICAÇÃO: Permitir Insetos Vivos/Mortos, Odor Estranho,
 *     Sementes Tóxicas
 *
 * NÃO existe campo "Troca de Notas" nesse formulário (confirmado — não está
 * nos 82 campos listados pelo --discover) — essa informação vai dentro do
 * campo livre "Outras Informações" (ver preencherFormulario), não tem
 * entrada própria no LABEL_MAP.
 *
 * "Cliente Nacional"/"Cliente Final" e não "Contratante"/"Filial" — mapeado
 * conferindo com os rótulos que a função logistica-os-autopreencher (OCR/IA
 * do upload, mesma tela) já usa pra extrair pro mesmo par de colunas:
 * contratante_cliente casa com "Cliente nacional" e filial_pagadora casa com
 * "Cliente final" (ver supabase/functions/logistica-os-autopreencher).
 * "Cliente Regional" não tem coluna equivalente no painel — fica em branco.
 * Campos de toggle (Habilitar OCC?, Teste Aflatoxina, etc.) não são tocados
 * por este agente — ficam no padrão que o GRM já preenche.
 *
 * RISCO AINDA NÃO CONFIRMADO AO VIVO: no --discover, Cliente Final, Cidade,
 * Local do Serviço, Supervisão e Produtor apareceram com a classe
 * v-input--disabled (mesmo padrão de cascata do modal Adicionar NHE em
 * grm-sync-lancar-nhe.js — um campo pai libera o(s) filho(s)). A ordem
 * abaixo tenta Local do Serviço ANTES de Cidade/Supervisão/Produtor
 * (aposta: selecionar o Local já popula os demais); se um campo continuar
 * desabilitado no momento de preencher, preencherCampo detecta isso e pula
 * com WARN em vez de tentar digitar — não quebra o agente, só deixa esse
 * campo em branco na O.S. criada.
 * ---------------------------------------------------------------------- */
var LABEL_MAP = [
  { campo: 'contratante_cliente', labels: ['CLIENTE NACIONAL'] },
  { campo: 'filial_pagadora', labels: ['CLIENTE FINAL'] },
  { campo: 'numero_contrato', labels: ['CONTRATO'] },
  { campo: 'servico', labels: ['SERVICO'] },
  { campo: 'volume_inicial', labels: ['TAMANHO DO LOTE'] },
  { campo: 'armazem_embarque', labels: ['LOCAL DO SERVICO'] },
  { campo: 'cidade_embarque', labels: ['CIDADE'] },
  { campo: 'regional', labels: ['SUPERVISAO'] },
  { campo: 'produtor', labels: ['PRODUTOR'] },
  { campo: 'cidade_destino', labels: ['CIDADE DE DESTINO'] },
  { campo: 'local_destino', labels: ['DESTINO'] },
  { campo: 'produto', labels: ['PRODUTO'] },
  { campo: 'tipo_produto', labels: ['TIPO DO PRODUTO'] }
];

// Botão "Adicionar" (tooltip confirmado ao vivo) — ícone "+" no canto direito
// da MESMA barra de ferramentas do campo "Filtrar Pesquisa" (selector já
// usado em grm-sync-lista-os.js), depois da lupa e do filtro. Usar essa
// referência de vizinhança é mais robusto do que adivinhar a classe do botão
// (não confirmada ao vivo).
var BOTAO_NOVA_OS_CLASSES = [
  '.serviceOrder-act-add', '.serviceOrder-act-new', '.serviceOrder-act-nova', '.serviceOrder-act-cadastrar'
];
var BOTAO_NOVA_OS_TEXTOS = ['NOVA O.S', 'NOVA ORDEM', 'ADICIONAR', 'CADASTRAR O.S', '+ O.S', 'NOVO'];

/* ---------------------------------------------------------------------- *
 * Puppeteer: login (mesmo padrão de todos os outros agentes deste repo)
 * ---------------------------------------------------------------------- */

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
    if (page.url().indexOf('/login') === -1) { ok = true; break; }
  }
  if (!ok) throw new Error('Login falhou: página não saiu de /login após 45s.');
  log('SUCCESS', 'Login realizado');
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value), { delay: 20 });
  await page.evaluate(function (payload) {
    var input = document.querySelector(payload.selector);
    if (!input) return;
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(input, payload.value); else input.value = payload.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector: selector, value: String(value) });
}

async function shot(page, name) {
  try {
    var dir = process.env.GRM_DEBUG_DIR || path.join(os.tmpdir(), 'grm-sync-abrir-os-debug');
    fs.mkdirSync(dir, { recursive: true });
    var p = path.join(dir, name);
    await page.screenshot({ path: p, fullPage: true });
    log('DEBUG', 'Screenshot salvo em ' + p);
  } catch (e) { /* debug apenas, nunca derruba o fluxo */ }
}

/* ---------------------------------------------------------------------- *
 * Abrir o diálogo "Nova O.S."
 * ---------------------------------------------------------------------- */

// Vuetify 3 usa a MESMA classe .v-overlay--active pra tooltip E pra diálogo
// (confirmado ao vivo 03/08: passar o mouse por cima de um ícone da barra já
// deixa o tooltip dele com essa classe, o que dava falso positivo em "abriu
// diálogo"). Só conta como aberto um overlay que pareça de fato um
// formulário (vários campos), não qualquer overlay ativo.
function overlayFormularioAtivo(page) {
  return page.evaluate(function () {
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    return overlays.some(function (o) { return o.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field').length > 3; });
  });
}

async function esperarFormulario(page, timeout) {
  return page.waitForFunction(function () {
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    return overlays.some(function (o) { return o.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field').length > 3; });
  }, { timeout: timeout || 2500 }).then(function () { return true; }).catch(function () { return false; });
}

async function fecharOverlaysTransitorios(page) {
  await page.keyboard.press('Escape').catch(function () {});
  await wait(300);
}

// Em vez de adivinhar QUAL botão da barra é o "+", tenta cada um (da direita
// pra esquerda, já que visualmente o "+" fica por último) e só considera
// sucesso se abrir de fato um overlay com formulário — clique errado num
// ícone vizinho (ex.: lupa de Pesquisar) não engana mais esse teste.
async function tentarBotoesToolbar(page) {
  var botoes = await page.evaluate(function () {
    var input = document.querySelector('input[placeholder="Filtrar Pesquisa"]');
    if (!input) return [];
    var toolbar = input.closest('div');
    for (var i = 0; i < 4 && toolbar; i++) {
      var lista = Array.from(toolbar.querySelectorAll('button')).filter(function (b) {
        return !b.disabled && b.getAttribute('aria-disabled') !== 'true';
      });
      if (lista.length) {
        return lista.map(function (b) {
          var r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, texto: (b.innerText || b.getAttribute('aria-label') || '').trim() };
        });
      }
      toolbar = toolbar.parentElement;
    }
    return [];
  });
  if (!botoes.length) { log('WARN', 'Nenhum botão encontrado na barra do campo Filtrar Pesquisa.'); return false; }
  log('INFO', botoes.length + ' botão(ões) na barra do Filtrar Pesquisa — testando um a um (da direita pra esquerda).');

  for (var i = botoes.length - 1; i >= 0; i--) {
    var b = botoes[i];
    await page.mouse.click(b.x, b.y);
    var abriu = await esperarFormulario(page, 2500);
    if (abriu) { log('INFO', 'Formulário aberto no botão de índice ' + i + ' da barra (texto/aria-label: "' + b.texto + '").'); return true; }
    await fecharOverlaysTransitorios(page);
  }
  return false;
}

async function abrirDialogoNovaOs(page) {
  await page.goto('https://www.grmserver.com.br/operation/serviceOrder', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2500);

  if (await tentarBotoesToolbar(page)) { await wait(500); return true; }
  log('WARN', 'Nenhum botão da barra abriu o formulário — tentando fallbacks (classes/texto/ícone).');

  for (var i = 0; i < BOTAO_NOVA_OS_CLASSES.length; i++) {
    var boxClasse = await page.evaluate(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var btn = el.tagName === 'BUTTON' ? el : el.querySelector('button') || el;
      var r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, BOTAO_NOVA_OS_CLASSES[i]);
    if (boxClasse) {
      await page.mouse.click(boxClasse.x, boxClasse.y);
      if (await esperarFormulario(page, 2500)) { log('INFO', 'Botão "Nova O.S." aberto via classe ' + BOTAO_NOVA_OS_CLASSES[i]); await wait(500); return true; }
      await fecharOverlaysTransitorios(page);
    }
  }

  var boxTexto = await page.evaluate(function (textos) {
    function normJs(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
    var candidatos = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (var t = 0; t < textos.length; t++) {
      var alvo = textos[t];
      var el = candidatos.find(function (c) {
        if (c.disabled || c.getAttribute('aria-disabled') === 'true') return false;
        var texto = normJs(c.innerText || c.textContent || c.getAttribute('aria-label') || '');
        return texto.indexOf(alvo) !== -1;
      });
      if (el) { var r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, via: alvo }; }
    }
    // Último recurso: botão flutuante com ícone "+" (mdi-plus / lord-icon "plus"/"add").
    var fab = candidatos.find(function (c) {
      if (c.disabled || c.getAttribute('aria-disabled') === 'true') return false;
      return !!c.querySelector('.mdi-plus, lord-icon[src*="plus"], lord-icon[src*="add"]');
    });
    if (fab) { var rf = fab.getBoundingClientRect(); return { x: rf.x + rf.width / 2, y: rf.y + rf.height / 2, via: 'icone +' }; }
    return null;
  }, BOTAO_NOVA_OS_TEXTOS);

  if (!boxTexto) return false;
  await page.mouse.click(boxTexto.x, boxTexto.y);
  if (!(await esperarFormulario(page, 2500))) return false;
  log('INFO', 'Botão "Nova O.S." aberto via fallback texto/ícone (' + boxTexto.via + ')');
  await wait(500);
  return true;
}

function findDialog(page) {
  return overlayFormularioAtivo(page);
}

/* ---------------------------------------------------------------------- *
 * Modo --discover: só mapeia o formulário, não preenche nada.
 * ---------------------------------------------------------------------- */

async function descobrirCampos(page) {
  var info = await page.evaluate(function () {
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active')).reverse();
    var dialog = overlays[0];
    if (!dialog) return { dialogAberto: false };
    var fields = Array.from(dialog.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field'));
    return {
      dialogAberto: true,
      dialogTexto: (dialog.innerText || '').slice(0, 4000),
      campos: fields.map(function (f) {
        return {
          texto: (f.innerText || '').trim().slice(0, 120),
          temInput: !!f.querySelector('input'),
          temTextarea: !!f.querySelector('textarea'),
          classes: f.className
        };
      })
    };
  });
  return info;
}

/* ---------------------------------------------------------------------- *
 * Preenchimento genérico por rótulo — decide autocomplete x texto livre na
 * hora, sem precisar saber de antemão qual é qual (não confirmado ao vivo).
 * ---------------------------------------------------------------------- */

// Rótulos curtos se repetem em mais de uma seção do formulário (ex.: "Destino"
// vs. "UF de Destino"/"Cidade de Destino"; "Cidade" vs. "Cidade de Destino") —
// por isso tenta IGUALDADE exata do texto do campo primeiro (elimina essas
// colisões, já que o texto de um .v-input vazio é só o rótulo) e só cai pra
// substring se nenhum campo bater exatamente.
async function localizarCampoBox(page, labels) {
  return page.evaluate(function (labels) {
    function normJs(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = overlays[overlays.length - 1];
    if (!dialog) return null;
    var fields = Array.from(dialog.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field'));
    function isDisabled(f) {
      return f.className.indexOf('--disabled') !== -1 || !!(f.querySelector('input') || {}).disabled;
    }
    for (var i = 0; i < labels.length; i++) {
      var alvo = labels[i];
      var f = fields.find(function (field) { return normJs(field.innerText || '') === alvo; });
      if (f) {
        var r = f.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: labels[i], disabled: isDisabled(f) };
      }
    }
    for (var j = 0; j < labels.length; j++) {
      var alvo2 = labels[j];
      var f2 = fields.find(function (field) { return normJs(field.innerText || '').indexOf(alvo2) !== -1; });
      if (f2) {
        var r2 = f2.getBoundingClientRect();
        return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2, label: labels[j], disabled: isDisabled(f2) };
      }
    }
    return null;
  }, labels);
}

async function selecionarOpcaoAberta(page, alvo, modo) {
  await wait(700);
  var clicked = await page.evaluate(function (payload) {
    function normJs(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
    var alvoNorm = normJs(payload.alvo);
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    for (var i = overlays.length - 1; i >= 0; i--) {
      var options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
      if (!options.length) continue;
      for (var j = 0; j < options.length; j++) {
        var textoOriginal = (options[j].innerText || options[j].textContent || '').trim();
        if (!textoOriginal) continue;
        var texto = normJs(textoOriginal);
        var bate = false;
        if (payload.modo === 'exata') bate = texto === alvoNorm;
        else bate = alvoNorm.length > 0 && (texto.indexOf(alvoNorm) !== -1 || alvoNorm.indexOf(texto) !== -1);
        if (bate) { options[j].click(); return textoOriginal; }
      }
    }
    return null;
  }, { alvo: alvo || '', modo: modo || 'substring' });
  return clicked;
}

function formatarValor(campo, valor) {
  if (valor === null || valor === undefined) return '';
  if (campo === 'volume_inicial') {
    var n = Number(valor);
    if (!isFinite(n)) return String(valor);
    // Placeholder do campo "Tamanho do Lote" mostra 3 casas decimais (0,000 Ton).
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
  return String(valor);
}

// Preenche 1 campo: clique real no box (abre autocomplete se houver), digita
// o valor, espera curto por um overlay de opções; se aparecer, seleciona a
// mais parecida (ou a única, se digitar não filtrar por texto igual);
// se não aparecer nada, assume campo de texto livre — o valor já foi
// digitado, então segue.
async function preencherCampo(page, campo, labels, valorBruto) {
  var valor = formatarValor(campo, valorBruto);
  if (!valor) { log('INFO', 'Campo "' + campo + '": sem valor, pulando.'); return; }

  var box = await localizarCampoBox(page, labels);
  if (!box) { log('WARN', 'Campo "' + campo + '" (rótulos: ' + labels.join(' / ') + ') não encontrado no formulário — verifique LABEL_MAP com --discover.'); return; }
  if (box.disabled) { log('WARN', 'Campo "' + campo + '" ("' + box.label + '") está desabilitado (provável cascata — depende de outro campo escolhido antes) — pulando, a O.S. ficará sem esse valor.'); return; }

  await page.mouse.click(box.x, box.y);
  await wait(400);

  // Acha o <input> de fato sob o PONTO já clicado (box.x/box.y), não
  // reabrindo a busca por rótulo — rótulos curtos (ex.: "Cidade", "Destino")
  // colidem por substring com outros campos ("Cidade de Destino"), então
  // reusar as coordenadas exatas evita digitar no campo errado. Não confiar
  // em document.activeElement — técnica já validada em grm-sync-lancar-nhe.js.
  var digitou = await page.evaluate(function (payload) {
    var el = document.elementFromPoint(payload.x, payload.y);
    var field = el && el.closest('.v-input, .v-select, .v-autocomplete, .v-field');
    var input = field && (field.querySelector('input') || field.querySelector('textarea'));
    if (!input) return false;
    input.focus();
    return true;
  }, { x: box.x, y: box.y });

  if (digitou) {
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(valor, { delay: 25 });
  }

  await wait(700);
  var opcaoAberta = await page.evaluate(function () {
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    return overlays.some(function (o) { return o.querySelectorAll('[role="option"], .v-list-item').length > 0; });
  });

  if (opcaoAberta) {
    var escolhida = await selecionarOpcaoAberta(page, valor, 'substring');
    if (!escolhida) {
      log('WARN', 'Campo "' + campo + '": lista de opções abriu mas nenhuma bateu com "' + valor + '" — fechando lista e seguindo com o texto digitado.');
      await page.keyboard.press('Escape');
    } else {
      log('INFO', 'Campo "' + campo + '" selecionado: ' + escolhida);
    }
  } else {
    log('INFO', 'Campo "' + campo + '" preenchido como texto livre: ' + valor);
  }
}

// Mapa logistica_abertura_os.testes.opcoes -> campo/opção do GRM. Os RÓTULOS
// dos campos (ex.: "Teste Aflatoxina") foram confirmados ao vivo via
// --discover (todos vieram v-input--disabled no diálogo vazio — mesma
// cascata dos outros campos condicionais; só destravam depois de Produto
// selecionado, por isso esta função roda DEPOIS do loop do LABEL_MAP). Já o
// TEXTO das opções dentro de cada dropdown (ex.: se é "Qualitativo" mesmo,
// ou se Intacta/GMO Free/Vomitoxina usam "Sim"/"Realizar"/outro texto) NÃO
// foi confirmado — ajustar aqui depois de abrir um desses campos ao vivo.
var TESTES_GRM_MAP = {
  AFLATOXINA_QUALITATIVO: { campo: ['TESTE AFLATOXINA'], opcaoExata: 'Qualitativo' },
  AFLATOXINA_QUANTITATIVO: { campo: ['TESTE AFLATOXINA'], opcaoExata: 'Quantitativo' },
  AFLATOXINA_QUALI_QUANTI: { campo: ['TESTE AFLATOXINA'], opcaoExata: 'Qualitativo e Quantitativo' },
  INTACTA: { campo: ['TESTE INTACTA'], opcaoSubstring: ['SIM', 'REALIZAR', 'INTACTA'] },
  GMO_FREE: { campo: ['TESTE SOJA GMO FREE'], opcaoSubstring: ['SIM', 'REALIZAR', 'GMO'] },
  VOMITOXINA: { campo: ['TESTE VOMITOXINA'], opcaoSubstring: ['SIM', 'REALIZAR', 'VOMITOXINA'] },
};

async function preencherTestes(page, solicitacao) {
  var opcoes = (solicitacao.testes && Array.isArray(solicitacao.testes.opcoes)) ? solicitacao.testes.opcoes : [];
  for (var i = 0; i < opcoes.length; i++) {
    var key = opcoes[i];
    var mapa = TESTES_GRM_MAP[key];
    if (!mapa) { log('WARN', 'Teste "' + key + '" sem mapeamento pro campo do GRM — pulando.'); continue; }

    var box = await localizarCampoBox(page, mapa.campo);
    if (!box) { log('WARN', 'Campo do teste "' + key + '" (' + mapa.campo.join('/') + ') não encontrado no formulário.'); continue; }
    if (box.disabled) { log('WARN', 'Campo do teste "' + key + '" está desabilitado — pulando (confira se Produto foi selecionado antes).'); continue; }

    await page.mouse.click(box.x, box.y);
    var escolhida = null;
    if (mapa.opcaoExata) {
      escolhida = await selecionarOpcaoAberta(page, mapa.opcaoExata, 'exata');
    } else {
      for (var s = 0; s < mapa.opcaoSubstring.length && !escolhida; s++) {
        escolhida = await selecionarOpcaoAberta(page, mapa.opcaoSubstring[s], 'substring');
      }
    }
    if (!escolhida) {
      log('WARN', 'Não achei opção pro teste "' + key + '" no dropdown "' + mapa.campo[0] + '" — texto das opções não confirmado ao vivo, ajuste TESTES_GRM_MAP.');
      await page.keyboard.press('Escape').catch(function () {});
      continue;
    }
    log('INFO', 'Teste "' + key + '" selecionado: ' + escolhida);
  }
}

async function preencherFormulario(page, solicitacao) {
  for (var i = 0; i < LABEL_MAP.length; i++) {
    var item = LABEL_MAP[i];
    await preencherCampo(page, item.campo, item.labels, solicitacao[item.campo]);
  }
  await preencherTestes(page, solicitacao);
  // Não existe campo próprio de "Troca de Notas" neste formulário (confirmado
  // via --discover) — registra a informação no campo livre "Outras Informações".
  if (solicitacao.troca_notas) {
    await preencherCampo(page, 'troca_notas', ['OUTRAS INFORMACOES'], 'Troca de notas: ' + solicitacao.troca_notas);
  }
}

/* ---------------------------------------------------------------------- *
 * Salvar e capturar o número da O.S. gerada
 * ---------------------------------------------------------------------- */

function extrairNumeroDoTexto(texto) {
  if (!texto) return null;
  var m = String(texto).match(/(\d{4,})/);
  return m ? m[1] : null;
}

async function salvarECapturarNumero(page) {
  var salvo = await page.evaluate(function () {
    function normJs(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = overlays[overlays.length - 1];
    if (!dialog) return false;
    var btn = Array.from(dialog.querySelectorAll('button')).find(function (b) {
      var t = normJs(b.innerText || '');
      return t.indexOf('SALVAR') !== -1 || t.indexOf('CADASTRAR') !== -1 || t.indexOf('CONFIRMAR') !== -1;
    });
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!salvo) throw new Error('Botão "Salvar" não encontrado (ou desabilitado) no formulário de Nova O.S.');

  // 1ª tentativa: snackbar/toast de confirmação costuma trazer o número.
  var numero = null;
  for (var i = 0; i < 10 && !numero; i++) {
    await wait(500);
    var texto = await page.evaluate(function () {
      var el = document.querySelector('.v-snackbar__content, .v-alert__content, .v-snackbar.v-snackbar--active');
      return el ? el.innerText : null;
    });
    numero = extrairNumeroDoTexto(texto);
  }

  // 2ª tentativa: o próprio diálogo (se ainda aberto) pode ter passado a
  // mostrar um campo "Número da O.S." / "O.S. nº" preenchido pelo servidor.
  if (!numero) {
    var textoDialogo = await page.evaluate(function () {
      var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
      var dialog = overlays[overlays.length - 1];
      return dialog ? dialog.innerText : null;
    });
    if (textoDialogo && /O\.?S\.?\s*n[ºo°]?/i.test(textoDialogo)) {
      var m = textoDialogo.match(/O\.?S\.?\s*n[ºo°]?\s*[:\-]?\s*(\d{4,})/i);
      if (m) numero = m[1];
    }
  }

  // 3ª tentativa: após o diálogo fechar, a grade deve ter uma nova linha no
  // topo — primeira célula numérica da 1ª linha da tabela.
  if (!numero) {
    await wait(2500);
    numero = await page.evaluate(function () {
      var row = document.querySelector('table tbody tr');
      if (!row) return null;
      var cell = Array.from(row.querySelectorAll('td')).find(function (td) { return /^\d{4,}$/.test((td.textContent || '').trim()); });
      return cell ? cell.textContent.trim() : null;
    });
  }

  if (!numero) throw new Error('O.S. pode ter sido criada, mas não consegui capturar o número gerado (nenhuma estratégia de leitura funcionou). Rode --discover / --debug para ajustar salvarECapturarNumero.');
  return numero;
}

async function cancelarDialogo(page) {
  try {
    await page.evaluate(function () {
      function normJs(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
      var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
      var dialog = overlays[overlays.length - 1];
      if (!dialog) return;
      var btn = Array.from(dialog.querySelectorAll('button')).find(function (b) { return normJs(b.innerText || '').indexOf('CANCELAR') !== -1; })
        || dialog.querySelector('button.v-btn[aria-label="Close"], .mdi-close');
      if (btn) (btn.closest('button') || btn).click();
    });
    await page.keyboard.press('Escape');
    await wait(500);
  } catch (e) { /* best-effort */ }
}

/* ---------------------------------------------------------------------- *
 * Persistência (logistica_abertura_os + grm_abertura_os_execucoes)
 * ---------------------------------------------------------------------- */

async function buscarAprovadas(idFiltro) {
  var query = supabase.from(TABLE_SOLICITACOES).select('*').eq('status', 'APROVADO').order('created_at', { ascending: true });
  if (idFiltro) query = supabase.from(TABLE_SOLICITACOES).select('*').eq('id', idFiltro);
  var result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

async function marcarProcessando(id, tentativaAtual) {
  var result = await supabase.from(TABLE_SOLICITACOES).update({
    status: 'PROCESSANDO',
    processamento_iniciado_em: new Date().toISOString(),
    processamento_finalizado_em: null,
    erro_agente: null,
    tentativas_agente: tentativaAtual,
    updated_at: new Date().toISOString()
  }).eq('id', id).eq('status', 'APROVADO').select('id');
  if (result.error) throw result.error;
  return (result.data || []).length > 0;
}

async function marcarCadastrada(id, numeroOs) {
  var result = await supabase.from(TABLE_SOLICITACOES).update({
    status: 'CADASTRADO',
    numero_os_cadastrada: numeroOs,
    cadastrado_em: new Date().toISOString(),
    processamento_finalizado_em: new Date().toISOString(),
    erro_agente: null,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (result.error) throw result.error;
}

async function marcarErro(id, mensagem) {
  var result = await supabase.from(TABLE_SOLICITACOES).update({
    status: 'ERRO',
    erro_agente: String(mensagem || '').slice(0, 2000),
    processamento_finalizado_em: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (result.error) log('WARN', 'Falha ao marcar ERRO em ' + id + ': ' + result.error.message);
}

async function criarExecucao(aberturaOsId, dryRun) {
  var result = await supabase.from(TABLE_EXECUCOES).insert({
    abertura_os_id: aberturaOsId,
    status: 'INICIADA',
    dry_run: !!dryRun
  }).select('id').single();
  if (result.error) { log('WARN', 'Não consegui criar execução: ' + result.error.message); return null; }
  return result.data ? result.data.id : null;
}

async function finalizarExecucao(execucaoId, patch) {
  if (!execucaoId) return;
  patch.finalizado_em = new Date().toISOString();
  var result = await supabase.from(TABLE_EXECUCOES).update(patch).eq('id', execucaoId);
  if (result.error) log('WARN', 'Falha ao finalizar execução: ' + result.error.message);
}

/* ---------------------------------------------------------------------- *
 * Processamento de 1 solicitação
 * ---------------------------------------------------------------------- */

async function processarSolicitacao(page, solicitacao, dryRun, debug) {
  var id = solicitacao.id;
  var tentativa = Number(solicitacao.tentativas_agente || 0) + 1;

  if (tentativa > MAX_TENTATIVAS) {
    await marcarErro(id, 'Número máximo de tentativas (' + MAX_TENTATIVAS + ') excedido — revise manualmente e reenvie.');
    log('ERROR', 'Solicitação ' + id + ': tentativas esgotadas.');
    return;
  }

  var podeProcessar = await marcarProcessando(id, tentativa);
  if (!podeProcessar) { log('WARN', 'Solicitação ' + id + ' não está mais em APROVADO (outro processo já tratou) — pulando.'); return; }

  var execucaoId = await criarExecucao(id, dryRun);
  log('INFO', 'Processando solicitação ' + id + ' (tentativa ' + tentativa + '/' + MAX_TENTATIVAS + ')...');

  try {
    var aberto = await abrirDialogoNovaOs(page);
    if (!aberto) throw new Error('Botão "Nova O.S." não encontrado na tela /operation/serviceOrder — ajuste BOTAO_NOVA_OS_CLASSES/TEXTOS após rodar --discover.');

    var dialogOk = await findDialog(page);
    if (!dialogOk) throw new Error('Diálogo de Nova O.S. não abriu após o clique.');

    await preencherFormulario(page, solicitacao);
    if (debug) await shot(page, 'solicitacao-' + id + '-form-preenchido.png');

    if (dryRun) {
      log('INFO', 'DRY-RUN: formulário preenchido, cancelando em vez de salvar.');
      await cancelarDialogo(page);
      await finalizarExecucao(execucaoId, { status: 'DRY_RUN_OK', mensagem: 'Formulário preenchido e cancelado (dry-run).' });
      // Em dry-run devolve a solicitação pro estado anterior (APROVADO) pra
      // não ficar presa em PROCESSANDO sem nunca virar CADASTRADO de verdade.
      await supabase.from(TABLE_SOLICITACOES).update({ status: 'APROVADO', processamento_iniciado_em: null, updated_at: new Date().toISOString() }).eq('id', id);
      return;
    }

    var numeroOs = await salvarECapturarNumero(page);
    await marcarCadastrada(id, numeroOs);
    await finalizarExecucao(execucaoId, { status: 'SUCESSO', numero_os: numeroOs });
    log('SUCCESS', 'Solicitação ' + id + ': O.S. ' + numeroOs + ' cadastrada no GRM.');
  } catch (error) {
    var msg = String(error.message || error);
    log('ERROR', 'Solicitação ' + id + ': ' + msg);
    if (debug) await shot(page, 'solicitacao-' + id + '-erro.png');
    await marcarErro(id, msg);
    await finalizarExecucao(execucaoId, { status: 'ERRO', mensagem: msg.slice(0, 2000) });
    await cancelarDialogo(page);
  }
}

/* ---------------------------------------------------------------------- *
 * Main
 * ---------------------------------------------------------------------- */

async function lancarBrowser() {
  return puppeteer.launch({
    headless: process.env.GRM_HEADLESS === 'new' ? 'new' : true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    dumpio: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-software-rasterizer', '--disable-extensions', '--disable-background-networking',
      '--disable-default-apps', '--disable-sync', '--metrics-recording-only', '--mute-audio',
      '--no-first-run', '--no-default-browser-check',
      '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials'
    ],
    defaultViewport: { width: 1600, height: 900 }
  });
}

async function rodarDiscover(debug) {
  log('INFO', '=== Modo --discover: mapeando formulário de Nova O.S. (nada é salvo) ===');
  var browser = await lancarBrowser();
  browserAtual = browser;
  try {
    var page = await browser.newPage();
    await login(page);
    var aberto = await abrirDialogoNovaOs(page);
    if (!aberto) {
      log('ERROR', 'Não encontrei nenhum botão de "Nova O.S." na tela. Ajuste BOTAO_NOVA_OS_CLASSES/TEXTOS.');
      if (debug) await shot(page, 'discover-sem-botao.png');
      return;
    }
    var info = await descobrirCampos(page);
    if (debug) await shot(page, 'discover-dialogo-aberto.png');
    if (!info.dialogAberto) { log('ERROR', 'Clique no botão não abriu nenhum diálogo.'); return; }
    log('INFO', 'Texto do diálogo:\n' + info.dialogTexto);
    log('INFO', 'Campos encontrados (' + info.campos.length + '):');
    info.campos.forEach(function (c, i) {
      log('INFO', '  [' + i + '] "' + c.texto.replace(/\n/g, ' | ') + '" (input=' + c.temInput + ', textarea=' + c.temTextarea + ', classes=' + c.classes + ')');
    });
    await cancelarDialogo(page);
  } finally {
    browserAtual = null;
    await browser.close();
  }
}

async function main() {
  assertConfig();
  var args = parseArgs(process.argv.slice(2));
  var debug = args.debug || DEBUG;
  var dryRun = args.dryRun || DRY_RUN;

  if (args.discover) { await rodarDiscover(debug); return; }

  var solicitacoes = await buscarAprovadas(args.id);
  if (!solicitacoes.length) { log('INFO', 'Nenhuma solicitação APROVADA pendente de abertura no GRM.'); return; }
  log('INFO', solicitacoes.length + ' solicitação(ões) aprovada(s) para processar.');

  var browser = await lancarBrowser();
  browserAtual = browser;
  try {
    var page = await browser.newPage();
    await login(page);
    for (var i = 0; i < solicitacoes.length; i++) {
      await processarSolicitacao(page, solicitacoes[i], dryRun, debug);
    }
  } finally {
    browserAtual = null;
    await browser.close();
  }
}

if (require.main === module) {
  main().then(function () { process.exit(0); }).catch(function (error) {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(function () {
    log('ERROR', 'Timeout geral do agente atingido.');
    if (browserAtual) browserAtual.close().catch(function () {});
    process.exit(1);
  }, Number(process.env.ABERTURA_OS_TIMEOUT_MS || 480000)).unref();
}

module.exports = {
  extrairNumeroDoTexto: extrairNumeroDoTexto,
  formatarValor: formatarValor,
  norm: norm
};
