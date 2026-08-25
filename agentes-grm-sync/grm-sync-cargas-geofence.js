#!/usr/bin/env node
/*
 * GRM Server - Relatório de Cargas x Geofence da O.S.
 *
 * O agente:
 * 1. Loga no GRM Server.
 * 2. Abre o Relatório de Cargas.
 * 3. Filtra Data de Classificação de hoje até hoje.
 * 4. Mantém/seleciona Tipo = Embarcado e Incluir Classificador.
 * 5. Baixa o XLS.
 * 6. Compara Latitude/Longitude do lançamento com a coordenada correta da O.S.
 * 7. Se sair do raio configurado, grava em logistica_cargas_irregularidades.
 *
 * Compatível com o padrão dos agentes atuais do cPanel/WHM.
 */

require('dotenv').config();

var puppeteer = require('puppeteer-extra');
var StealthPlugin = require('puppeteer-extra-plugin-stealth');
var XLSX = require('xlsx');
var fs = require('fs');
var path = require('path');
var os = require('os');
var WebSocket = require('ws');
var createClient = require('@supabase/supabase-js').createClient;
var downloadUtils = require('./download-utils');

puppeteer.use(StealthPlugin());

var SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
var GRM_USER = process.env.GRMSERVER_USER;
var GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

var RAIO_M = Number(process.env.CARGAS_RAIO_M || 2000);
var DOWNLOAD_TIMEOUT_MS = Number(process.env.CARGAS_DOWNLOAD_TIMEOUT_MS || 90000);
var MAX_LOOKUP_ROWS = Number(process.env.CARGAS_OS_LOOKUP_LIMIT || 5000);
// O modo "new" do headless não sustenta --single-process (usado nos flags de memória
// abaixo) e trava com "Check failed: false" em partition_address_space.cc em hosts como
// esse cPanel. Os outros agentes da esteira (ex.: grm-sync-lista-os.js) usam o modo
// clássico (true) exatamente por isso.
var HEADLESS = process.env.GRM_HEADLESS === 'new' ? 'new' : true;
var TENTATIVAS_DOWNLOAD = Number(process.env.CARGAS_TENTATIVAS_DOWNLOAD || 2);

// Referência ao browser em execução, usada apenas pelo timeout geral no fim do arquivo
// para fechar o Chrome se o agente estourar o tempo limite (evita processo órfão no servidor).
var browserAtual = null;

var REPORT_CONFIG = {
  name: 'Relatório de Cargas - Geofence',
  tableIrregularidades: process.env.CARGAS_IRREG_TABLE || 'logistica_cargas_irregularidades',
  tableExecucoes: process.env.CARGAS_RUNS_TABLE || 'logistica_cargas_monitor_execucoes',
  tableImportacoes: process.env.CARGAS_IMPORT_TABLE || 'grm_cargas_importacoes',
  salvarImportacao: String(process.env.CARGAS_SALVAR_IMPORTACAO || 'true').toLowerCase() !== 'false',
  somenteEmbarcado: String(process.env.CARGAS_SOMENTE_EMBARCADO || 'true').toLowerCase() !== 'false',
  urlCandidates: splitEnv(process.env.CARGAS_REPORT_URLS || process.env.CARGAS_REPORT_URL || [
    'https://www.grmserver.com.br/report/classification/loads',
    'https://www.grmserver.com.br/report/classification/production/load',
    'https://www.grmserver.com.br/report/classification/production/cargo',
    'https://www.grmserver.com.br/report/classification/production/cargas',
    'https://www.grmserver.com.br/report/classification/production/loads',
    'https://www.grmserver.com.br/report/classification/production/loadReport'
  ].join(',')),
  updateSelectors: splitEnv(process.env.CARGAS_UPDATE_SELECTORS || process.env.CARGAS_UPDATE_SELECTOR || [
    '.loadsReport-act-update button',
    '.classificationLoadsReport-act-update button',
    '.productionLoadReport-act-update button',
    '.classificationLoadReport-act-update button',
    '.loadReport-act-update button',
    '.cargoReport-act-update button',
    '.productionCargoReport-act-update button',
    '.report-act-update button',
    '[class*="act-update"] button'
  ].join(',')),
  xlsSelectors: splitEnv(process.env.CARGAS_XLS_SELECTORS || process.env.CARGAS_XLS_SELECTOR || [
    '.loadsReport-report-to-xls button',
    '.classificationLoadsReport-report-to-xls button',
    '.productionLoadReport-report-to-xls button',
    '.classificationLoadReport-report-to-xls button',
    '.loadReport-report-to-xls button',
    '.cargoReport-report-to-xls button',
    '.productionCargoReport-report-to-xls button',
    '[class*="report-to-xls"] button',
    '[class*="xls"] button',
    '[class*="XLS"] button'
  ].join(',')),
  dateFromSelectors: splitEnv(process.env.CARGAS_DATE_FROM_SELECTORS || [
    '#loaDateFrom',
    'input#loaDateFrom',
    'input[name="loaDateFrom"]',
    '#loadDateFrom',
    '#loadsDateFrom',
    '#claDateFrom',
    '#carDateFrom',
    '#lcrDateFrom',
    'input[name="dateFrom"]'
  ].join(',')),
  dateToSelectors: splitEnv(process.env.CARGAS_DATE_TO_SELECTORS || [
    '#loaDateTo',
    'input#loaDateTo',
    'input[name="loaDateTo"]',
    '#loadDateTo',
    '#loadsDateTo',
    '#claDateTo',
    '#carDateTo',
    '#lcrDateTo',
    'input[name="dateTo"]'
  ].join(',')),
  staffCheckboxSelectors: splitEnv(process.env.CARGAS_STAFF_CHECKBOX_SELECTORS || [
    '#addStaffInfo',
    'input#addStaffInfo',
    'input[type="checkbox"][id="addStaffInfo"]',
    'label[for="addStaffInfo"]'
  ].join(',')),
  osLookupTables: splitEnv(process.env.CARGAS_OS_LOOKUP_TABLES || [
    'locais_servico',
    'logistica_locais_servico',
    'logistica_os',
    'programacao_os',
    'grm_lista_os_importacoes',
    'grm_distribuicao_os_importacoes'
  ].join(','))
};

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
  auth: { persistSession: false, autoRefreshToken: false }
});

