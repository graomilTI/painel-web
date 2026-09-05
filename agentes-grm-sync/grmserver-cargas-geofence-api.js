#!/usr/bin/env node
/*
 * GRM Server - Relatório de Cargas x Geofence da O.S. (via API direta)
 *
 * Substitui o fluxo Puppeteer (grm-sync-cargas-geofence.js) — mesmo padrão de
 * grmserver-patrimonios-api.js. O script Puppeteer antigo já chamava
 * `fetch('/api/reports/classification/loads', ...)` de DENTRO da página
 * (via page.evaluate) para buscar os dados reais; toda a maquinaria de achar
 * a URL da tela, preencher datas, clicar em Gerar/XLS e ler o arquivo baixado
 * (abrirRelatorioCargas, preencherDatas, baixarXls, etc.) já era código
 * morto — main() nunca chamava baixarRelatorioCargasHoje/lerRelatorioCargas
 * a não ser que --xlsx fosse passado manualmente. Aqui o login também é via
 * API e roda sem navegador; a comparação Latitude/Longitude x geofence da
 * O.S. e a gravação em logistica_cargas_irregularidades são idênticas.
 */

require('dotenv').config();

var https = require('https');
var XLSX = require('xlsx');
var WebSocket = require('ws');
var createClient = require('@supabase/supabase-js').createClient;

var SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
var GRM_USER = process.env.GRMSERVER_USER;
var GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

var GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
var GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

var RAIO_M = Number(process.env.CARGAS_RAIO_M || 2000);
var MAX_LOOKUP_ROWS = Number(process.env.CARGAS_OS_LOOKUP_LIMIT || 5000);

var REPORT_CONFIG = {
  name: 'Relatório de Cargas - Geofence',
  tableIrregularidades: process.env.CARGAS_IRREG_TABLE || 'logistica_cargas_irregularidades',
  tableExecucoes: process.env.CARGAS_RUNS_TABLE || 'logistica_cargas_monitor_execucoes',
  tableImportacoes: process.env.CARGAS_IMPORT_TABLE || 'grm_cargas_importacoes',
  salvarImportacao: String(process.env.CARGAS_SALVAR_IMPORTACAO || 'true').toLowerCase() !== 'false',
  somenteEmbarcado: String(process.env.CARGAS_SOMENTE_EMBARCADO || 'true').toLowerCase() !== 'false',
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

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function requestJson(url, method, body, headers) {
  var parsed = new URL(url);
  var payload = body == null ? '' : JSON.stringify(body);
  return new Promise(function (resolve, reject) {
    var request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method,
      timeout: 30000,
      headers: Object.assign({
        accept: 'application/json',
        'content-type': 'application/json',
      }, payload ? { 'content-length': Buffer.byteLength(payload) } : {}, headers || {}),
    }, function (response) {
      var chunks = [];
      response.on('data', function (chunk) { chunks.push(chunk); });
      response.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        var data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          reject(new Error('GRM retornou conteúdo inválido (HTTP ' + response.statusCode + ').'));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('GRM respondeu HTTP ' + response.statusCode + ': ' + (data.message || 'erro')));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', function () { request.destroy(new Error('Timeout ao consultar o GRM.')); });
    request.on('error', reject);
    request.end(payload || undefined);
  });
}
function postJson(url, body, headers) { return requestJson(url, 'POST', body, headers); }
function authHeaders(token) { return Object.assign({}, GRM_WEB_HEADERS, { authorization: 'Bearer ' + token }); }

async function login() {
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  log('INFO', 'Login via API...');
  var response = await postJson(GRM_BASE_URL + 'user/login', {
    userEmail: GRM_USER,
    userPass: GRM_PASSWORD,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error('Login GRM recusado: ' + (response.message || 'sem token'));
  log('SUCCESS', 'Login OK');
  return response.token;
}

async function buscarRelatorioCargasApi(token, dataYmd) {
  var dataBr = ymdToBr(dataYmd);
  log('INFO', 'Consultando API do Relatório de Cargas em ' + dataBr + '...');
  var json = await postJson(GRM_BASE_URL + 'reports/classification/loads', {
    loaDateFrom: dataBr,
    loaDateTo: dataBr,
    loaType: 'EMB',
    includeTotal: 'N',
    addStaffInfo: 'S',
    addLocalInfo: 'S',
    addTestsInfo: 'N',
    addSchedulesInfo: 'N',
    joinCItems: 'N'
  }, authHeaders(token));
  if (!json.result) throw new Error(json.message || 'reports/classification/loads falhou');
  var groups = json.searchData || [];

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

function clean(value) {
  if (value === null || value === undefined) return null;
  var s = String(value).replace(/ /g, ' ').trim();
  return s || null;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
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
  // 20260706213240_consolida_matching_embarque_os.sql).
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
  var runId = null;

  try {
    log('INFO', '=== ' + REPORT_CONFIG.name + ' (API) | ' + dataYmd + ' ===');
    runId = await criarExecucao(dataYmd);

    var token = await login();
    var linhas = await buscarRelatorioCargasApi(token, dataYmd);
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
        arquivo: 'api:reports/classification/loads'
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
    process.exit(1);
  }, Number(process.env.CARGAS_AGENT_TIMEOUT_MS || 120000));
}

module.exports = {
  login: login,
  buscarRelatorioCargasApi: buscarRelatorioCargasApi,
  buscarLocalOs: buscarLocalOs,
  haversineMeters: haversineMeters
};
