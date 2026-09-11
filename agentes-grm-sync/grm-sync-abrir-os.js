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
// armazem_embarque/cidade_embarque (LOCAL DO SERVICO/CIDADE) e cidade_destino/
// local_destino (CIDADE DE DESTINO/DESTINO) saíram daqui — confirmado ao vivo
// em 11/09 que os dois lados têm cascata de verdade (Tipo do Local -> UF ->
// Cidade -> Local do Serviço; UF de Destino -> Cidade de Destino -> Destino),
// não só "campo desabilitado por um instante". Tratados à parte em
// preencherEmbarque/preencherDestino, que resolvem Tipo do Local/UF a partir
// de operacional_pontos_embarque (embarque) ou parseando o próprio
// local_destino no formato "UF - CIDADE (LOCAL)" (destino).
// regional (SUPERVISAO) e produtor (PRODUTOR) também saíram daqui: os dois
// ficam dentro de "DADOS DO EMBARQUE" e cascateiam a partir de Cidade — só
// fazem sentido depois de preencherEmbarque, não numa posição fixa no meio
// da lista. Sequenciados manualmente em preencherFormulario.
var LABEL_MAP = [
  { campo: 'contratante_cliente', labels: ['CLIENTE NACIONAL'] },
  { campo: 'filial_pagadora', labels: ['CLIENTE FINAL'] },
  { campo: 'numero_contrato', labels: ['CONTRATO'] },
  { campo: 'servico', labels: ['SERVICO'] },
  { campo: 'volume_inicial', labels: ['TAMANHO DO LOTE'] },
  { campo: 'produto', labels: ['PRODUTO'] },
  { campo: 'tipo_produto', labels: ['TIPO DO PRODUTO'] }
];

// "Tipo do Produto" no GRM é uma classificação (Convencional/Transgênico/
// Declarado Intacta/etc.), não "Exportação"/"doméstico" — mas a tela de
// Abrir O.S. do painel-web oferece "Exportação" como opção de
// tipo_produto, um valor que não existe nesse dropdown do GRM. Quando isso
// acontece, preencherCampo não acha opção nenhuma pra selecionar e deixa o
// campo em branco — e como ele é obrigatório, o "Salvar" é bloqueado sem
// erro nenhum (confirmado ao vivo 11/09, mesma solicitação da GRAOMIL que
// motivou o fix de Tipo do Transporte: com os dois corrigidos ela ainda
// travava, porque tipo_produto="Exportação" continuava sem bater com nada).
var TIPO_PRODUTO_GRM_VALIDOS = [
  'AFLATOXINA NEGATIVO', 'CONVENCIONAL', 'DECLARADO INTACTA', 'INTACTA NEGATIVO',
  'INTACTA POSITIVO', 'NAO DEFINIDO', 'PARTICIPANTE', 'TRANSGENICO'
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

// Instrumentação temporária pra descobrir o endpoint de escrita da Abertura
// de O.S. (investigação 10/09, mesmo método usado pra descobrir o endpoint de
// escrita da Distribuição de OS em grm-sync-aplicar-distribuicao-os.js). Só
// ativa com CAPTURE_NET=true — loga toda chamada POST/PUT/PATCH/DELETE /api/
// (request e response) pra achar o payload do "Salvar" do formulário Nova O.S.
function instrumentarCapturaRede(page) {
  if (process.env.CAPTURE_NET !== 'true') return;
  page.on('request', function (req) {
    var method = req.method();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1 && /\/api\//.test(req.url())) {
      log('CAPTURE', 'REQ ' + method + ' ' + req.url() + ' :: ' + (req.postData() || ''));
    }
  });
  page.on('response', async function (res) {
    var req = res.request();
    var method = req.method();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1 && /\/api\//.test(req.url())) {
      var body = '';
      try { body = (await res.text()).slice(0, 2000); } catch (e) { /* corpo binário/streaming */ }
      log('CAPTURE', 'RES ' + res.status() + ' ' + req.url() + ' :: ' + body);
    }
  });
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