var OS_ALIASES = splitEnv(process.env.CARGAS_OS_ALIASES || 'O.S.,OS,Os,os,Ordem de Serviço,Ordem Serviço,ordem_servico,ordem_servico_id,sorder,sorCode');
var LAT_ALIASES = splitEnv(process.env.CARGAS_OS_LAT_ALIASES || 'Latitude,latitude,Lat,lat,Latitude Local,Latitude do Local,Latitude Serviço,Latitude Servico,lat_local,latitude_local,local_latitude,lat_os,latitude_os,ponto1_latitude,Latitude Embarque,Latitude de Embarque');
var LNG_ALIASES = splitEnv(process.env.CARGAS_OS_LNG_ALIASES || 'Longitude,longitude,Lng,lng,Long,long,Longitude Local,Longitude do Local,Longitude Serviço,Longitude Servico,lng_local,longitude_local,local_longitude,lng_os,longitude_os,ponto1_longitude,Longitude Embarque,Longitude de Embarque');

function log(level, msg) {
  console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg);
}

function splitEnv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

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
    if (argv[i] === '--data') out.data = argv[++i];
    else if (argv[i] === '--xlsx') out.xlsx = argv[++i];
    else if (argv[i] === '--debug') out.debug = true;
  }
  return out;
}

function todayLocalYmd() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function ymdToBr(ymd) {
  var p = String(ymd).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function getTempDir(prefix) {
  var dir = path.join(os.tmpdir(), 'grm-sync-' + prefix + '-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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
    if (page.url().indexOf('/login') === -1) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error('Login falhou: página não saiu de /login após 45s.');
  log('SUCCESS', 'Login realizado');
}

async function buscarRelatorioCargasApi(page, dataYmd) {
  var dataBr = ymdToBr(dataYmd);
  log('INFO', 'Consultando API do Relatório de Cargas em ' + dataBr + '...');
  var groups = await page.evaluate(async function (dateValue) {
    var token = '';
    for (var t = 0; t < localStorage.length; t++) {
      try { var value = JSON.parse(localStorage.getItem(localStorage.key(t))); if (value && value.userToken) token = value.userToken; } catch (e) {}
    }
    var response = await fetch('/api/reports/classification/loads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        loaDateFrom: dateValue,
        loaDateTo: dateValue,
        loaType: 'EMB',
        includeTotal: 'N',
        addStaffInfo: 'S',
        addLocalInfo: 'S',
        addTestsInfo: 'N',
        addSchedulesInfo: 'N',
        joinCItems: 'N'
      })
    });
    var json = await response.json();
    if (!response.ok || !json.result) throw new Error(json.message || ('HTTP ' + response.status));
    return json.searchData || [];
  }, dataBr);

  var rows = [];
  for (var g = 0; g < groups.length; g++) {
    var loads = groups[g].loads || [];
    for (var i = 0; i < loads.length; i++) {
      var r = loads[i];
      rows.push({
        data_classificacao: toYmd(r.loaDate),
        hora_cadastro: onlyTime(r.loaRegisterDate),
        situacao: r.bilCode > 0 ? 'Faturada' : 'Não Faturada',
        cliente: clean(r.cliName),
        coordenacao: clean(r.olcName),
        supervisao: clean(r.olsName),
        os: normalizeOs(r.sorCode),
        servico: clean(r.serName),
        contrato: clean(r.sorContract),
        laudo: clean(r.loaLaudo),
        tipo_carga: clean(r.loaType),
        // A API retorna o peso em kg; o XLS histórico expunha toneladas.
        tons: parseNumber(r.loaWeight) === null ? null : parseNumber(r.loaWeight) / 1000,
        produto: clean(r.proName),
        tipo_produto: clean(r.ptyName),
        placa: clean(r.loaLicensePlate),
        nota_fiscal: clean(r.loaInvoice),
        lat_lancamento: parseNumber(r.loaLat),
        lng_lancamento: parseNumber(r.loaLon),
        colaborador: clean(r.staName),
        observacao: clean(r.loaNotes),
        raw: r
      });
    }
  }
  log('SUCCESS', rows.length + ' cargas recebidas pela API');
  return rows;
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value));

  // Vuetify/Graint às vezes só atualiza o v-model quando recebe input/change nativo.
  await page.evaluate(function (payload) {
    var input = document.querySelector(payload.selector);
    if (!input) return;
    input.value = payload.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector: selector, value: String(value) });
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function abrirRelatorioCargas(page, debug) {
  log('INFO', 'Localizando página do Relatório de Cargas...');
  var urls = REPORT_CONFIG.urlCandidates;
  var lastError = null;
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    try {
      log('INFO', 'Tentando URL: ' + url);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await wait(2500);
      var match = await paginaTemRelatorioDeCargas(page);
      if (match) {
        log('SUCCESS', 'Relatório encontrado: ' + url);
        return url;
      }
      log('WARN', 'URL ' + url + ' não parece ser o Relatório de Cargas; tentando próxima candidata.');
    } catch (e) {
      lastError = e;
      log('WARN', 'Falha ao tentar URL ' + url + ': ' + e.message);
    }
  }
  if (debug) await safeScreenshot(page, 'cargas-geofence-url-nao-encontrada.png');
  throw new Error('Não localizei a página do Relatório de Cargas. Configure CARGAS_REPORT_URL no .env. Último erro: ' + (lastError ? lastError.message : 'sem erro detalhado'));
}

