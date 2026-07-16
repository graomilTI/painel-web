#!/usr/bin/env node
/*
 * GRM Server - Relatório de Login x Refeição (Café/Almoço/Janta)
 *
 * Fluxo:
 * 1. Loga no GRM Server.
 * 2. Abre /report/classification/staff/loginReport.
 * 3. Preenche o período de hoje até amanhã.
 * 4. Mantém o filtro "Possui Movimento?" sem alteração.
 * 5. Clica em Gerar Relatório e aguarda o botão XLS ficar habilitado.
 * 6. Baixa o XLS, capturando arquivo do Chrome, resposta HTTP ou Blob gerado pela página.
 * 7. Grava os registros em grm_login_movimentos_importacoes.
 * 8. Classifica cada login por turno (TURNOS abaixo: Café 04:00-07:00, Almoço 05:00-19:00,
 *    Janta 19:00-00:00) e compara a posição do colaborador com o ponto de embarque
 *    (ponto1_*) da O.S. PLANEJADA pra esse colaborador naquele dia (operacional_os_colaboradores
 *    + operacional_os) — não com qualquer Local de Embarque do sistema. Sem O.S. planejada
 *    pro colaborador naquele dia, não há embarque pra corresponder e ele não fica elegível.
 * 9. Se o login estiver a até 1 km do embarque da O.S. planejada, relaciona o colaborador em
 *    financeiro_alimentacao_colaboradores (coluna tipo_beneficio = CAFE/ALMOCO/JANTA), 1
 *    linha por dia+colaborador+turno — um colaborador pode aparecer nos 3 turnos no mesmo
 *    dia. Se houver mais de um login dentro do mesmo turno, fica só o mais próximo do
 *    embarque. O relatório do GRM só traz o login MAIS RECENTE do colaborador, então a
 *    elegibilidade é recalculada a cada execução a partir do HISTÓRICO acumulado em
 *    grm_login_movimentos_importacoes (não do relatório desta execução isolada) — assim um
 *    check-in válido dentro da janela não some se o colaborador logar de novo em outro
 *    lugar antes da próxima checagem. Agendado via pg_cron pra rodar várias vezes dentro de
 *    cada janela (ver migration 20260712150000_cron_sync_login_alimentacao_turnos.sql).
 *
 * Compatível com o padrão dos agentes Puppeteer/Supabase do cPanel/WHM.
 */

process.env.TMPDIR = process.env.TMPDIR || '/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMPDIR;
process.env.TMP = process.env.TMP || process.env.TMPDIR;
process.env.HOME = process.env.HOME || process.env.TMPDIR;
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || process.env.TMPDIR + '/.cache';
process.env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || process.env.TMPDIR + '/.config';

require('dotenv').config();

var puppeteer = require('puppeteer-extra');
var StealthPlugin = require('puppeteer-extra-plugin-stealth');
var XLSX = require('xlsx');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var WebSocket = require('ws');
var createClient = require('@supabase/supabase-js').createClient;

puppeteer.use(StealthPlugin());

var SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
var GRM_USER = process.env.GRMSERVER_USER;
var GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

var TIMEZONE = process.env.LOGIN_REPORT_TIMEZONE || 'America/Sao_Paulo';
var RAIO_M = Number(process.env.ALIMENTACAO_RAIO_M || 1000);
var TURNOS = [
  { tipo: 'CAFE', inicio: process.env.CAFE_HORA_INICIO || '04:00', fim: process.env.CAFE_HORA_FIM || '07:00' },
  { tipo: 'ALMOCO', inicio: process.env.ALMOCO_HORA_INICIO || process.env.ALIMENTACAO_HORA_INICIO || '05:00', fim: process.env.ALMOCO_HORA_FIM || process.env.ALIMENTACAO_HORA_FIM || '19:00' },
  { tipo: 'JANTA', inicio: process.env.JANTA_HORA_INICIO || '19:00', fim: process.env.JANTA_HORA_FIM || '00:00' }
];
var DOWNLOAD_TIMEOUT_MS = Number(process.env.LOGIN_REPORT_DOWNLOAD_TIMEOUT_MS || 120000);
var WAIT_AFTER_GENERATE_MS = Number(process.env.LOGIN_REPORT_WAIT_AFTER_GENERATE_MS || 3000);
var XLS_READY_TIMEOUT_MS = Number(process.env.LOGIN_REPORT_XLS_READY_TIMEOUT_MS || 180000);
var XLS_READY_POLL_MS = Number(process.env.LOGIN_REPORT_XLS_READY_POLL_MS || 1000);
var MAX_LOCAL_ROWS = Number(process.env.ALIMENTACAO_MAX_LOCAL_ROWS || 20000);
var MAX_MOVIMENTOS_ROWS = Number(process.env.ALIMENTACAO_MAX_MOVIMENTOS_ROWS || 50000);
var DEBUG = String(process.env.GRM_DEBUG || '').toLowerCase() === 'true';

var REPORT_CONFIG = {
  name: 'Relatório de Login - Alimentação',
  url: process.env.LOGIN_REPORT_URL || 'https://www.grmserver.com.br/report/classification/staff/loginReport',
  tableImportacoes: process.env.LOGIN_REPORT_TABLE || 'grm_login_movimentos_importacoes',
  tableAlimentacao: process.env.ALIMENTACAO_TABLE || 'financeiro_alimentacao_colaboradores',
  tableExecucoes: process.env.LOGIN_REPORT_RUNS_TABLE || 'grm_login_alimentacao_execucoes',
  origem: 'grm_relatorio_login',
  dateFromSelectors: splitEnv(process.env.LOGIN_REPORT_DATE_FROM_SELECTORS || [
    '#requestDateFrom',
    '#loginDateFrom',
    '#staffLoginDateFrom',
    '#staLoginDateFrom',
    '#dateFrom',
    'input[name="dateFrom"]',
    'input[name="requestDateFrom"]'
  ].join(',')),
  dateToSelectors: splitEnv(process.env.LOGIN_REPORT_DATE_TO_SELECTORS || [
    '#requestDateTo',
    '#loginDateTo',
    '#staffLoginDateTo',
    '#staLoginDateTo',
    '#dateTo',
    'input[name="dateTo"]',
    'input[name="requestDateTo"]'
  ].join(',')),
  updateSelectors: splitEnv(process.env.LOGIN_REPORT_UPDATE_SELECTORS || [
    '.staffLoginReport-act-update button',
    '.loginReport-act-update button',
    '.staffLogin-act-update button',
    '[class*="loginReport"][class*="act-update"] button',
    '[class*="act-update"] button'
  ].join(',')),
  xlsSelectors: splitEnv(process.env.LOGIN_REPORT_XLS_SELECTORS || [
    '.loginReport-report-to-xls button',
    '.staffLoginReport-report-to-xls button',
    '.staffLogin-report-to-xls button',
    '[class*="loginReport"][class*="xls"] button',
    '[class*="report-to-xls"] button',
    '[class*="xls"] button'
  ].join(','))
};

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
  auth: { persistSession: false, autoRefreshToken: false }
});

var browserAtual = null;