// A cascata de campos "--disabled" (Cliente Final, Local do Serviço, Cidade,
// Supervisão, Cidade de Destino, Tipo do Produto, Testes) não destrava na
// hora que o campo pai é escolhido — é assíncrono (o Vuetify/Vue reage à
// mudança e só então habilita o(s) filho(s), às vezes esperando uma
// chamada de API do próprio GRM pra popular as opções). Confirmado ao vivo
// em 11/09: localizarCampoBox via preencherCampo checava "disabled"
// literalmente milissegundos depois de selecionar o campo pai anterior e
// via quase TUDO ainda desabilitado (Cliente Regional, Cliente Final,
// Local do Serviço, Cidade, Supervisão, Cidade de Destino, Tipo do
// Produto, Teste Aflatoxina — praticamente a cascata inteira), mesmo
// funcionando bem quando testado manualmente (com os delays naturais de
// clicar/olhar a tela). Por isso localizarCampoBox agora tem essa variante
// que tenta de novo por até ~2,4s antes de desistir.
async function localizarCampoHabilitado(page, labels, tentativas, intervaloMs) {
  tentativas = tentativas || 20;
  intervaloMs = intervaloMs || 500;
  var box = null;
  for (var i = 0; i < tentativas; i++) {
    box = await localizarCampoBox(page, labels);
    if (!box || !box.disabled) return box;
    await wait(intervaloMs);
  }
  return box;
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

// "Cliente Regional" não tem coluna equivalente no painel-web (fica sempre
// em branco) — mas confirmado ao vivo em 11/09 que "Cliente Final" só
// destrava DEPOIS que "Cliente Regional" é escolhido (não basta escolher
// "Cliente Nacional", como o comentário original do LABEL_MAP supunha).
// Sem preencher esse campo intermediário, filial_pagadora ("Cliente
// Final") nunca é escrito — fica em branco, e como é obrigatório, o
// "Salvar" é bloqueado silenciosamente (mesmo sintoma de sempre: diálogo
// não fecha). Como não há um valor "certo" vindo da solicitação pra esse
// campo, abre a lista (sem digitar nada) e escolhe a 1ª opção disponível —
// só serve pra destravar a cascata, o ADM pode revisar/corrigir depois.
async function selecionarPrimeiraOpcaoCascata(page, labels) {
  var box = await localizarCampoHabilitado(page, labels);
  if (!box) { log('WARN', 'Campo cascata (' + labels.join(' / ') + ') não encontrado — pulando.'); return; }
  if (box.disabled) { log('WARN', 'Campo cascata "' + box.label + '" continua desabilitado mesmo após esperar — pulando.'); return; }
  await page.mouse.click(box.x, box.y);
  await wait(700);
  var escolhida = await page.evaluate(function () {
    var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    for (var i = overlays.length - 1; i >= 0; i--) {
      var options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
      if (options.length) { var texto = (options[0].innerText || options[0].textContent || '').trim(); options[0].click(); return texto; }
    }
    return null;
  });
  if (!escolhida) {
    log('WARN', 'Campo cascata "' + box.label + '": nenhuma opção apareceu ao abrir a lista — seguindo sem preencher.');
    await page.keyboard.press('Escape').catch(function () {});
  } else {
    log('INFO', 'Campo cascata "' + box.label + '" preenchido com a 1ª opção disponível: ' + escolhida);
  }
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

  var box = await localizarCampoHabilitado(page, labels);
  if (!box) { log('WARN', 'Campo "' + campo + '" (rótulos: ' + labels.join(' / ') + ') não encontrado no formulário — verifique LABEL_MAP com --discover.'); return; }
  if (box.disabled) { log('WARN', 'Campo "' + campo + '" ("' + box.label + '") continua desabilitado mesmo após esperar a cascata — pulando, a O.S. ficará sem esse valor.'); return; }

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

  // Retry: em campos cuja lista de opções depende de uma chamada de API do
  // GRM (ex.: Produto), 1 wait único de 700ms às vezes não é suficiente —
  // confirmado ao vivo em 11/09 (Produto acabava "preenchido como texto
  // livre" mesmo tendo opção real pra selecionar, porque a lista ainda não
  // tinha renderizado no momento do check; sem a seleção de verdade, tudo
  // que cascateia de Produto — Tipo do Produto, Testes — ficava travado).
  // 8x500ms (~4s) ainda não foi suficiente pra Local do Serviço/Produto em
  // testes ao vivo 11/09 — via Chrome comum (rede da usuária) a mesma busca
  // renderiza em <1s com o EXATO mesmo mecanismo (clique+foco+ctrl+a+
  // backspace+digitar), então não é bug de lógica; é o servidor cPanel
  // levando mais tempo pra falar com a API de busca do GRM pra esses 2
  // campos especificamente (Tipo do Local/UF/Cidade não têm esse problema).
  // 20x500ms (~10s) dá bastante margem — o custo de esperar demais é
  // irrelevante (job roda em fila, sem pressa), o de não esperar o
  // suficiente é a O.S. inteira falhar.
  var opcaoAberta = false;
  for (var tentativaOpcao = 0; tentativaOpcao < 20 && !opcaoAberta; tentativaOpcao++) {
    await wait(500);
    opcaoAberta = await page.evaluate(function () {
      var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
      return overlays.some(function (o) { return o.querySelectorAll('[role="option"], .v-list-item').length > 0; });
    });
  }

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

    var box = await localizarCampoHabilitado(page, mapa.campo);
    if (!box) { log('WARN', 'Campo do teste "' + key + '" (' + mapa.campo.join('/') + ') não encontrado no formulário.'); continue; }
    if (box.disabled) { log('WARN', 'Campo do teste "' + key + '" continua desabilitado mesmo após esperar — pulando.'); continue; }

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

// "Local do Serviço" (armazem_embarque) fica dentro de uma cascata real
// Tipo do Local -> UF -> Cidade -> Local do Serviço (confirmado ao vivo
// 11/09 — Cidade sozinha, sem UF antes, nem aceita digitação). A solicitação
// do painel-web só guarda o nome do local (armazem_embarque) e a cidade
// (cidade_embarque) soltos, sem UF/Tipo do Local — mas esse local quase
// sempre já existe em operacional_pontos_embarque (mesma tabela que
// alimenta o autopreenchimento da tela de Abertura de O.S.), que TEM as 3
// colunas. Busca por nome_local primeiro (mais específico), cai pra
// embarque_label (formato "UF - CIDADE (LOCAL)") se não achar.
async function resolverPontoEmbarque(valorArmazem) {
  var texto = String(valorArmazem || '').trim();
  if (!texto) return null;
  var porNome = await supabase.from('operacional_pontos_embarque')
    .select('tipo_local,uf,cidade,nome_local').ilike('nome_local', texto).limit(1);
  if (!porNome.error && porNome.data && porNome.data[0]) return porNome.data[0];
  var porLabel = await supabase.from('operacional_pontos_embarque')
    .select('tipo_local,uf,cidade,nome_local').ilike('embarque_label', texto).limit(1);
  if (!porLabel.error && porLabel.data && porLabel.data[0]) return porLabel.data[0];
  return null;
}

async function preencherEmbarque(page, solicitacao) {
  var ponto = await resolverPontoEmbarque(solicitacao.armazem_embarque);
  if (ponto) {
    log('INFO', 'Local de embarque "' + solicitacao.armazem_embarque + '" resolvido em operacional_pontos_embarque: ' + ponto.tipo_local + ' / ' + ponto.uf + ' / ' + ponto.cidade + ' / ' + ponto.nome_local);
    await preencherCampo(page, 'tipo_local', ['TIPO DO LOCAL'], ponto.tipo_local);
    await preencherCampo(page, 'uf_embarque', ['UF'], ponto.uf);
    await preencherCampo(page, 'cidade_embarque', ['CIDADE'], ponto.cidade);
    await preencherCampo(page, 'armazem_embarque', ['LOCAL DO SERVICO'], ponto.nome_local);
  } else {
    log('WARN', 'Local de embarque "' + solicitacao.armazem_embarque + '" não encontrado em operacional_pontos_embarque — sem UF/Tipo do Local, Cidade e Local do Serviço provavelmente ficarão desabilitados.');
    await preencherCampo(page, 'cidade_embarque', ['CIDADE'], solicitacao.cidade_embarque);
    await preencherCampo(page, 'armazem_embarque', ['LOCAL DO SERVICO'], solicitacao.armazem_embarque);
  }
}

// "Destino" não tem uma tabela de pontos equivalente — mas local_destino já
// vem no mesmo formato "UF - CIDADE (LOCAL)" (ex.: "GO - GOIÂNIA (moinho
// vitoria)"), então dá pra extrair UF/Cidade direto dali sem precisar de
// outra fonte. Cai pro valor bruto se o texto não bater nesse padrão.
function extrairLocalPadrao(texto) {
  var m = String(texto || '').trim().match(/^([A-Za-z]{2})\s*-\s*([^(]+?)\s*\(([^)]+)\)\s*$/);
  if (!m) return null;
  return { uf: m[1].toUpperCase(), cidade: m[2].trim(), local: m[3].trim() };
}

async function preencherDestino(page, solicitacao) {
  var parsed = extrairLocalPadrao(solicitacao.local_destino);
  if (parsed) {
    log('INFO', 'Destino "' + solicitacao.local_destino + '" parseado: UF=' + parsed.uf + ' Cidade=' + parsed.cidade + ' Local=' + parsed.local);
    await preencherCampo(page, 'uf_destino', ['UF DE DESTINO'], parsed.uf);
    await preencherCampo(page, 'cidade_destino', ['CIDADE DE DESTINO'], parsed.cidade);
    await preencherCampo(page, 'local_destino', ['DESTINO'], parsed.local);
  } else {
    log('WARN', 'local_destino "' + solicitacao.local_destino + '" não bate no formato "UF - CIDADE (LOCAL)" — sem UF de Destino, Cidade de Destino provavelmente ficará desabilitada.');
    await preencherCampo(page, 'cidade_destino', ['CIDADE DE DESTINO'], solicitacao.cidade_destino);
    await preencherCampo(page, 'local_destino', ['DESTINO'], solicitacao.local_destino);
  }
}

async function preencherFormulario(page, solicitacao) {
  for (var i = 0; i < LABEL_MAP.length; i++) {
    var item = LABEL_MAP[i];
    var valorCampo = solicitacao[item.campo];
    if (item.campo === 'tipo_produto' && valorCampo && TIPO_PRODUTO_GRM_VALIDOS.indexOf(norm(valorCampo)) === -1) {
      log('WARN', 'tipo_produto "' + valorCampo + '" não é uma opção válida do GRM (Tipo do Produto) — usando "Não Definido".');
      valorCampo = 'Não Definido';
    }
    await preencherCampo(page, item.campo, item.labels, valorCampo);
    // "Cliente Final" (próximo item, filial_pagadora) só destrava depois que
    // "Cliente Regional" é escolhido — ver selecionarPrimeiraOpcaoCascata.
    if (item.campo === 'contratante_cliente') {
      await selecionarPrimeiraOpcaoCascata(page, ['CLIENTE REGIONAL']);
    }
    // Embarque (Tipo do Local/UF/Cidade/Local do Serviço), Supervisão,
    // Produtor e Destino (UF/Cidade/Local) ficam entre Tamanho do Lote e
    // Produto no formulário real — cada um com sua própria cascata, por
    // isso não entram no LABEL_MAP genérico (ver preencherEmbarque/
    // preencherDestino acima).
    if (item.campo === 'volume_inicial') {
      await preencherEmbarque(page, solicitacao);
      await preencherCampo(page, 'regional', ['SUPERVISAO'], solicitacao.regional);
      // Produtor é obrigatório no GRM mas a solicitação nem sempre tem um
      // (fica null) — nesse caso o valor real é literalmente a opção "Não
      // Informado" da lista (confirmado ao vivo), não "sem preencher".
      if (solicitacao.produtor) {
        await preencherCampo(page, 'produtor', ['PRODUTOR'], solicitacao.produtor);
      } else {
        await selecionarPrimeiraOpcaoCascata(page, ['PRODUTOR']);
      }
      await preencherDestino(page, solicitacao);
    }
  }
  await preencherTestes(page, solicitacao);
  // "Tipo do Transporte" existe no formulário do GRM mas não tem coluna
  // correspondente na solicitação do painel-web (a tela de Abrir O.S. nunca
  // pergunta isso) — ficava sempre em branco. Confirmado ao vivo em 11/09,
  // reproduzindo manualmente a solicitação da GRAOMIL (id 8f1e8a62) que
  // tinha travado em "diálogo continua aberto": o Salvar só passou depois de
  // preencher esse campo (junto com Cliente Final, que o LABEL_MAP abaixo já
  // tenta preencher via filial_pagadora). Deriva um valor: "Vagão" só quando
  // o contrato indica saída de vagão (mesmo placeholder "VAGOES"/"SAIDA
  // VAGOES" usado em numero_contrato, ver logistica_clientes_contrato_regras
  // e a migration 20260827161500); "Caminhão" no resto — a grande maioria.
  var ehVagao = /VAGA?O/i.test(String(solicitacao.numero_contrato || ''));
  await preencherCampo(page, 'tipo_transporte', ['TIPO DO TRANSPORTE'], ehVagao ? 'Vagão' : 'Caminhão');
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

// Lê o número na 1ª célula numérica da 1ª linha da grade — usada como
// baseline (antes de salvar) e como estratégia 3 de captura (depois de
// salvar). Ver comentário em salvarECapturarNumero sobre por que a baseline
// existe.
function lerNumeroTopoGrade(page) {
  return page.evaluate(function () {
    var row = document.querySelector('table tbody tr');
    if (!row) return null;
    var cell = Array.from(row.querySelectorAll('td')).find(function (td) { return /^\d{4,}$/.test((td.textContent || '').trim()); });
    return cell ? cell.textContent.trim() : null;
  });
}

async function salvarECapturarNumero(page, numeroAntes) {
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
  // topo — primeira célula numérica da 1ª linha da tabela. SÓ é confiável se
  // o diálogo realmente fechou (senão o clique em "Salvar" pode ter sido
  // bloqueado por validação, sem gerar erro nem fechar nada) E se o número
  // lido é DIFERENTE do que já estava no topo antes de salvar — caso
  // contrário a grade não mudou (save falhou silenciosamente) e essa
  // estratégia acabaria devolvendo o número de uma O.S. antiga, de outro
  // cliente, como se fosse a recém-criada (bug real: O.S. 92387 da AMAGGI
  // devolvida pra CARGILL em 10/09; mesmo número devolvido a 4 solicitações
  // em lote em 03/09).
  if (!numero) {
    await wait(2500);
    var aindaAberto = await overlayFormularioAtivo(page);
    if (aindaAberto) {
      throw new Error('O diálogo de Nova O.S. continua aberto após clicar em "Salvar" — o clique provavelmente foi bloqueado por validação (campo obrigatório/inválido). Não é seguro ler a grade nesse estado.');
    }
    var numeroTopo = await lerNumeroTopoGrade(page);
    if (numeroTopo && numeroAntes && numeroTopo === numeroAntes) {
      throw new Error('Diálogo fechou, mas o topo da grade continua com o mesmo número de antes de salvar (' + numeroTopo + ') — a O.S. provavelmente NÃO foi criada (save falhou silenciosamente). Não é seguro assumir que esse é o número novo.');
    }
    numero = numeroTopo;
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

// A captura do número (salvarECapturarNumero) tem um fallback frágil que lê
// a 1ª célula numérica da 1ª linha da grade — se ela não tiver atualizado a
// tempo, esse número pode ser o de uma O.S. antiga de OUTRO cliente/contrato
// já existente. Antes de gravar como cadastrado, confere no operacional_os
// (fonte real, sincronizada do GRM) se esse número já pertence a um
// cliente/contrato diferente do desta solicitação — se sim, é captura
// errada, não um número novo, e não pode ser devolvido ao Gestor.
async function validarNumeroNaoColide(numeroOs, solicitacao) {
  var result = await supabase.from('operacional_os').select('cliente,contrato').eq('numero_os', numeroOs).limit(1);
  if (result.error) { log('WARN', 'Não consegui validar colisão de número (' + result.error.message + ') — seguindo sem checar.'); return; }
  var existente = (result.data || [])[0];
  if (!existente) return; // ainda não sincronizado do GRM: número realmente novo, nada a comparar.

  var contratoSolicitado = String(solicitacao.numero_contrato || '').trim().toUpperCase();
  var contratoExistente = String(existente.contrato || '').trim().toUpperCase();
  if (contratoSolicitado && contratoExistente && contratoSolicitado === contratoExistente) return;

  throw new Error(
    'Captura de número inválida: O.S. ' + numeroOs + ' já pertence a outro cliente/contrato (' +
    (existente.cliente || '-') + ' / ' + (existente.contrato || '-') +
    '), não a "' + (solicitacao.contratante_cliente || '-') + ' / ' + (solicitacao.numero_contrato || '-') +
    '". Provável falha na leitura da grade após salvar — revise manualmente no GRM e reenvie.'
  );
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

    // Baseline pra estratégia 3 de captura (ver salvarECapturarNumero): sem
    // isso não dá pra distinguir "grade mudou porque a O.S. foi criada" de
    // "grade ficou igual porque o save falhou" — é a causa raiz do bug de
    // capturar o número de outro cliente (ver comentário na função).
    var numeroAntes = await lerNumeroTopoGrade(page);

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

    var numeroOs = await salvarECapturarNumero(page, numeroAntes);
    await validarNumeroNaoColide(numeroOs, solicitacao);
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
  // Old Headless (headless:true) é o modo deprecado do Puppeteer — tem bugs
  // conhecidos de timing/rendering (requestAnimationFrame, repaint) que
  // batem exatamente com o sintoma visto ao vivo 11/09: dropdowns do
  // Vuetify (Local do Serviço, Produto, Supervisão, UF de Destino) às vezes
  // nunca renderizavam as opções mesmo esperando 10s, enquanto o MESMO
  // clique+digitação funcionava em <1s num Chrome comum. grm-sync-aplicar-
  // distribuicao-os.js já usa 'new' como default por isso mesmo — alinhando
  // este agente. Continua configurável via GRM_HEADLESS pra rollback rápido.
  return puppeteer.launch({
    headless: process.env.GRM_HEADLESS === 'true' ? true : (process.env.GRM_HEADLESS === 'false' ? false : 'new'),
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
    instrumentarCapturaRede(page);
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
    instrumentarCapturaRede(page);
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