// Confere que a tela é mesmo o Relatório de Cargas: não basta ter o título ou a palavra
// "XLS" em algum lugar do HTML (isso casa com outras telas do GRM também) — exige também
// um campo de data reconhecível (pelos seletores configurados ou um input já preenchido
// no formato dd/mm/aaaa), já que o passo seguinte depende de preencher essas datas.
async function paginaTemRelatorioDeCargas(page) {
  return page.evaluate(function (selectors) {
    function norm(s) {
      var str = String(s || '').normalize('NFD');
      var out = '';
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 0x0300 || code > 0x036f) out += str[i];
      }
      return out.toUpperCase();
    }
    var txt = norm(document.body && document.body.innerText ? document.body.innerText : '');
    var temTitulo = txt.indexOf('RELATORIO DE CARGAS') !== -1 || txt.indexOf('DATA DE CLASSIFICACAO') !== -1;
    if (!temTitulo) return false;

    var temSeletorConhecido = selectors.some(function (sel) {
      try { return !!document.querySelector(sel); } catch (e) { return false; }
    });
    if (temSeletorConhecido) return true;

    return Array.from(document.querySelectorAll('input')).some(function (input) {
      return /^\d{2}\/\d{2}\/\d{4}$/.test(input.value || '') ||
        norm(input.placeholder || '').indexOf('DATA') !== -1;
    });
  }, REPORT_CONFIG.dateFromSelectors);
}

async function preencherDatas(page, dataBr) {
  log('INFO', 'Preenchendo Data de Classificação: ' + dataBr + ' até ' + dataBr);

  var fromOk = await typeFirstSelector(page, REPORT_CONFIG.dateFromSelectors, dataBr);
  var toOk = await typeFirstSelector(page, REPORT_CONFIG.dateToSelectors, dataBr);

  if (fromOk && toOk) return;

  var result = await page.evaluate(function (value) {
    function norm(s) {
      return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    }
    function visible(el) {
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    }
    function setInput(input, val) {
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    }

    var inputs = Array.from(document.querySelectorAll('input')).filter(visible);
    var dateInputs = inputs.filter(function (input) {
      var idName = norm((input.id || '') + ' ' + (input.name || '') + ' ' + (input.placeholder || '') + ' ' + (input.getAttribute('aria-label') || ''));
      var p = input;
      var text = '';
      for (var i = 0; i < 5 && p; i++) {
        text += ' ' + norm(p.innerText || p.textContent || '');
        p = p.parentElement;
      }
      var all = idName + ' ' + text;
      return all.indexOf('DATA') !== -1 || all.indexOf('DATE') !== -1 || all.indexOf('CLASSIFICACAO') !== -1 || /^\d{2}\/\d{2}\/\d{4}$/.test(input.value || '');
    });

    if (dateInputs.length < 2) return { ok: false, total: dateInputs.length };
    setInput(dateInputs[0], value);
    setInput(dateInputs[1], value);
    return { ok: true, total: dateInputs.length };
  }, dataBr);

  if (!result || !result.ok) {
    throw new Error('Não foi possível preencher as duas datas do relatório. Inputs encontrados: ' + (result ? result.total : 0));
  }
}