var ALIASES = {
  colaborador: splitEnv('Funcionário,Funcionario,Colaborador,Nome do Funcionário,Nome do Funcionario,Nome Funcionário,Nome Funcionario,Staff,staName,staffName,employeeName,nome_colaborador,colaborador_nome'),
  cpf: splitEnv('CPF,CPF Funcionário,CPF Funcionario,staCPF,staffCPF,employeeCpf,cpf_colaborador'),
  codigo: splitEnv('Código Funcionário,Codigo Funcionario,Código,Codigo,Matrícula,Matricula,staCode,staffCode,employeeCode,idFuncionario,id_funcionario'),
  coordenacao: splitEnv('Coordenação,Coordenacao,olcName,coordinationName,coordenacao'),
  supervisao: splitEnv('Supervisão,Supervisao,olsName,supervisionName,supervisao'),
  uf: splitEnv('UF de Embarque,UF Embarque,UF,Estado,uf,estado'),
  cidade: splitEnv('Cidade de Embarque,Cidade Embarque,Cidade,cidade,cidade_embarque'),
  local: splitEnv('Local de Serviço,Local de Servico,Local Serviço,Local Servico,Local de Embarque,Local Embarque,Local,Armazém,Armazem,local_servico,embarque,ponto1_nome'),
  dataHora: splitEnv('Data/Hora,Data e Hora,Data Hora,Data do Login,Data Login,Data do Movimento,Data Movimento,Data Registro,Data de Registro,Login,Data Acesso,Data do Acesso,createdAt,created_at,loginDateTime,movementDateTime,staLoginDate'),
  data: splitEnv('Data,Data Login,Data do Login,Data Movimento,Data do Movimento,Data Registro,Data de Registro,Dia,loginDate,movementDate,staDate'),
  hora: splitEnv('Hora,Horário,Horario,Hora Login,Hora do Login,Hora Movimento,Hora do Movimento,Hora Registro,Hora Cad.,Hora Cadastro,loginTime,movementTime,staTime'),
  latitude: splitEnv('Latitude,Lat,latitude,lat,Latitude Login,Latitude do Login,Latitude Movimento,Latitude do Movimento,loginLatitude,movementLatitude,staLatitude,gpsLatitude'),
  longitude: splitEnv('Longitude,Lng,Long,longitude,lng,long,Longitude Login,Longitude do Login,Longitude Movimento,Longitude do Movimento,loginLongitude,movementLongitude,staLongitude,gpsLongitude'),
  possuiMovimento: splitEnv('Possui Movimento,Possui Movimento?,Movimento,Tem Movimento,Com Movimento,possui_movimento,hasMovement,movement,staMovement'),
  tipoMovimento: splitEnv('Tipo Movimento,Tipo de Movimento,Evento,Ação,Acao,Tipo,Tipo Login,movementType,eventType'),
  dispositivo: splitEnv('Dispositivo,Aparelho,Device,deviceName,device_id,deviceId'),
  precisao: splitEnv('Precisão,Precisao,Accuracy,accuracy,Precisão GPS,Precisao GPS')
};

function log(level, msg) {
  console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg);
}

function splitEnv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function assertConfig() {
  var missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
  if (!GRM_USER) missing.push('GRMSERVER_USER');
  if (!GRM_PASSWORD) missing.push('GRMSERVER_PASSWORD');
  if (missing.length) throw new Error('Variáveis ausentes: ' + missing.join(', '));
  if (!Number.isFinite(RAIO_M) || RAIO_M <= 0) throw new Error('ALIMENTACAO_RAIO_M inválido.');
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

function normalizeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function clean(value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  return s === '' ? null : s;
}

function onlyDigits(value) {
  var s = String(value || '').replace(/\D/g, '');
  return s || null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  var s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s.replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isValidCoord(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 &&
    !(Number(lat) === 0 && Number(lng) === 0);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function formatYmdInTimeZone(date, timeZone) {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  var map = {};
  parts.forEach(function (p) { map[p.type] = p.value; });
  return map.year + '-' + map.month + '-' + map.day;
}

function addDaysYmd(ymd, days) {
  var p = String(ymd).split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function ymdToBr(ymd) {
  var p = String(ymd).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function brOrIsoToYmd(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  if (typeof value === 'number' && value > 20000) {
    var parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
  }
  var s = String(value).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  return null;
}

function extractTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0') + ':' + String(value.getSeconds()).padStart(2, '0');
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    var total = Math.round(value * 24 * 60 * 60);
    var hh = Math.floor(total / 3600) % 24;
    var mm = Math.floor((total % 3600) / 60);
    var ss = total % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }
  var s = String(value).trim();
  var m = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/);
  if (!m) return null;
  return String(m[1]).padStart(2, '0') + ':' + m[2] + ':' + String(m[3] || '00').padStart(2, '0');
}

function parseDateTimeFromRow(row) {
  var combined = findByAliasesDeep(row, ALIASES.dataHora);
  var dateYmd = brOrIsoToYmd(combined);
  var time = extractTime(combined);

  if (!dateYmd) dateYmd = brOrIsoToYmd(findByAliasesDeep(row, ALIASES.data));
  if (!time) time = extractTime(findByAliasesDeep(row, ALIASES.hora));

  return { data: dateYmd, hora: time };
}

function timeToMinutes(value) {
  var m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseBooleanMovement(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  var n = normalizeText(value);
  if (['NAO', 'N', 'FALSE', '0', 'SEM MOVIMENTO'].indexOf(n) !== -1) return false;
  if (['SIM', 'S', 'TRUE', '1', 'COM MOVIMENTO'].indexOf(n) !== -1) return true;
  return true;
}

function findByAliasesDeep(obj, aliases) {
  if (!obj || typeof obj !== 'object') return null;
  var wanted = {};
  aliases.forEach(function (a) { wanted[normalizeText(a)] = true; });
  var queue = [{ value: obj, depth: 0 }];
  var seen = [];

  while (queue.length) {
    var item = queue.shift();
    var current = item.value;
    if (!current || typeof current !== 'object') continue;
    if (seen.indexOf(current) !== -1) continue;
    seen.push(current);

    var keys = Object.keys(current);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = current[key];
      if (wanted[normalizeText(key)] && value !== null && value !== undefined && value !== '') return value;
    }
    if (item.depth < 3) {
      for (var j = 0; j < keys.length; j++) {
        var child = current[keys[j]];
        if (child && typeof child === 'object' && !Array.isArray(child)) queue.push({ value: child, depth: item.depth + 1 });
      }
    }
  }
  return null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = function (v) { return Number(v) * Math.PI / 180; };
  var dLat = toRad(Number(lat2) - Number(lat1));
  var dLng = toRad(Number(lng2) - Number(lng1));
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    if (page.url().indexOf('/login') === -1) { ok = true; break; }
  }
  if (!ok) throw new Error('Login falhou: a página não saiu de /login após 45s.');
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
    if (setter && setter.set) setter.set.call(input, payload.value);
    else input.value = payload.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector: selector, value: String(value) });
}

async function typeFirstSelector(page, selectors, value) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var handle = await page.$(selectors[i]);
      if (handle) {
        await clearAndType(page, selectors[i], value);
        return selectors[i];
      }
    } catch (e) {}
  }
  return null;
}

async function fillDateRange(page, fromBr, toBr) {
  log('INFO', 'Preenchendo período: ' + fromBr + ' até ' + toBr);

  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function expectedDigits(br) {
    var p = String(br || '').split('/');
    return p.length === 3 ? p[0] + p[1] + p[2] : digits(br);
  }

  async function setVisibleField(selectors, value, label) {
    for (var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      try {
        var handles = await page.$$(selector);
        for (var j = 0; j < handles.length; j++) {
          var state = await handles[j].evaluate(function (el) {
            var r = el.getBoundingClientRect();
            var st = window.getComputedStyle(el);
            return {
              visible: r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden',
              disabled: !!el.disabled || el.readOnly,
              id: el.id || '',
              name: el.name || '',
              placeholder: el.placeholder || '',
              value: el.value || ''
            };
          });
          if (!state.visible || state.disabled) continue;

          await handles[j].click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await handles[j].type(String(value), { delay: 35 });
          await page.keyboard.press('Tab');
          await wait(250);

          var actual = await handles[j].evaluate(function (el) { return el.value || ''; });
          if (digits(actual) === expectedDigits(value)) {
            log('INFO', label + ' preenchida em ' + selector + ' (id=' + (state.id || '-') + '): ' + actual);
            return { selector: selector, id: state.id, value: actual };
          }

          await handles[j].evaluate(function (el, val) {
            var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            var setter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (setter && setter.set) setter.set.call(el, val); else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          }, String(value));
          await wait(250);
          actual = await handles[j].evaluate(function (el) { return el.value || ''; });
          if (digits(actual) === expectedDigits(value)) {
            log('INFO', label + ' preenchida em ' + selector + ' (id=' + (state.id || '-') + '): ' + actual);
            return { selector: selector, id: state.id, value: actual };
          }
        }
      } catch (e) {}
    }
    return null;
  }

  var fromField = await setVisibleField(REPORT_CONFIG.dateFromSelectors, fromBr, 'Data inicial');
  var toField = await setVisibleField(REPORT_CONFIG.dateToSelectors, toBr, 'Data final');

  if (!fromField || !toField || (fromField.selector === toField.selector && fromField.id === toField.id)) {
    var fallback = await page.evaluate(function (payload) {
      function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
      function visible(el) {
        var r = el.getBoundingClientRect();
        var st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      }
      function ctx(input) {
        var p = input, out = '';
        for (var i = 0; i < 5 && p; i++, p = p.parentElement) out += ' ' + norm(p.innerText || p.textContent || '');
        return out;
      }
      function setValue(input, value) {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        input.focus();
        if (setter && setter.set) setter.set.call(input, value); else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      var inputs = Array.from(document.querySelectorAll('input')).filter(visible).filter(function (input) {
        var own = norm((input.id || '') + ' ' + (input.name || '') + ' ' + (input.placeholder || '') + ' ' + (input.getAttribute('aria-label') || ''));
        var all = own + ' ' + ctx(input);
        return all.indexOf('DATA') !== -1 || all.indexOf('DATE') !== -1 || /^\d{2}\/\d{2}\/\d{4}$/.test(input.value || '');
      });
      if (inputs.length < 2) return { ok: false, count: inputs.length };
      setValue(inputs[0], payload.from);
      setValue(inputs[1], payload.to);
      return {
        ok: true,
        count: inputs.length,
        from: { id: inputs[0].id || '', name: inputs[0].name || '', value: inputs[0].value || '' },
        to: { id: inputs[1].id || '', name: inputs[1].name || '', value: inputs[1].value || '' }
      };
    }, { from: fromBr, to: toBr });

    if (!fallback || !fallback.ok) {
      throw new Error('Não consegui identificar os dois campos visíveis de data. Inputs encontrados: ' + (fallback ? fallback.count : 0));
    }
    fromField = fallback.from;
    toField = fallback.to;
    log('INFO', 'Datas preenchidas pelo fallback visual: de=' + fallback.from.value + ' até=' + fallback.to.value);
  }

  var snapshot = await page.evaluate(function () {
    function visible(el) {
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    }
    return Array.from(document.querySelectorAll('input')).filter(visible).map(function (el) {
      return { id: el.id || '', name: el.name || '', placeholder: el.placeholder || '', value: el.value || '' };
    }).filter(function (x) {
      return /data|date|\d{2}\/\d{2}\/\d{4}/i.test(x.id + ' ' + x.name + ' ' + x.placeholder + ' ' + x.value);
    });
  });
  log('INFO', 'Campos de data visíveis após preenchimento: ' + JSON.stringify(snapshot));

  var values = snapshot.map(function (x) { return digits(x.value); });
  if (values.indexOf(expectedDigits(fromBr)) === -1 || values.indexOf(expectedDigits(toBr)) === -1) {
    throw new Error('As datas não permaneceram nos campos visíveis após o preenchimento. Estado: ' + JSON.stringify(snapshot));
  }
}

async function selectVuetifyOptionNearLabel(page, labels, optionText) {
  var clicked = await page.evaluate(function (payload) {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
    function visible(el) {
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    }
    var wanted = payload.labels.map(norm);
    var fields = Array.from(document.querySelectorAll('.v-input, .v-field, .v-select, .v-autocomplete, .v-text-field')).filter(visible);
    for (var i = 0; i < fields.length; i++) {
      var txt = norm(fields[i].innerText || fields[i].textContent || '');
      if (!wanted.some(function (w) { return txt.indexOf(w) !== -1; })) continue;
      var input = fields[i].querySelector('input');
      var target = input || fields[i].querySelector('[role="combobox"]') || fields[i];
      target.click();
      return true;
    }
    return false;
  }, { labels: labels });

  if (!clicked) return false;
  await wait(700);

  var selected = await page.evaluate(function (optionText) {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
    var wanted = norm(optionText);
    var root = document.querySelector('.v-overlay--active') || document;
    var options = Array.from(root.querySelectorAll('[role="option"], .v-list-item'));
    var target = options.find(function (o) { return norm(o.innerText || o.textContent || '') === wanted; }) ||
      options.find(function (o) { return norm(o.innerText || o.textContent || '').indexOf(wanted) !== -1; });
    if (!target) return false;
    target.click();
    return true;
  }, optionText);

  await wait(600);
  return selected;
}

async function selectPossuiMovimentoSim(page) {
  log('INFO', 'Selecionando "Sim" em "Possui Movimento?"...');
  var ok = await selectVuetifyOptionNearLabel(page, ['Possui Movimento?', 'Possui Movimento', 'Movimento'], 'Sim');
  if (!ok) throw new Error('Não consegui selecionar "Sim" no filtro "Possui Movimento?".');
  log('SUCCESS', 'Filtro Possui Movimento = Sim selecionado');
}

async function clickFirstSelector(page, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var handle = await page.$(selectors[i]);
      if (!handle) continue;
      var state = await handle.evaluate(function (el) {
        var r = el.getBoundingClientRect();
        var st = window.getComputedStyle(el);
        return {
          visible: r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden',
          disabled: !!el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || String(el.className || '').indexOf('v-btn--disabled') !== -1
        };
      });
      if (!state.visible || state.disabled) continue;
      await handle.evaluate(function (el) { el.scrollIntoView({ block: 'center', inline: 'center' }); });
      await wait(250);
      await handle.click({ delay: 120 });
      return true;
    } catch (e) {}
  }
  return false;
}

async function clickButtonByText(page, texts) {
  return page.evaluate(function (texts) {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
    var wanted = texts.map(norm);
    var buttons = Array.from(document.querySelectorAll('button, [role="button"], .v-btn'));
    for (var i = 0; i < buttons.length; i++) {
      var txt = norm((buttons[i].innerText || buttons[i].textContent || '') + ' ' + (buttons[i].getAttribute('title') || '') + ' ' + (buttons[i].getAttribute('aria-label') || ''));
      if (wanted.some(function (w) { return txt.indexOf(w) !== -1; })) {
        buttons[i].click();
        return true;
      }
    }
    return false;
  }, texts);
}

async function generateReport(page) {
  log('INFO', 'Clicando em "Gerar Relatório"...');
  await page.keyboard.press('Escape');
  await wait(300);

  var traffic = [];
  var onRequest = function (req) {
    try {
      var type = req.resourceType();
      if (type === 'xhr' || type === 'fetch' || type === 'document') {
        traffic.push({ method: req.method(), url: req.url(), type: type, at: Date.now() });
      }
    } catch (e) {}
  };
  page.on('request', onRequest);

  async function buttonState(handle) {
    return handle.evaluate(function (el) {
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      var chain = [];
      var p = el;
      for (var i = 0; i < 5 && p; i++, p = p.parentElement) {
        if (p.className) chain.push(String(p.className));
      }
      return {
        visible: r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden',
        disabled: !!el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || String(el.className || '').indexOf('v-btn--disabled') !== -1,
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        className: String(el.className || ''),
        ancestors: chain.join(' | '),
        html: String(el.outerHTML || '').slice(0, 700)
      };
    });
  }

  var clicked = false;
  var clickedDescription = '';
  var preferredSelectors = [
    '.loginReport-act-update button',
    '.staffLoginReport-act-update button',
    '.staffLogin-act-update button',
    '[class*="loginReport"][class*="act-update"] button'
  ];

  for (var i = 0; i < preferredSelectors.length && !clicked; i++) {
    try {
      var exact = await page.$(preferredSelectors[i]);
      if (!exact) continue;
      var exactState = await buttonState(exact);
      log('INFO', 'Candidato Gerar por seletor ' + preferredSelectors[i] + ': ' + JSON.stringify(exactState));
      if (!exactState.visible || exactState.disabled) continue;
      await exact.evaluate(function (el) { el.scrollIntoView({ block: 'center', inline: 'center' }); });
      await wait(250);
      await exact.click({ delay: 180 });
      clicked = true;
      clickedDescription = preferredSelectors[i];
    } catch (e) {
      log('WARN', 'Falha no candidato ' + preferredSelectors[i] + ': ' + e.message);
    }
  }

  if (!clicked) {
    var icons = await page.$$('lord-icon[src*="76-newspaper-outline.json"]');
    for (var j = 0; j < icons.length && !clicked; j++) {
      try {
        var buttonHandle = await icons[j].evaluateHandle(function (icon) { return icon.closest('button'); });
        var button = buttonHandle && buttonHandle.asElement ? buttonHandle.asElement() : null;
        if (!button) continue;
        var state = await buttonState(button);
        log('INFO', 'Candidato Gerar pelo ícone #' + (j + 1) + ': ' + JSON.stringify(state));
        var context = String(state.ancestors || '').toLowerCase();
        if (!state.visible || state.disabled) continue;
        if (context.indexOf('report-to-xls') !== -1) continue;
        if (icons.length > 1 && context.indexOf('loginreport') === -1) continue;
        await button.evaluate(function (el) { el.scrollIntoView({ block: 'center', inline: 'center' }); });
        await wait(250);
        await button.click({ delay: 180 });
        clicked = true;
        clickedDescription = 'ícone 76-newspaper-outline.json #' + (j + 1);
      } catch (e) {
        log('WARN', 'Falha ao clicar no candidato pelo ícone: ' + e.message);
      }
    }
  }

  if (!clicked) throw new Error('Botão "Gerar Relatório" não encontrado ou estava desabilitado.');
  log('SUCCESS', 'Ação inicial de Gerar Relatório clicada por ' + clickedDescription + '.');
  await wait(1200);

  var modalResult = await page.evaluate(function () {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
    function visible(el) {
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    }
    var roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .v-dialog'));
    var buttons = [];
    roots.forEach(function (root) {
      Array.from(root.querySelectorAll('button, [role="button"]')).forEach(function (b) {
        if (buttons.indexOf(b) === -1 && visible(b)) buttons.push(b);
      });
    });
    var wanted = ['GERAR RELATORIO', 'GERAR', 'CONFIRMAR', 'OK'];
    for (var i = 0; i < buttons.length; i++) {
      var txt = norm((buttons[i].innerText || buttons[i].textContent || '') + ' ' + (buttons[i].getAttribute('aria-label') || '') + ' ' + (buttons[i].getAttribute('title') || ''));
      var disabled = !!buttons[i].disabled || buttons[i].hasAttribute('disabled') || buttons[i].getAttribute('aria-disabled') === 'true' || String(buttons[i].className || '').indexOf('v-btn--disabled') !== -1;
      if (disabled) continue;
      if (wanted.some(function (w) { return txt === w || txt.indexOf(w) !== -1; }) && txt.indexOf('CANCEL') === -1 && txt.indexOf('FECHAR') === -1) {
        buttons[i].click();
        return { clicked: true, text: txt };
      }
    }
    return {
      clicked: false,
      dialogs: roots.map(function (r) { return String(r.innerText || r.textContent || '').trim().slice(0, 500); }).filter(Boolean)
    };
  });
  if (modalResult && modalResult.clicked) {
    log('SUCCESS', 'Confirmação do modal clicada: ' + modalResult.text);
    await wait(1200);
  } else if (modalResult && modalResult.dialogs && modalResult.dialogs.length) {
    log('INFO', 'Overlay/modal encontrado sem botão automático compatível: ' + JSON.stringify(modalResult.dialogs));
  }

  var started = Date.now();
  while (Date.now() - started < Number(process.env.LOGIN_REPORT_REQUEST_CONFIRM_TIMEOUT_MS || 30000)) {
    if (traffic.length) break;
    await wait(500);
  }
  page.removeListener('request', onRequest);

  if (traffic.length) {
    log('SUCCESS', 'Tráfego após Gerar Relatório: ' + JSON.stringify(traffic.slice(0, 12)));
  } else {
    var notices = await page.evaluate(function () {
      function visible(el) {
        var r = el.getBoundingClientRect();
        var st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      }
      return Array.from(document.querySelectorAll('.v-snackbar, .v-alert, .v-messages, .v-field__details, [role="alert"]'))
        .filter(visible)
        .map(function (el) { return String(el.innerText || el.textContent || '').trim(); })
        .filter(Boolean)
        .slice(0, 20);
    });
    log('WARN', 'Nenhuma chamada XHR/fetch foi detectada após Gerar Relatório. Avisos visíveis: ' + JSON.stringify(notices));
  }

  await wait(WAIT_AFTER_GENERATE_MS);
}