async function typeFirstSelector(page, selectors, value) {
  for (var i = 0; i < selectors.length; i++) {
    var selector = selectors[i];
    try {
      var exists = await page.$(selector);
      if (exists) {
        await clearAndType(page, selector, value);
        await wait(300);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function selecionarTipoEmbarcado(page) {
  if (String(process.env.CARGAS_TENTAR_SELECIONAR_TIPO || 'true').toLowerCase() === 'false') return;
  log('INFO', 'Garantindo Tipo = Embarcado...');

  var already = await page.evaluate(function () {
    var txt = document.body && document.body.innerText ? document.body.innerText : '';
    return txt.toUpperCase().indexOf('EMBARCADO') !== -1;
  });

  // Mesmo que já esteja escrito na tela, não força se não achar o campo.
  var ok = await selectVuetifyOptionNearText(page, ['Tipo'], 'Embarcado');
  if (ok) log('SUCCESS', 'Tipo Embarcado selecionado');
  else if (already) log('INFO', 'Tipo Embarcado já aparece na tela; seguindo.');
  else log('WARN', 'Não consegui selecionar Tipo = Embarcado automaticamente. O filtro por Tipo da Carga = EMB será aplicado no XLS.');
}

async function selectVuetifyOptionNearText(page, labelWords, optionText) {
  try {
    var clicked = await page.evaluate(function (payload) {
      function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      }
      function visible(el) {
        var r = el.getBoundingClientRect();
        var st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      }
      var labels = payload.labels.map(norm);
      var fields = Array.from(document.querySelectorAll('.v-input, .v-field, .v-select, .v-autocomplete, .v-text-field')).filter(visible);
      for (var i = 0; i < fields.length; i++) {
        var txt = norm(fields[i].innerText || fields[i].textContent || '');
        var ok = labels.some(function (l) { return txt.indexOf(l) !== -1; });
        if (!ok) continue;
        var input = fields[i].querySelector('input');
        var btn = fields[i].querySelector('button');
        var target = input || btn || fields[i];
        target.click();
        return true;
      }
      return false;
    }, { labels: labelWords });

    if (!clicked) return false;
    await wait(700);

    var selected = await page.evaluate(function (optionText) {
      function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      }
      var wanted = norm(optionText);
      var options = Array.from(document.querySelectorAll('[role="option"], .v-list-item, .v-menu .v-list-item'));
      for (var i = 0; i < options.length; i++) {
        var txt = norm(options[i].innerText || options[i].textContent || '');
        if (txt.indexOf(wanted) !== -1) {
          options[i].click();
          return true;
        }
      }
      return false;
    }, optionText);

    await wait(500);
    return selected;
  } catch (e) {
    return false;
  }
}

async function garantirCheckboxClassificador(page) {
  log('INFO', 'Garantindo opção "Incluir Classificador"...');

  var ok = await ensureCheckboxBySelectors(page, REPORT_CONFIG.staffCheckboxSelectors, true);
  if (!ok) ok = await ensureCheckboxByText(page, 'Incluir Classificador', true);

  if (ok) log('SUCCESS', 'Incluir Classificador marcado/conferido');
  else log('WARN', 'Não consegui confirmar o checkbox Incluir Classificador. Seguindo mesmo assim.');
}

async function ensureCheckboxBySelectors(page, selectors, shouldBeChecked) {
  try {
    for (var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      var ok = await page.evaluate(function (payload) {
        var el = document.querySelector(payload.selector);
        if (!el) return false;

        var input = el.matches && el.matches('input[type="checkbox"]')
          ? el
          : (el.querySelector ? el.querySelector('input[type="checkbox"]') : null);

        if (!input && el.getAttribute && el.getAttribute('for')) {
          input = document.getElementById(el.getAttribute('for'));
        }

        if (!input) return false;

        if (!!input.checked !== payload.shouldBeChecked) {
          input.click();
          input.checked = payload.shouldBeChecked;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }, { selector: selector, shouldBeChecked: shouldBeChecked });
      if (ok) return true;
    }
  } catch (e) {}
  return false;
}

async function ensureCheckboxByText(page, text, shouldBeChecked) {
  try {
    return await page.evaluate(function (payload) {
      function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      }
      function hasChecked(el) {
        var input = el.querySelector('input[type="checkbox"]');
        if (input) return !!input.checked;
        var aria = el.getAttribute('aria-checked');
        if (aria === 'true') return true;
        if (aria === 'false') return false;
        var checkedIcon = el.querySelector('.mdi-checkbox-marked, .v-selection-control--dirty');
        return !!checkedIcon;
      }
      var wanted = norm(payload.text);
      var nodes = Array.from(document.querySelectorAll('label, .v-checkbox, .v-selection-control, .v-input'));
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var txt = norm(node.innerText || node.textContent || '');
        if (txt.indexOf(wanted) === -1) continue;
        var checked = hasChecked(node);
        if (checked !== payload.shouldBeChecked) node.click();
        return true;
      }
      return false;
    }, { text: text, shouldBeChecked: shouldBeChecked });
  } catch (e) {
    return false;
  }
}

async function clicarGerarRelatorio(page) {
  log('INFO', 'Clicando em GERAR no Relatório de Cargas...');

  // Seletor exato informado na tela do GRM: .loadsReport-act-update button
  var ok = await clickFirstSelector(page, REPORT_CONFIG.updateSelectors);
  if (!ok) {
    ok = await clickButtonByText(page, ['GERAR', 'ATUALIZAR', 'PESQUISAR', 'BUSCAR']);
  }
  if (!ok) throw new Error('Botão GERAR/Atualizar não encontrado no Relatório de Cargas.');

  await wait(Number(process.env.CARGAS_WAIT_AFTER_UPDATE_MS || 5000));
  await esperarXlsDisponivel(page);
}

async function esperarXlsDisponivel(page) {
  var timeout = Number(process.env.CARGAS_WAIT_XLS_READY_MS || 30000);
  var started = Date.now();
  while (Date.now() - started < timeout) {
    var ready = await page.evaluate(function (selectors) {
      function enabled(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        if (btn.className && String(btn.className).indexOf('v-btn--disabled') !== -1) return false;
        return true;
      }
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (enabled(el)) return true;
      }
      var candidates = Array.from(document.querySelectorAll('button, [role="button"], .v-btn'));
      return candidates.some(function (el) {
        var txt = String((el.innerText || el.textContent || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '')).toUpperCase();
        return enabled(el) && (txt.indexOf('XLS') !== -1 || txt.indexOf('EXCEL') !== -1);
      });
    }, REPORT_CONFIG.xlsSelectors);
    if (ready) return true;
    await wait(500);
  }
  log('WARN', 'Botão XLS não confirmou habilitado no tempo limite; vou tentar clicar mesmo assim.');
  return false;
}

async function clickFirstSelector(page, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var handle = await page.$(selectors[i]);
      if (handle) {
        await page.evaluate(function (el) { el.click(); }, handle);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function clickButtonByText(page, texts) {
  try {
    return await page.evaluate(function (texts) {
      function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      }
      var wanted = texts.map(norm);
      var buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (var i = 0; i < buttons.length; i++) {
        var txt = norm(buttons[i].innerText || buttons[i].textContent || buttons[i].getAttribute('title') || '');
        if (wanted.some(function (w) { return txt.indexOf(w) !== -1; })) {
          buttons[i].click();
          return true;
        }
      }
      return false;
    }, texts);
  } catch (e) {
    return false;
  }
}

async function baixarXls(page, dataYmd, debug) {
  var tempDir = getTempDir('cargas-geofence');
  await downloadUtils.prepareDownload(page, tempDir);

  log('INFO', 'Clicando no botão XLS...');
  var clicked = await clickFirstSelector(page, REPORT_CONFIG.xlsSelectors);
  if (!clicked) {
    clicked = await page.evaluate(function () {
      function norm(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      }
      var all = Array.from(document.querySelectorAll('button, [role="button"], .v-btn, i, svg'));
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var txt = norm((el.innerText || el.textContent || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || ''));
        if (txt.indexOf('XLS') !== -1 || txt.indexOf('EXCEL') !== -1) {
          var btn = el.closest ? el.closest('button, [role="button"], .v-btn') : null;
          (btn || el).click();
          return true;
        }
      }
      return false;
    });
  }

  if (!clicked) {
    if (debug) await safeScreenshot(page, 'cargas-geofence-botao-xls-nao-encontrado.png');
    throw new Error('Botão XLS não encontrado. Configure CARGAS_XLS_SELECTOR no .env.');
  }

  var filePath = await downloadUtils.waitForFileDownload(tempDir, DOWNLOAD_TIMEOUT_MS);
  var renamed = path.join(tempDir, 'relatorio-cargas-' + dataYmd + path.extname(filePath));
  try {
    fs.renameSync(filePath, renamed);
    filePath = renamed;
  } catch (e) {}
  log('SUCCESS', 'XLS baixado: ' + filePath);
  return filePath;
}

async function safeScreenshot(page, name) {
  try {
    var dir = process.env.GRM_DEBUG_DIR || '/tmp';
    var p = path.join(dir, name);
    await page.screenshot({ path: p, fullPage: true });
    log('INFO', 'Screenshot debug salvo em: ' + p);
  } catch (e) {}
}

async function baixarRelatorioCargasHoje(dataYmd, debug) {
  var browser = null;
  try {
    browser = await puppeteer.launch({
      headless: HEADLESS,
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
    browserAtual = browser;
    var page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1920, height: 1440 });

    await login(page);
    await abrirRelatorioCargas(page, debug);
    var dataBr = ymdToBr(dataYmd);
    await preencherDatas(page, dataBr);
    await selecionarTipoEmbarcado(page);
    await garantirCheckboxClassificador(page);
    return await gerarEBaixarXlsComRetentativa(page, dataYmd, debug);
  } finally {
    browserAtual = null;
    if (browser) await browser.close();
  }
}

async function gerarEBaixarXlsComRetentativa(page, dataYmd, debug) {
  var ultimoErro = null;
  for (var tentativa = 1; tentativa <= TENTATIVAS_DOWNLOAD; tentativa++) {
    try {
      await clicarGerarRelatorio(page);
      var filePath = await baixarXls(page, dataYmd, debug);
      validarColunasCargas(lerRowsBrutas(filePath), filePath);
      return filePath;
    } catch (error) {
      ultimoErro = error;
      if (tentativa === TENTATIVAS_DOWNLOAD) throw error;
      log('WARN', error.message + ' Tentando gerar/baixar o XLS de novo (tentativa ' + (tentativa + 1) + '/' + TENTATIVAS_DOWNLOAD + ')...');
      await wait(3000);
    }
  }
  throw ultimoErro;
}

function lerRowsBrutas(filePath) {
  var wb = XLSX.readFile(filePath, { cellDates: true });
  var sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('XLS sem abas (' + filePath + ').');
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: false });
}

function hasColumn(obj, key) {
  if (!obj) return false;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  var wanted = normalizeText(key);
  return Object.keys(obj).some(function (k) { return normalizeText(k) === wanted; });
}

// Já aconteceu, em outro agente do GRM, do clique no XLS disparar um export diferente
// do esperado por instabilidade da tela (ver grm-sync-lista-os.js). Aqui confere se o
// arquivo baixado tem cara de Relatório de Cargas (O.S. + Latitude + Longitude) antes de
// seguir, pra não gravar irregularidade/importação em cima do relatório errado.
function validarColunasCargas(rows, filePath) {
  if (!rows.length) {
    throw new Error('XLS baixado sem nenhuma linha (' + filePath + ').');
  }
  var primeira = rows[0];
  var temOs = OS_ALIASES.some(function (alias) { return hasColumn(primeira, alias); });
  var temLat = hasColumn(primeira, 'Latitude');
  var temLng = hasColumn(primeira, 'Longitude');
  if (!temOs || !temLat || !temLng) {
    throw new Error(
      'XLS baixado não parece ser o Relatório de Cargas esperado (faltou O.S./Latitude/Longitude; colunas recebidas: ' +
      Object.keys(primeira).join(', ') + ').'
    );
  }
}

function lerRelatorioCargas(filePath, dataFiltroYmd) {
  log('INFO', 'Lendo XLS: ' + filePath);
  var rows = lerRowsBrutas(filePath);
  validarColunasCargas(rows, filePath);

  var mapped = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var row = {
      data_classificacao: toYmd(get(r, 'Data')),
      hora_cadastro: onlyTime(get(r, 'Hora Cad.') || get(r, 'Hora Cadastro')),
      situacao: clean(get(r, 'Situação') || get(r, 'Situacao')),
      cliente: clean(get(r, 'Cliente')),
      coordenacao: clean(get(r, 'Coordenação') || get(r, 'Coordenacao')),
      supervisao: clean(get(r, 'Supervisão') || get(r, 'Supervisao')),
      os: normalizeOs(get(r, 'O.S.') || get(r, 'OS') || get(r, 'O.S')),
      servico: clean(get(r, 'Serviço') || get(r, 'Servico')),
      contrato: clean(get(r, 'Contrato')),
      laudo: clean(get(r, 'Laudo')),
      tipo_carga: clean(get(r, 'Tipo da Carga') || get(r, 'Tipo Carga') || get(r, 'Tipo')),
      tons: parseNumber(get(r, 'Tons') || get(r, 'Toneladas')),
      produto: clean(get(r, 'Produto')),
      tipo_produto: clean(get(r, 'Tipo de Produto') || get(r, 'Tipo Produto')),
      placa: clean(get(r, 'Placa')),
      nota_fiscal: clean(get(r, 'Nota Fiscal') || get(r, 'NF')),
      lat_lancamento: parseNumber(get(r, 'Latitude')),
      lng_lancamento: parseNumber(get(r, 'Longitude')),
      colaborador: clean(get(r, 'Classificador') || get(r, 'Funcionário') || get(r, 'Funcionario')),
      observacao: clean(get(r, 'Observação') || get(r, 'Observacao')),
      raw: r
    };

    if (dataFiltroYmd && row.data_classificacao && row.data_classificacao !== dataFiltroYmd) continue;
    if (REPORT_CONFIG.somenteEmbarcado) {
      var tipo = normalizeText(row.tipo_carga);
      if (tipo && tipo.indexOf('EMB') !== 0 && tipo.indexOf('EMBARC') === -1) continue;
    }
    mapped.push(row);
  }

  log('SUCCESS', mapped.length + ' linhas úteis no relatório');
  return mapped;
}