function startApiCapture(page) {
  var captured = [];
  page.on('response', async function (response) {
    try {
      var request = response.request();
      var url = response.url();
      var ct = String(response.headers()['content-type'] || '').toLowerCase();
      var relevant = request.method() === 'POST' &&
        (url.toLowerCase().indexOf('loginreport') !== -1 || url.toLowerCase().indexOf('stafflogin') !== -1 || url.toLowerCase().indexOf('/api/') !== -1) &&
        ct.indexOf('json') !== -1;
      if (!relevant) return;
      var body = await response.json();
      captured.push({ url: url, body: body, at: Date.now() });
    } catch (e) {}
  });
  return captured;
}

function xlsButtonEnabledInDom(button) {
  if (!button) return false;
  if (button.disabled) return false;
  if (button.getAttribute('disabled') !== null) return false;
  if (button.getAttribute('aria-disabled') === 'true') return false;
  if (String(button.className || '').indexOf('v-btn--disabled') !== -1) return false;
  var parentDisabled = button.closest('[disabled], [aria-disabled="true"], .v-btn--disabled');
  return !parentDisabled || parentDisabled === button;
}

async function waitForXlsReady(page) {
  log('INFO', 'Aguardando o botão XLS ficar habilitado: .loginReport-report-to-xls button');
  var started = Date.now();
  var lastState = null;

  while (Date.now() - started < XLS_READY_TIMEOUT_MS) {
    var state = await page.evaluate(function (selectors) {
      function visible(el) {
        if (!el) return false;
        var r = el.getBoundingClientRect();
        var st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      }
      function enabled(button) {
        if (!button || !visible(button)) return false;
        if (button.disabled || button.hasAttribute('disabled')) return false;
        if (button.getAttribute('aria-disabled') === 'true') return false;
        if (String(button.className || '').indexOf('v-btn--disabled') !== -1) return false;
        var wrapper = button.closest('[disabled], [aria-disabled="true"], .v-btn--disabled');
        return !wrapper || wrapper === button;
      }
      for (var i = 0; i < selectors.length; i++) {
        var button = document.querySelector(selectors[i]);
        if (!button) continue;
        return {
          found: true,
          enabled: enabled(button),
          selector: selectors[i],
          disabled: !!button.disabled,
          ariaDisabled: button.getAttribute('aria-disabled'),
          className: String(button.className || '')
        };
      }
      return { found: false, enabled: false };
    }, REPORT_CONFIG.xlsSelectors);

    lastState = state;
    if (state && state.enabled) {
      log('SUCCESS', 'Botão XLS habilitado após ' + Math.round((Date.now() - started) / 1000) + 's.');
      return state.selector;
    }
    await wait(XLS_READY_POLL_MS);
  }

  throw new Error('Botão XLS não ficou habilitado em ' + XLS_READY_TIMEOUT_MS + ' ms. Estado final: ' + JSON.stringify(lastState));
}

function sanitizeDownloadName(name) {
  var value = String(name || 'Relatorio-de-Login.xlsx')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return value || 'Relatorio-de-Login.xlsx';
}

function spreadsheetKind(buffer) {
  if (!buffer || !buffer.length) return null;
  // XLSX é um ZIP (PK); XLS legado é um arquivo OLE Compound Document.
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return 'xlsx';
  if (buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1) return 'xls';
  return null;
}

function ensureSpreadsheetExtension(name, kind) {
  var safe = sanitizeDownloadName(name);
  if (/\.xlsx?$/i.test(safe)) return safe;
  return safe + '.' + (kind || 'xlsx');
}

function listDownloadEntries(dir) {
  try {
    return fs.readdirSync(dir).map(function (name) {
      var full = path.join(dir, name);
      var st = fs.statSync(full);
      return { name: name, path: full, size: st.size, mtime: st.mtimeMs, isFile: st.isFile() };
    }).sort(function (a, b) { return b.mtime - a.mtime; });
  } catch (e) {
    return [];
  }
}

function findDownloadedSpreadsheet(dir, startedAt) {
  var entries = listDownloadEntries(dir).filter(function (entry) {
    if (!entry.isFile || entry.size <= 0 || entry.mtime < startedAt - 3000) return false;
    var lower = entry.name.toLowerCase();
    return !lower.endsWith('.crdownload') && !lower.endsWith('.tmp');
  });

  for (var i = 0; i < entries.length; i++) {
    try {
      var fd = fs.openSync(entries[i].path, 'r');
      var head = Buffer.alloc(8);
      fs.readSync(fd, head, 0, 8, 0);
      fs.closeSync(fd);
      var kind = spreadsheetKind(head);
      if (!kind) continue;
      if (!/\.xlsx?$/i.test(entries[i].name)) {
        var renamed = path.join(dir, ensureSpreadsheetExtension(entries[i].name, kind));
        if (renamed !== entries[i].path) {
          try { fs.renameSync(entries[i].path, renamed); entries[i].path = renamed; } catch (e) {}
        }
      }
      return entries[i].path;
    } catch (e) {}
  }
  return null;
}

async function setChromeDownloadDir(page, dir) {
  var client = await page.target().createCDPSession();
  var configured = [];
  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: dir,
      eventsEnabled: true
    });
    configured.push('Browser.setDownloadBehavior');
  } catch (e1) {
    log('WARN', 'Browser.setDownloadBehavior não disponível: ' + e1.message);
  }
  try {
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    configured.push('Page.setDownloadBehavior');
  } catch (e2) {
    try {
      await page._client().send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
      configured.push('Page.setDownloadBehavior(_client)');
    } catch (e3) {
      if (!configured.length) throw new Error('Não consegui configurar a pasta de download do Chrome: ' + e3.message);
    }
  }
  log('INFO', 'Download do Chrome configurado por: ' + configured.join(' + '));
  return client;
}