function get(obj, key) {
  if (!obj) return null;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  var wanted = normalizeText(key);
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (normalizeText(keys[i]) === wanted) return obj[keys[i]];
  }
  return null;
}

function clean(value) {
  if (value === null || value === undefined) return null;
  var s = String(value).replace(/\u00a0/g, ' ').trim();
  return s || null;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function normalizeOs(value) {
  var s = clean(value);
  if (!s) return null;
  if (/^\d+\.0$/.test(s)) s = s.replace(/\.0$/, '');
  return s;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  var s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;

  // Formato brasileiro 1.234,56 ou -23,45
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toYmd(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  var s = String(value).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return null;
}

function onlyTime(value) {
  if (!value) return null;
  var s = String(value).trim();
  var m = s.match(/(\d{1,2}:\d{2})(?::\d{2})?/);
  return m ? m[1] : s;
}

function isValidCoord(lat, lng) {
  // Number(null) e Number('') viram 0, que passaria como coordenada "válida" (0,0) se não
  // barrarmos aqui antes — isso mascarava O.S. sem coordenada real como se estivessem a
  // milhares de km de distância (0,0 fica no meio do oceano).
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = function (v) { return Number(v) * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function criarExecucao(dataRef) {
  var payload = {
    data_ref: dataRef,
    status: 'INICIADO',
    iniciado_em: new Date().toISOString(),
    raw: {
      agente: 'sync-cargas-geofence',
      raio_m: RAIO_M,
      report_urls: REPORT_CONFIG.urlCandidates,
      lookup_tables: REPORT_CONFIG.osLookupTables
    }
  };
  var res = await supabase.from(REPORT_CONFIG.tableExecucoes).insert(payload).select('id').single();
  if (res.error) {
    log('WARN', 'Não consegui criar execução em ' + REPORT_CONFIG.tableExecucoes + ': ' + res.error.message);
    return null;
  }
  return res.data ? res.data.id : null;
}

async function finalizarExecucao(runId, patch) {
  if (!runId) return;
  patch.finalizado_em = new Date().toISOString();
  var res = await supabase.from(REPORT_CONFIG.tableExecucoes).update(patch).eq('id', runId);
  if (res.error) log('WARN', 'Falha ao finalizar execução: ' + res.error.message);
}


function dedupePorChaveUnicaV2(records, contexto) {
  var porChave = Object.create(null);
  var semChave = [];
  var total = records.length;

  records.forEach(function (record) {
    if (!record || !record.chave_unica) {
      semChave.push(record);
      return;
    }
    porChave[record.chave_unica] = record;
  });

  var deduped = Object.keys(porChave)
    .map(function (chave) { return porChave[chave]; })
    .concat(semChave);

  var removidas = total - deduped.length;
  if (removidas > 0) {
    log('WARN', '[DEDUP_CARGAS_V2][' + contexto + '] ' + removidas +
      ' linha(s) duplicada(s) por chave_unica removida(s) antes do upsert.');
  }
  return deduped;
}

async function salvarImportacao(rows) {
  if (!REPORT_CONFIG.salvarImportacao || !rows.length) return;
  var records = rows.map(function (r) {
    return {
      chave_unica: gerarChaveCarga(r),
      data_classificacao: r.data_classificacao,
      os: r.os,
      cliente: r.cliente,
      coordenacao: r.coordenacao,
      supervisao: r.supervisao,
      colaborador: r.colaborador,
      placa: r.placa,
      laudo: r.laudo,
      nota_fiscal: r.nota_fiscal,
      lat_lancamento: r.lat_lancamento,
      lng_lancamento: r.lng_lancamento,
      dados_json: r.raw,
      sincronizado_em: new Date().toISOString()
    };
  });

  records = dedupePorChaveUnicaV2(records, 'importacoes');

  for (var i = 0; i < records.length; i += 100) {
    var chunk = records.slice(i, i + 100);
    var res = await supabase.from(REPORT_CONFIG.tableImportacoes).upsert(chunk, { onConflict: 'chave_unica' });
    if (res.error) {
      log('WARN', 'Falha salvando importação de cargas: ' + res.error.message);
      return;
    }
  }
}

async function buscarLocalOs(osValue) {
  var osKey = normalizeOs(osValue);
  if (!osKey) return null;

  for (var t = 0; t < REPORT_CONFIG.osLookupTables.length; t++) {
    var table = REPORT_CONFIG.osLookupTables[t];
    var local = await buscarLocalOsNaTabela(table, osKey);
    if (local && isValidCoord(local.lat_os, local.lng_os)) return local;
  }
  return null;
}

async function buscarLocalOsNaTabela(table, osKey) {
  // operacional_os não é um dump grm_*_importacoes (dados_json, coluna "os" genérica,
  // sincronizado_em) — é a tabela de negócio real, com numero_os e ponto1_latitude/longitude
  // (resolvidos por trigger a partir do embarque, ver migration
  // 20260706213240_consolida_matching_embarque_os.sql). As 3 estratégias genéricas abaixo
  // nunca encontravam nada aqui (nenhuma delas bate com esse schema), então essa tabela nunca
  // conseguia alimentar lat_os/lng_os apesar de configurada em CARGAS_OS_LOOKUP_TABLES.
  if (table === 'operacional_os') {
    try {
      var resOs = await supabase
        .from('operacional_os')
        .select('numero_os,ponto1_latitude,ponto1_longitude,ponto1_nome,embarque,cliente')
        .eq('numero_os', osKey)
        .limit(1);
      if (!resOs.error && resOs.data && resOs.data.length) {
        var osRow = resOs.data[0];
        if (isValidCoord(osRow.ponto1_latitude, osRow.ponto1_longitude)) {
          return {
            os: osKey,
            lat_os: Number(osRow.ponto1_latitude),
            lng_os: Number(osRow.ponto1_longitude),
            fonte_tabela: table,
            fonte_raw: osRow,
            local_servico: osRow.ponto1_nome || osRow.embarque || null,
            cidade: null,
            uf: null
          };
        }
      }
    } catch (eOs) {}
    return null;
  }

  // 1) Tenta filtros diretos em JSON bruto, que é o padrão das tabelas grm_*_importacoes.
  var jsonFields = ['O.S.', 'OS', 'Os', 'O.S', 'os'];
  for (var j = 0; j < jsonFields.length; j++) {
    try {
      var resJson = await supabase
        .from(table)
        .select('*')
        .filter('dados_json->>' + jsonFields[j], 'eq', osKey)
        .order('sincronizado_em', { ascending: false })
        .limit(20);
      if (!resJson.error && resJson.data && resJson.data.length) {
        var foundJson = extrairLocalDeLista(resJson.data, table, osKey);
        if (foundJson) return foundJson;
      }
    } catch (e) {}
  }

  // 2) Tenta colunas normais comuns.
  var osColumns = splitEnv(process.env.CARGAS_OS_COLUMNS || 'os,ordem_servico,ordem_servico_id,codigo_os,sor_code');
  for (var c = 0; c < osColumns.length; c++) {
    try {
      var resCol = await supabase
        .from(table)
        .select('*')
        .eq(osColumns[c], osKey)
        .limit(20);
      if (!resCol.error && resCol.data && resCol.data.length) {
        var foundCol = extrairLocalDeLista(resCol.data, table, osKey);
        if (foundCol) return foundCol;
      }
    } catch (e2) {}
  }

  // 3) Fallback controlado: carrega registros recentes e procura a OS em memória.
  // Serve para tabelas onde o PostgREST não aceita filtro por chave JSON com ponto.
  try {
    var resRecent = await supabase
      .from(table)
      .select('*')
      .order('sincronizado_em', { ascending: false })
      .limit(MAX_LOOKUP_ROWS);
    if (!resRecent.error && resRecent.data && resRecent.data.length) {
      var rows = [];
      for (var i = 0; i < resRecent.data.length; i++) {
        var source = resRecent.data[i].dados_json || resRecent.data[i];
        var sourceOs = normalizeOs(getByAliases(source, OS_ALIASES));
        if (sourceOs === osKey) rows.push(resRecent.data[i]);
      }
      var foundRecent = extrairLocalDeLista(rows, table, osKey);
      if (foundRecent) return foundRecent;
    }
  } catch (e3) {}

  return null;
}

function extrairLocalDeLista(records, table, osKey) {
  if (!records || !records.length) return null;
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var aninhado = record.dados_json || record.raw || null;
    // As colunas de verdade da tabela (ex.: ponto1_latitude/ponto1_longitude em
    // operacional_os) têm prioridade sobre o blob raw/dados_json — esse blob costuma ser
    // só o dado bruto do import original, sem coordenada nenhuma, e não pode mascarar
    // colunas reais que vieram depois (ex.: geocodificação).
    var source = mesclarPreferindoTopo(record, aninhado);

    var lat = parseNumber(getByAliases(source, LAT_ALIASES));
    var lng = parseNumber(getByAliases(source, LNG_ALIASES));
    if (isValidCoord(lat, lng)) {
      return {
        os: osKey,
        lat_os: lat,
        lng_os: lng,
        fonte_tabela: table,
        fonte_raw: aninhado || record,
        local_servico: clean(getByAliases(source, splitEnv('Local de Serviço,Local de Servico,Local Serviço,Local Servico,Local,Armazém,Armazem,local_servico,nome,descricao,ponto1_nome'))),
        cidade: clean(getByAliases(source, splitEnv('Cidade,Cidade de Embarque,cidade,cidade_embarque'))),
        uf: clean(getByAliases(source, splitEnv('UF,Estado,estado,uf')))
      };
    }
  }
  return null;
}

function mesclarPreferindoTopo(topo, aninhado) {
  var out = {};
  var k;
  if (aninhado) {
    for (k in aninhado) {
      if (Object.prototype.hasOwnProperty.call(aninhado, k)) out[k] = aninhado[k];
    }
  }
  for (k in topo) {
    if (Object.prototype.hasOwnProperty.call(topo, k)) out[k] = topo[k];
  }
  return out;
}

function getByAliases(obj, aliases) {
  if (!obj) return null;
  for (var i = 0; i < aliases.length; i++) {
    var direct = get(obj, aliases[i]);
    if (direct !== null && direct !== undefined && direct !== '') return direct;
  }
  return null;
}

function gerarChaveCarga(r) {
  return [
    r.data_classificacao || '',
    r.os || '',
    r.laudo || '',
    r.placa || '',
    r.nota_fiscal || '',
    r.lat_lancamento || '',
    r.lng_lancamento || ''
  ].join('|');
}

function montarIrregularidade(row, localOs, distancia) {
  var chave = gerarChaveCarga(row);
  return {
    chave_unica: chave,
    data_classificacao: row.data_classificacao,
    hora_cadastro: row.hora_cadastro,
    os: row.os,
    cliente: row.cliente,
    coordenacao: row.coordenacao,
    supervisao: row.supervisao,
    colaborador: row.colaborador,
    placa: row.placa,
    laudo: row.laudo,
    nota_fiscal: row.nota_fiscal,
    produto: row.produto,
    tons: row.tons,
    lat_lancamento: row.lat_lancamento,
    lng_lancamento: row.lng_lancamento,
    lat_os: localOs.lat_os,
    lng_os: localOs.lng_os,
    distancia_m: distancia,
    raio_m: RAIO_M,
    status: 'ABERTA',
    origem: 'grm_relatorio_cargas',
    observacao: 'Carga lançada fora do raio de ' + RAIO_M + 'm do local da O.S.',
    raw: {
      carga: row.raw,
      local_os: localOs.fonte_raw,
      fonte_tabela_os: localOs.fonte_tabela,
      local_servico: localOs.local_servico || null,
      cidade: localOs.cidade || null,
      uf: localOs.uf || null
    },
    ultima_verificacao_em: new Date().toISOString()
  };
}

async function upsertIrregularidades(rows) {
  rows = dedupePorChaveUnicaV2(rows, 'irregularidades');
  for (var i = 0; i < rows.length; i += 100) {
    var chunk = rows.slice(i, i + 100);
    var res = await supabase.from(REPORT_CONFIG.tableIrregularidades).upsert(chunk, { onConflict: 'chave_unica' });
    if (res.error) throw res.error;
    log('INFO', 'Irregularidades gravadas: ' + Math.min(i + 100, rows.length) + '/' + rows.length);
  }
}

async function main() {
  assertConfig();

  var args = parseArgs(process.argv.slice(2));
  var dataYmd = args.data || todayLocalYmd();
  var debug = args.debug || String(process.env.GRM_DEBUG || '').toLowerCase() === 'true';
  var runId = null;

  try {
    log('INFO', '=== ' + REPORT_CONFIG.name + ' | ' + dataYmd + ' ===');
    runId = await criarExecucao(dataYmd);

    var linhas;
    var xlsxPath = args.xlsx || process.env.CARGAS_XLSX_PATH;
    if (xlsxPath) {
      linhas = lerRelatorioCargas(xlsxPath, dataYmd);
    } else {
      var browser = await puppeteer.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      browserAtual = browser;
      try {
        var page = await browser.newPage();
        await login(page);
        linhas = await buscarRelatorioCargasApi(page, dataYmd);
      } finally {
        browserAtual = null;
        await browser.close();
      }
    }
    await salvarImportacao(linhas);

    var cacheOs = Object.create(null);
    var irregularidades = [];
    var totalComCoordenada = 0;
    var totalSemReferenciaOs = 0;
    var totalDentroRaio = 0;

    for (var i = 0; i < linhas.length; i++) {
      var row = linhas[i];
      if (!isValidCoord(row.lat_lancamento, row.lng_lancamento)) continue;
      totalComCoordenada++;

      var osKey = normalizeOs(row.os);
      if (!osKey) continue;

      if (cacheOs[osKey] === undefined) {
        cacheOs[osKey] = await buscarLocalOs(osKey);
      }

      var localOs = cacheOs[osKey];
      if (!localOs || !isValidCoord(localOs.lat_os, localOs.lng_os)) {
        totalSemReferenciaOs++;
        continue;
      }

      var distancia = Math.round(haversineMeters(row.lat_lancamento, row.lng_lancamento, localOs.lat_os, localOs.lng_os));
      if (distancia > RAIO_M) {
        irregularidades.push(montarIrregularidade(row, localOs, distancia));
      } else {
        totalDentroRaio++;
      }
    }

    if (irregularidades.length) {
      log('WARN', 'Irregularidades encontradas: ' + irregularidades.length);
      await upsertIrregularidades(irregularidades);
    } else {
      log('SUCCESS', 'Nenhuma irregularidade fora do raio encontrada.');
    }

    await finalizarExecucao(runId, {
      status: 'SUCESSO',
      total_linhas: linhas.length,
      total_com_coordenada: totalComCoordenada,
      total_sem_referencia_os: totalSemReferenciaOs,
      total_irregularidades: irregularidades.length,
      raw: {
        data_ref: dataYmd,
        raio_m: RAIO_M,
        total_dentro_raio: totalDentroRaio,
        lookup_tables: REPORT_CONFIG.osLookupTables,
        arquivo: xlsxPath || 'api:reports/classification/loads'
      }
    });

    log('SUCCESS', 'Concluído com sucesso');
    process.exit(0);
  } catch (error) {
    log('ERROR', error && error.stack ? error.stack : String(error));
    await finalizarExecucao(runId, {
      status: 'ERRO',
      erro: error && error.stack ? error.stack : String(error),
      raw: { data_ref: dataYmd, raio_m: RAIO_M }
    }).catch(function () {});
    process.exit(1);
  }
}

if (require.main === module) {
  main();
  setTimeout(function () {
    log('ERROR', 'Timeout geral do agente atingido.');
    if (browserAtual) {
      browserAtual.close().catch(function () {});
    }
    process.exit(1);
  }, Number(process.env.CARGAS_AGENT_TIMEOUT_MS || 280000));
}

module.exports = {
  baixarRelatorioCargasHoje: baixarRelatorioCargasHoje,
  lerRelatorioCargas: lerRelatorioCargas,
  buscarLocalOs: buscarLocalOs,
  haversineMeters: haversineMeters
};