async function installPageDownloadCapture(page) {
  await page.evaluate(function () {
    if (window.__grmDownloadCaptureInstalled) return;
    window.__grmDownloadCaptureInstalled = true;
    window.__grmDownloadCapture = { items: [], errors: [] };
    var blobByUrl = {};
    var originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (object) {
      var url = originalCreateObjectURL(object);
      try {
        if (object && typeof Blob !== 'undefined' && object instanceof Blob) blobByUrl[url] = object;
      } catch (e) {}
      return url;
    };

    function captureBlob(blob, name, source) {
      try {
        var reader = new FileReader();
        reader.onloadend = function () {
          try {
            var result = String(reader.result || '');
            var comma = result.indexOf(',');
            window.__grmDownloadCapture.items.push({
              name: name || 'Relatorio-de-Login.xlsx',
              source: source,
              base64: comma >= 0 ? result.slice(comma + 1) : result,
              type: blob.type || '',
              size: blob.size || 0
            });
          } catch (e) {
            window.__grmDownloadCapture.errors.push(String(e && e.message || e));
          }
        };
        reader.onerror = function () {
          window.__grmDownloadCapture.errors.push('FileReader falhou ao capturar o Blob.');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        window.__grmDownloadCapture.errors.push(String(e && e.message || e));
      }
    }

    var originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      try {
        var href = this.href || this.getAttribute('href') || '';
        var name = this.download || 'Relatorio-de-Login.xlsx';
        if (blobByUrl[href]) {
          captureBlob(blobByUrl[href], name, 'anchor-blob');
        } else if (/^data:/i.test(href)) {
          var comma = href.indexOf(',');
          var meta = comma >= 0 ? href.slice(0, comma) : '';
          var payload = comma >= 0 ? href.slice(comma + 1) : '';
          if (meta.indexOf(';base64') === -1) {
            try { payload = btoa(unescape(encodeURIComponent(decodeURIComponent(payload)))); } catch (e) {}
          }
          window.__grmDownloadCapture.items.push({ name: name, source: 'anchor-data', base64: payload, type: meta, size: payload.length });
        }
      } catch (e) {
        window.__grmDownloadCapture.errors.push(String(e && e.message || e));
      }
      return originalAnchorClick.apply(this, arguments);
    };
  });
}

async function saveCapturedPageDownload(page, dir) {
  var item = await page.evaluate(function () {
    var cap = window.__grmDownloadCapture;
    if (!cap || !cap.items || !cap.items.length) return null;
    return cap.items.shift();
  });
  if (!item || !item.base64) return null;
  var buffer = Buffer.from(item.base64, 'base64');
  var kind = spreadsheetKind(buffer);
  if (!kind) {
    log('WARN', 'Download capturado no DOM não tem assinatura XLS/XLSX (fonte=' + item.source + ', tipo=' + item.type + ', bytes=' + buffer.length + ').');
    return null;
  }
  var filePath = path.join(dir, ensureSpreadsheetExtension(item.name, kind));
  fs.writeFileSync(filePath, buffer);
  log('SUCCESS', 'XLS capturado diretamente do Blob/data URI da página: ' + filePath + ' (' + buffer.length + ' bytes)');
  return filePath;
}

function looksLikeSpreadsheetResponse(response) {
  try {
    var headers = response.headers();
    var ct = String(headers['content-type'] || '').toLowerCase();
    var cd = String(headers['content-disposition'] || '').toLowerCase();
    var url = String(response.url() || '').toLowerCase();
    return cd.indexOf('attachment') !== -1 ||
      ct.indexOf('spreadsheet') !== -1 || ct.indexOf('ms-excel') !== -1 ||
      ct.indexOf('application/octet-stream') !== -1 ||
      url.indexOf('xls') !== -1 || url.indexOf('excel') !== -1 || url.indexOf('export') !== -1;
  } catch (e) {
    return false;
  }
}

function filenameFromDisposition(value) {
  var text = String(value || '');
  var utf = /filename\*=UTF-8''([^;]+)/i.exec(text);
  if (utf) {
    try { return decodeURIComponent(utf[1].replace(/["']/g, '')); } catch (e) { return utf[1]; }
  }
  var simple = /filename\s*=\s*"?([^";]+)"?/i.exec(text);
  return simple ? simple[1].trim() : null;
}

async function waitForDownloadedXls(page, dir, startedAt, networkState, downloadState) {
  var started = Date.now();
  var lastDirectoryLog = 0;
  while (Date.now() - started < DOWNLOAD_TIMEOUT_MS) {
    if (networkState.filePath && fs.existsSync(networkState.filePath)) return networkState.filePath;

    var pageCaptured = await saveCapturedPageDownload(page, dir);
    if (pageCaptured) return pageCaptured;

    var diskFile = findDownloadedSpreadsheet(dir, startedAt);
    if (diskFile) return diskFile;

    if (Date.now() - lastDirectoryLog > 15000) {
      lastDirectoryLog = Date.now();
      var entries = listDownloadEntries(dir).map(function (entry) {
        return { name: entry.name, size: entry.size, ageMs: Math.round(Date.now() - entry.mtime) };
      });
      log('INFO', 'Estado do download: eventos=' + JSON.stringify(downloadState.events.slice(-5)) + '; arquivos=' + JSON.stringify(entries));
    }
    await wait(500);
  }
  throw new Error('Download XLS não concluiu em ' + DOWNLOAD_TIMEOUT_MS + ' ms. Eventos CDP: ' + JSON.stringify(downloadState.events.slice(-10)) + '; respostas candidatas: ' + JSON.stringify(networkState.responses.slice(-10)) + '; arquivos: ' + JSON.stringify(listDownloadEntries(dir).map(function (e) { return { name: e.name, size: e.size }; })));
}

async function downloadXls(page, debug) {
  var selector = await waitForXlsReady(page);
  var tempDir = path.join(os.tmpdir(), 'grm-login-alimentacao-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  var client = await setChromeDownloadDir(page, tempDir);
  await installPageDownloadCapture(page);

  var downloadState = { events: [] };
  try {
    client.on('Browser.downloadWillBegin', function (event) {
      downloadState.events.push({ event: 'willBegin', guid: event.guid, filename: event.suggestedFilename, url: event.url });
      log('INFO', 'Chrome iniciou download: ' + JSON.stringify(downloadState.events[downloadState.events.length - 1]));
    });
    client.on('Browser.downloadProgress', function (event) {
      downloadState.events.push({ event: 'progress', guid: event.guid, state: event.state, receivedBytes: event.receivedBytes, totalBytes: event.totalBytes });
      if (event.state === 'completed' || event.state === 'canceled') log('INFO', 'Progresso final do download: ' + JSON.stringify(downloadState.events[downloadState.events.length - 1]));
    });
  } catch (e) {
    log('WARN', 'Não consegui assinar eventos Browser.download*: ' + e.message);
  }

  var networkState = { filePath: null, responses: [] };
  var onResponse = async function (response) {
    if (!looksLikeSpreadsheetResponse(response)) return;
    var headers = response.headers();
    var meta = {
      url: response.url(),
      status: response.status(),
      contentType: headers['content-type'] || '',
      disposition: headers['content-disposition'] || ''
    };
    networkState.responses.push(meta);
    try {
      var buffer = await response.buffer();
      var kind = spreadsheetKind(buffer);
      if (!kind) {
        meta.bytes = buffer.length;
        meta.kind = 'nao-planilha';
        return;
      }
      var proposed = filenameFromDisposition(headers['content-disposition']) || 'Relatorio-de-Login.' + kind;
      var filePath = path.join(tempDir, ensureSpreadsheetExtension(proposed, kind));
      fs.writeFileSync(filePath, buffer);
      networkState.filePath = filePath;
      meta.bytes = buffer.length;
      meta.kind = kind;
      log('SUCCESS', 'XLS capturado diretamente da resposta HTTP: ' + filePath + ' (' + buffer.length + ' bytes)');
    } catch (e) {
      meta.error = e.message;
    }
  };
  page.on('response', onResponse);

  log('INFO', 'Clicando no botão XLS: ' + selector);
  var startedAt = Date.now();
  var handle = await page.$(selector);
  if (!handle) throw new Error('Botão XLS desapareceu antes do clique.');
  await handle.click();

  try {
    var filePath = await waitForDownloadedXls(page, tempDir, startedAt, networkState, downloadState);
    log('SUCCESS', 'Arquivo XLS disponível: ' + filePath);
    return filePath;
  } catch (error) {
    if (debug) await saveDebug(page, 'login-alimentacao-download');
    throw error;
  } finally {
    page.removeListener('response', onResponse);
    try { await client.detach(); } catch (e) {}
  }
}

async function saveDebug(page, prefix) {
  var preferred = process.env.LOGIN_REPORT_DEBUG_DIR || path.join(os.tmpdir(), 'grm-sync-debug');
  var dirs = [preferred, path.join(os.tmpdir(), 'grm-sync-debug-' + process.pid)];
  var lastError = null;
  for (var i = 0; i < dirs.length; i++) {
    try {
      fs.mkdirSync(dirs[i], { recursive: true });
      var png = path.join(dirs[i], prefix + '.png');
      var html = path.join(dirs[i], prefix + '.html');
      await page.screenshot({ path: png, fullPage: true });
      fs.writeFileSync(html, await page.content());
      log('DEBUG', 'Diagnóstico salvo em ' + dirs[i] + '/' + prefix + '.*');
      return;
    } catch (e) {
      lastError = e;
    }
  }
  log('WARN', 'Falha salvando diagnóstico: ' + (lastError ? lastError.message : 'erro desconhecido'));
}

function findHeaderRow(rows) {
  var bestIndex = 0;
  var bestScore = -1;
  var max = Math.min(rows.length, 25);
  for (var i = 0; i < max; i++) {
    var cells = (rows[i] || []).map(normalizeText);
    var joined = cells.join(' | ');
    var score = 0;
    if (joined.indexOf('FUNCIONARIO') !== -1 || joined.indexOf('COLABORADOR') !== -1 || joined.indexOf('STAFF') !== -1) score += 4;
    if (joined.indexOf('DATA') !== -1 || joined.indexOf('HORA') !== -1 || joined.indexOf('LOGIN') !== -1) score += 2;
    if (joined.indexOf('LATITUDE') !== -1 || joined.indexOf('LAT') !== -1) score += 2;
    if (joined.indexOf('LONGITUDE') !== -1 || joined.indexOf('LNG') !== -1) score += 2;
    if (joined.indexOf('MOVIMENTO') !== -1) score += 1;
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestIndex;
}

function readXlsRows(filePath) {
  log('INFO', 'Lendo XLS: ' + filePath);
  var wb = XLSX.readFile(filePath, { cellDates: true });
  var sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('XLS sem abas: ' + filePath);
  var ws = wb.Sheets[sheetName];
  var rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  var headerRow = findHeaderRow(rawRows);
  var rows = XLSX.utils.sheet_to_json(ws, { range: headerRow, defval: null, raw: false });
  rows = rows.filter(function (r) {
    return Object.keys(r || {}).some(function (k) { return clean(r[k]) !== null; });
  });
  log('SUCCESS', rows.length + ' linha(s) lida(s); cabeçalho detectado na linha ' + (headerRow + 1));
  return rows;
}

function scoreReportRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  var sample = rows.slice(0, Math.min(rows.length, 20));
  var score = 0;
  var compatible = 0;

  sample.forEach(function (row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    var hasEmployee = findByAliasesDeep(row, ALIASES.colaborador) !== null;
    var hasDate = findByAliasesDeep(row, ALIASES.data) !== null || findByAliasesDeep(row, ALIASES.dataHora) !== null;
    var hasTime = findByAliasesDeep(row, ALIASES.hora) !== null || findByAliasesDeep(row, ALIASES.dataHora) !== null;
    var hasLat = findByAliasesDeep(row, ALIASES.latitude) !== null;
    var hasLng = findByAliasesDeep(row, ALIASES.longitude) !== null;
    if (hasEmployee) score += 3;
    if (hasDate) score += 3;
    if (hasTime) score += 2;
    if (hasLat) score += 3;
    if (hasLng) score += 3;
    if (hasEmployee && hasDate && hasTime && hasLat && hasLng) compatible++;
  });

  if (!compatible) return 0;
  return score + compatible * 20 + Math.min(rows.length, 1000) / 1000;
}

function extractCandidateArrays(value, pathName, out, depth) {
  if (depth > 6 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    var score = scoreReportRows(value);
    if (score > 0) out.push({ path: pathName, rows: value, score: score });
    for (var i = 0; i < Math.min(value.length, 5); i++) extractCandidateArrays(value[i], pathName + '[' + i + ']', out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(function (key) { extractCandidateArrays(value[key], pathName + '.' + key, out, depth + 1); });
  }
}

function rowsFromCapturedApi(captured) {
  var candidates = [];
  captured.forEach(function (item, index) {
    extractCandidateArrays(item.body, 'response[' + index + ']', candidates, 0);
  });
  candidates.sort(function (a, b) { return b.score - a.score; });
  if (!candidates.length) return [];
  log('INFO', 'Usando fallback JSON compatível com o relatório: ' + candidates[0].path + ' (' + candidates[0].rows.length + ' registros)');
  return candidates[0].rows;
}

function normalizeReportRows(rows, fromYmd, toYmd) {
  var normalized = [];
  for (var i = 0; i < rows.length; i++) {
    var raw = rows[i];
    var dt = parseDateTimeFromRow(raw);
    var colaborador = clean(findByAliasesDeep(raw, ALIASES.colaborador));
    var cpf = onlyDigits(findByAliasesDeep(raw, ALIASES.cpf));
    var codigo = clean(findByAliasesDeep(raw, ALIASES.codigo));
    var lat = parseNumber(findByAliasesDeep(raw, ALIASES.latitude));
    var lng = parseNumber(findByAliasesDeep(raw, ALIASES.longitude));

    if (!colaborador && !cpf && !codigo) continue;
    if (!dt.data) continue;
    if (dt.data < fromYmd || dt.data > toYmd) continue;

    var movimentoRaw = findByAliasesDeep(raw, ALIASES.possuiMovimento);
    var movimento = parseBooleanMovement(movimentoRaw);
    var identity = cpf || codigo || normalizeText(colaborador);
    var keyBase = [dt.data, dt.hora || '', identity, lat === null ? '' : lat, lng === null ? '' : lng, clean(findByAliasesDeep(raw, ALIASES.tipoMovimento)) || ''].join('|');

    normalized.push({
      chave_unica: hash(keyBase),
      data_movimento: dt.data,
      hora_movimento: dt.hora,
      colaborador_chave: identity,
      codigo_colaborador: codigo,
      cpf: cpf,
      colaborador: colaborador,
      coordenacao: clean(findByAliasesDeep(raw, ALIASES.coordenacao)),
      supervisao: clean(findByAliasesDeep(raw, ALIASES.supervisao)),
      uf_embarque: clean(findByAliasesDeep(raw, ALIASES.uf)),
      cidade_embarque: clean(findByAliasesDeep(raw, ALIASES.cidade)),
      local_servico: clean(findByAliasesDeep(raw, ALIASES.local)),
      possui_movimento: movimento,
      tipo_movimento: clean(findByAliasesDeep(raw, ALIASES.tipoMovimento)),
      latitude: lat,
      longitude: lng,
      precisao_m: parseNumber(findByAliasesDeep(raw, ALIASES.precisao)),
      dispositivo: clean(findByAliasesDeep(raw, ALIASES.dispositivo)),
      dados_json: raw
    });
  }

  if (!normalized.length) {
    var columns = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).join(', ') : 'nenhuma';
    throw new Error('Nenhuma linha válida foi reconhecida no relatório. Colunas recebidas: ' + columns);
  }

  var withCoords = normalized.filter(function (r) { return isValidCoord(r.latitude, r.longitude); }).length;
  var withTime = normalized.filter(function (r) { return !!r.hora_movimento; }).length;
  log('INFO', 'Normalização: ' + normalized.length + ' registros; ' + withCoords + ' com coordenadas; ' + withTime + ' com horário.');
  return normalized;
}

async function createRun(fromYmd, toYmd) {
  var payload = {
    data_de: fromYmd,
    data_ate: toYmd,
    status: 'INICIADO',
    iniciado_em: new Date().toISOString(),
    raw: {
      agente: 'grm-sync-login-alimentacao',
      raio_m: RAIO_M,
      turnos: TURNOS,
      criterio_embarque: 'ponto_embarque_da_os_planejada_para_o_colaborador'
    }
  };
  var result = await supabase.from(REPORT_CONFIG.tableExecucoes).insert(payload).select('id').single();
  if (result.error) {
    log('WARN', 'Não consegui criar registro de execução: ' + result.error.message);
    return null;
  }
  return result.data && result.data.id;
}

async function finishRun(runId, patch) {
  if (!runId) return;
  patch.finalizado_em = new Date().toISOString();
  var result = await supabase.from(REPORT_CONFIG.tableExecucoes).update(patch).eq('id', runId);
  if (result.error) log('WARN', 'Falha ao finalizar execução: ' + result.error.message);
}

async function saveImports(rows) {
  var now = new Date().toISOString();
  var records = rows.map(function (r) {
    return {
      chave_unica: r.chave_unica,
      data_movimento: r.data_movimento,
      hora_movimento: r.hora_movimento,
      colaborador_chave: r.colaborador_chave,
      codigo_colaborador: r.codigo_colaborador,
      cpf: r.cpf,
      colaborador: r.colaborador,
      coordenacao: r.coordenacao,
      supervisao: r.supervisao,
      uf_embarque: r.uf_embarque,
      cidade_embarque: r.cidade_embarque,
      local_servico: r.local_servico,
      possui_movimento: r.possui_movimento,
      tipo_movimento: r.tipo_movimento,
      latitude: r.latitude,
      longitude: r.longitude,
      precisao_m: r.precisao_m,
      dispositivo: r.dispositivo,
      dados_json: r.dados_json,
      sincronizado_em: now,
      updated_at: now
    };
  });

  for (var i = 0; i < records.length; i += 200) {
    var chunk = records.slice(i, i + 200);
    var result = await supabase.from(REPORT_CONFIG.tableImportacoes).upsert(chunk, { onConflict: 'chave_unica' });
    if (result.error) throw result.error;
    log('INFO', 'Movimentos gravados: ' + Math.min(i + 200, records.length) + '/' + records.length);
  }
}

// O relatório do GRM só mostra o login MAIS RECENTE de cada colaborador (não um histórico).
// Se buscássemos elegibilidade só a partir dele, um check-in válido dentro da janela às
// 11h que fosse seguido por outro às 12h em outro lugar sumiria do relatório antes da
// próxima execução, e o colaborador perderia o almoço mesmo tendo cumprido a regra.
// Por isso qualifyForMeal roda sobre o HISTÓRICO acumulado em tableImportacoes (cada login
// distinto vira uma linha própria ali, já que chave_unica inclui a hora), não apenas sobre
// o relatório baixado nesta execução.
async function loadImportedMovements(fromYmd, toYmd) {
  var all = [];
  var pageSize = 1000;
  var columns = 'chave_unica,data_movimento,hora_movimento,colaborador_chave,codigo_colaborador,cpf,colaborador,coordenacao,supervisao,uf_embarque,cidade_embarque,local_servico,possui_movimento,tipo_movimento,latitude,longitude,precisao_m,dispositivo,dados_json';
  for (var from = 0; from < MAX_MOVIMENTOS_ROWS; from += pageSize) {
    var result = await supabase
      .from(REPORT_CONFIG.tableImportacoes)
      .select(columns)
      .gte('data_movimento', fromYmd)
      .lte('data_movimento', toYmd)
      .range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    var rows = result.data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function normalizeCpfDigits(value) {
  var d = onlyDigits(value);
  return d && d.length === 11 ? d : null;
}

async function loadOsEmbarquePointsInRange(fromYmd, toYmd) {
  var all = [];
  var pageSize = 1000;
  for (var from = 0; from < MAX_LOCAL_ROWS; from += pageSize) {
    var result = await supabase
      .from('operacional_os')
      .select('id,numero_os,data_os,ponto1_nome,ponto1_latitude,ponto1_longitude,cidade_embarque,uf_embarque')
      .gte('data_os', fromYmd)
      .lte('data_os', toYmd)
      .range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    var rows = result.data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all.filter(function (r) { return isValidCoord(r.ponto1_latitude, r.ponto1_longitude); });
}

async function loadOsColaboradoresForIds(osIds) {
  var all = [];
  var pageSize = 300;
  for (var i = 0; i < osIds.length; i += pageSize) {
    var chunk = osIds.slice(i, i + pageSize);
    var result = await supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,colaborador_cpf,colaborador_nome')
      .in('os_id', chunk);
    if (result.error) throw result.error;
    all = all.concat(result.data || []);
  }
  return all;
}

// A elegibilidade agora exige corresponder o login à O.S. PLANEJADA pro colaborador
// naquele dia (operacional_os_colaboradores -> operacional_os.ponto1_*), não mais ao
// Local de Embarque mais próximo entre TODOS os cadastrados. colaborador_cpf/colaborador_key
// em operacional_os_colaboradores é inconsistente (às vezes nome, às vezes CPF, às vezes
// outro identificador numérico) — por isso indexamos por CPF (11 dígitos) quando disponível
// e por nome normalizado como fallback.
async function loadPlannedEmbarquePoints(fromYmd, toYmd) {
  log('INFO', 'Carregando O.S. planejadas (' + fromYmd + ' a ' + toYmd + ') e seus embarques...');
  var osRows = await loadOsEmbarquePointsInRange(fromYmd, toYmd);
  var osById = {};
  osRows.forEach(function (r) { osById[r.id] = r; });

  var assignments = osRows.length ? await loadOsColaboradoresForIds(Object.keys(osById)) : [];

  var byCpf = {};
  var byNome = {};
  assignments.forEach(function (a) {
    var os = osById[a.os_id];
    if (!os) return;
    var ponto = {
      fonte_tabela: 'operacional_os',
      fonte_id: os.id,
      nome: os.ponto1_nome || ('Embarque da O.S. ' + (os.numero_os || os.id)),
      cidade: os.cidade_embarque,
      uf: os.uf_embarque,
      latitude: Number(os.ponto1_latitude),
      longitude: Number(os.ponto1_longitude),
      numero_os: os.numero_os
    };

    var cpf = normalizeCpfDigits(a.colaborador_cpf) || normalizeCpfDigits(a.colaborador_key);
    if (cpf) {
      var kc = os.data_os + '|' + cpf;
      (byCpf[kc] = byCpf[kc] || []).push(ponto);
    }
    var nome = normalizeText(a.colaborador_nome || a.colaborador_key);
    if (nome) {
      var kn = os.data_os + '|' + nome;
      (byNome[kn] = byNome[kn] || []).push(ponto);
    }
  });

  log('SUCCESS', osRows.length + ' O.S. com embarque resolvido; ' + assignments.length + ' vínculo(s) colaborador-O.S. no período.');
  return { byCpf: byCpf, byNome: byNome, totalOsPontos: osRows.length };
}

function plannedPointsForRow(row, planned) {
  var cpf = normalizeCpfDigits(row.cpf);
  if (cpf) {
    var byCpf = planned.byCpf[row.data_movimento + '|' + cpf];
    if (byCpf && byCpf.length) return byCpf;
  }
  var nome = normalizeText(row.colaborador);
  if (nome) {
    var byNome = planned.byNome[row.data_movimento + '|' + nome];
    if (byNome && byNome.length) return byNome;
  }
  return null;
}

function nearestLocal(row, locals) {
  var best = null;
  for (var i = 0; i < locals.length; i++) {
    var d = haversineMeters(row.latitude, row.longitude, locals[i].latitude, locals[i].longitude);
    if (!best || d < best.distancia) best = { local: locals[i], distancia: d };
  }
  return best;
}

// Colaborador pode abrir o app perto do embarque e, no mesmo dia, longe (ou vice-versa).
// Cada linha só entra em "inside" se JÁ estiver dentro do raio (linhas fora do raio nunca
// competem); dentre as que estão dentro, fica só a mais próxima (sort + [0]). Esta função
// deve ser chamada com o HISTÓRICO acumulado (loadImportedMovements), não com o relatório
// de uma única execução — veja o comentário de loadImportedMovements para o motivo. O
// upsert (chave_unica = data+colaborador) nunca envia a coluna status, então recomputar
// não derruba uma decisão OK/PAGO já tomada pelo financeiro.
// Acha em quais turnos (Café 04:00-07:00, Almoço 05:00-19:00, Janta 19:00-00:00) um horário
// se qualifica. "00:00" no fim representa a virada pro fim do dia (não pro dia seguinte):
// se hora_fim <= hora_inicio, soma 24h só na comparação.
function turnosForMinutes(minutes) {
  var result = [];
  for (var i = 0; i < TURNOS.length; i++) {
    var t = TURNOS[i];
    var start = timeToMinutes(t.inicio);
    var end = timeToMinutes(t.fim);
    if (start === null || end === null) throw new Error('Janela do turno ' + t.tipo + ' inválida: ' + t.inicio + '-' + t.fim);
    if (end <= start) end += 24 * 60;
    if (minutes >= start && minutes <= end) result.push(t);
  }
  return result;
}

// planned = { byCpf, byNome } vindo de loadPlannedEmbarquePoints: só entra em "inside" um
// login que caia dentro do raio do ponto de embarque da O.S. PLANEJADA pro colaborador
// naquele dia. Sem O.S. planejada (ou sem colaborador correspondente), plannedPointsForRow
// retorna null e a linha nunca entra no grupo "inside" — não há mais fallback pro Local de
// Embarque mais próximo entre todos os cadastrados.
function qualifyForMeal(rows, planned) {
  // Chave por dia+colaborador+turno: um colaborador pode ficar elegível pros 3 turnos no
  // mesmo dia, cada um vira uma linha própria em financeiro_alimentacao_colaboradores.
  var grouped = {};
  rows.forEach(function (row) {
    if (!row.hora_movimento || !isValidCoord(row.latitude, row.longitude)) return;
    var minutes = timeToMinutes(row.hora_movimento);
    if (minutes === null) return;
    var turnos = turnosForMinutes(minutes);
    if (!turnos.length) return;
    var pontosOs = plannedPointsForRow(row, planned);
    var nearest = pontosOs && pontosOs.length ? nearestLocal(row, pontosOs) : null;
    turnos.forEach(function (turno) {
      var groupKey = row.data_movimento + '|' + row.colaborador_chave + '|' + turno.tipo;
      if (!grouped[groupKey]) grouped[groupKey] = { turno: turno, rows: [], inside: [] };
      grouped[groupKey].rows.push(row);
      if (nearest && nearest.distancia <= RAIO_M) grouped[groupKey].inside.push({ row: row, nearest: nearest });
    });
  });

  var now = new Date().toISOString();
  var eligible = [];
  Object.keys(grouped).forEach(function (groupKey) {
    var group = grouped[groupKey];
    if (!group.inside.length) return;
    group.inside.sort(function (a, b) { return a.nearest.distancia - b.nearest.distancia; });
    var chosen = group.inside[0];
    var row = chosen.row;
    var local = chosen.nearest.local;
    var turno = group.turno;

    eligible.push({
      chave_unica: hash(groupKey),
      data_ref: row.data_movimento,
      colaborador_chave: row.colaborador_chave,
      codigo_colaborador: row.codigo_colaborador,
      cpf: row.cpf,
      colaborador: row.colaborador,
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      hora_identificada: row.hora_movimento,
      latitude_colaborador: row.latitude,
      longitude_colaborador: row.longitude,
      precisao_m: row.precisao_m,
      local_fonte_tabela: local.fonte_tabela,
      local_fonte_id: local.fonte_id,
      local_nome: local.nome,
      local_cidade: local.cidade,
      local_uf: local.uf,
      local_latitude: local.latitude,
      local_longitude: local.longitude,
      distancia_m: Math.round(chosen.nearest.distancia),
      raio_m: RAIO_M,
      tipo_beneficio: turno.tipo,
      pontos_na_janela: group.rows.length,
      pontos_dentro_raio: group.inside.length,
      origem: REPORT_CONFIG.origem,
      origem_chave_login: row.chave_unica,
      ativo: true,
      ultima_verificacao_em: now,
      updated_at: now,
      dados_json: {
        movimento_selecionado: row.dados_json,
        numero_os: local.numero_os,
        regra: {
          tipo_beneficio: turno.tipo,
          hora_inicio: turno.inicio,
          hora_fim: turno.fim,
          raio_m: RAIO_M,
          criterio: 'ponto_embarque_da_os_planejada_para_o_colaborador'
        }
      }
    });
  });

  return eligible;
}

async function deactivatePendingRange(fromYmd, toYmd) {
  var result = await supabase
    .from(REPORT_CONFIG.tableAlimentacao)
    .update({ ativo: false, ultima_verificacao_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('origem', REPORT_CONFIG.origem)
    .eq('status', 'PENDENTE')
    .gte('data_ref', fromYmd)
    .lte('data_ref', toYmd);
  if (result.error) throw result.error;
}

async function saveEligible(rows, fromYmd, toYmd) {
  await deactivatePendingRange(fromYmd, toYmd);
  if (!rows.length) {
    log('INFO', 'Nenhum colaborador elegível encontrado na janela/raio definidos.');
    return;
  }

  for (var i = 0; i < rows.length; i += 100) {
    var chunk = rows.slice(i, i + 100);
    var result = await supabase.from(REPORT_CONFIG.tableAlimentacao).upsert(chunk, { onConflict: 'chave_unica' });
    if (result.error) throw result.error;
    log('INFO', 'Colaboradores relacionados em Alimentação: ' + Math.min(i + 100, rows.length) + '/' + rows.length);
  }
}

async function collectReport(fromYmd, toYmd, debug) {
  var browser;
  var captured;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/google/chrome/chrome',
      headless: process.env.GRM_HEADLESS === 'new' ? 'new' : true,
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
    await page.setViewport({ width: 1920, height: 1440 });
    captured = startApiCapture(page);

    await login(page);
    log('INFO', 'Abrindo ' + REPORT_CONFIG.url);
    await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(2500);

    await fillDateRange(page, ymdToBr(fromYmd), ymdToBr(toYmd));
    log('INFO', 'Filtro "Possui Movimento?" mantido sem alteração.');
    if (captured) captured.length = 0;
    await generateReport(page);

    try {
      var filePath = await downloadXls(page, debug);
      return readXlsRows(filePath);
    } catch (downloadError) {
      log('WARN', 'Falha no XLS: ' + downloadError.message + '. Tentando somente JSON compatível com o Relatório de Login.');
      await wait(1500);
      var apiRows = rowsFromCapturedApi(captured || []);
      if (apiRows.length) return apiRows;
      if (debug) await saveDebug(page, 'login-alimentacao-sem-dados');
      throw downloadError;
    }
  } finally {
    browserAtual = null;
    if (browser) await browser.close();
  }
}

async function main() {
  assertConfig();
  var args = parseArgs(process.argv.slice(2));
  var fromYmd = args.data || formatYmdInTimeZone(new Date(), TIMEZONE);
  var toYmd = addDaysYmd(fromYmd, 1);
  var debug = args.debug || DEBUG;
  var runId = null;

  try {
    log('INFO', '=== ' + REPORT_CONFIG.name + ' | ' + fromYmd + ' até ' + toYmd + ' ===');
    runId = await createRun(fromYmd, toYmd);

    var rawRows = args.xlsx ? readXlsRows(args.xlsx) : await collectReport(fromYmd, toYmd, debug);
    var movements = normalizeReportRows(rawRows, fromYmd, toYmd);
    await saveImports(movements);

    var planned = await loadPlannedEmbarquePoints(fromYmd, toYmd);
    var historico = await loadImportedMovements(fromYmd, toYmd);
    var eligible = qualifyForMeal(historico, planned);
    await saveEligible(eligible, fromYmd, toYmd);

    await finishRun(runId, {
      status: 'SUCESSO',
      total_relatorio: rawRows.length,
      total_movimentos: movements.length,
      total_locais: planned.totalOsPontos,
      total_elegiveis: eligible.length
    });

    log('SUCCESS', 'Sincronização concluída: ' + movements.length + ' movimentos e ' + eligible.length + ' colaborador(es) elegível(is).');
  } catch (error) {
    log('ERROR', error.stack || error.message);
    await finishRun(runId, { status: 'ERRO', erro: String(error.message || error).slice(0, 4000) });
    throw error;
  }
}

if (require.main === module) {
  main().then(function () { process.exit(0); }).catch(function () { process.exit(1); });

  setTimeout(function () {
    console.error('[ERROR] Timeout global de 8 minutos atingido');
    try { if (browserAtual) browserAtual.close(); } catch (e) {}
    process.exit(1);
  }, Number(process.env.LOGIN_REPORT_GLOBAL_TIMEOUT_MS || 480000)).unref();
}

module.exports = {
  normalizeReportRows: normalizeReportRows,
  qualifyForMeal: qualifyForMeal,
  haversineMeters: haversineMeters,
  parseDateTimeFromRow: parseDateTimeFromRow,
  turnosForMinutes: turnosForMinutes
};
