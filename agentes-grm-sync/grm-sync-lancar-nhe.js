#!/usr/bin/env node
/*
 * GRM Server - Lançamento automático de NHE por geofence de login
 *
 * O agente:
 * 1. Recalcula a mesma regra da tela FOB (logistica-fob-page-v9.js) direto no
 *    Supabase — Movimentação Diária + Produção Diária + NHE — e extrai as O.S.
 *    em status PENDENTE (tem informativo/"Última Atualização" no Mapa de
 *    Embarque, mas nenhum NHE nem carga real lançados).
 * 2. Para cada O.S. pendente, resolve a coordenada da O.S. (operacional_os.
 *    ponto1_latitude/longitude) e procura, em grm_login_movimentos_importacoes
 *    (alimentada pelo grm-sync-login-alimentacao.js), um login do MESMO
 *    colaborador que fez o informativo (campo "Atualizado por" da
 *    Movimentação), na mesma data, dentro do raio configurado (padrão 2km).
 * 3. Se achar, loga no GRM (grmserver.com.br), abre a O.S., clica no ícone de
 *    caminhão ("Lista de Cargas"), clica em "+NHE" e preenche o formulário
 *    (Coordenação/Supervisão/Funcionário/Data/Motivo/Obs.), sem revisão
 *    humana — decisão do usuário (2026-07-21).
 * 4. Grava o resultado (sucesso/erro/sem match) em
 *    logistica_nhe_lancamentos_auto, evitando relançar a mesma O.S.+data já
 *    lançada com sucesso.
 *
 * Seletores confirmados ao vivo em 2026-07-21 (ver sessão de mapeamento):
 *   - Campo O.S.: input dentro do .v-input cujo texto começa com "O.S"
 *   - Busca: .serviceOrder-act-search
 *   - Linha da O.S.: <td> com texto exatamente igual ao número da O.S.
 *   - Ícone "Lista de Cargas": lord-icon[src*="497-truck-delivery"]
 *   - Botão "+NHE": .sOrderloads-act-add-nhe
 *   - Campo Data do modal: #lnsDate | Campo Motivo: #lnsReason
 *   - Coordenação/Supervisão/Funcionário/Motivo são v-autocomplete e SÓ abrem
 *     com um clique de mouse "de verdade" (page.mouse.click nas coordenadas do
 *     campo) — um .click() sintético via DOM não abre o menu (confirmado por
 *     teste ao vivo: DOM click abre o menu de navegação lateral por engano).
 *   - Motivo fixo escolhido pelo usuário: "Falta de Caminhão".
 *   - Obs. fixa escolhida pelo usuário: "Aprovado pelo Gestor".
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

var RAIO_M = Number(process.env.NHE_LANCAMENTO_RAIO_M || 2000);
var MOTIVO_FIXO = process.env.NHE_LANCAMENTO_MOTIVO || 'Falta de Caminhão';
var OBS_FIXA = 'Aprovado pelo Gestor';
var FOB_JANELA_DIAS = Number(process.env.NHE_LANCAMENTO_FOB_DIAS || 3);
// grm_mapa_embarque_importacoes gira ~21-27 mil linhas/dia (medido 25-31/08) —
// uma janela de 3 dias soma 60-80 mil, bem acima do antigo teto de 20000, que
// na prática só alcançava ~12-14h pra trás (silenciosamente descartava o
// resto da janela). grm_nhe_importacoes é bem menor (~1,1-1,6 mil/dia).
var MAX_MOV_ROWS = Number(process.env.NHE_LANCAMENTO_MAX_MOV_ROWS || 100000);
var MAX_NHE_ROWS = Number(process.env.NHE_LANCAMENTO_MAX_NHE_ROWS || 10000);
var REPROCESSAR_DIAS = Math.max(1, Number(process.env.NHE_LANCAMENTO_REPROCESSAR_DIAS) || 3);
// Cada lançamento leva em média 35-50s. O lote fica limitado a 8 para que a
// execução conclua antes do watchdog; os restantes são enfileirados pela
// continuação automática já existente.
var MAX_LANCAMENTOS_POR_EXECUCAO = Math.min(8, Math.max(1, Number(process.env.NHE_LANCAMENTO_LOTE) || 8));
var DEBUG = String(process.env.GRM_DEBUG || '').toLowerCase() === 'true';
var DRY_RUN = String(process.env.NHE_LANCAMENTO_DRY_RUN || '').toLowerCase() === 'true';
// Em recuperação manual, permite processar lotes sequenciais sem criar um job
// concorrente no worker (use NHE_LANCAMENTO_AUTO_CONTINUACAO=false).
var AUTO_CONTINUACAO = String(process.env.NHE_LANCAMENTO_AUTO_CONTINUACAO || 'true').toLowerCase() !== 'false';
// Somente diagnóstico manual: permite repetir SALVO_NAO_CONFIRMADO de uma O.S. explícita.
var REPETIR_NAO_CONFIRMADO = String(process.env.NHE_LANCAMENTO_REPETIR_NAO_CONFIRMADO || 'false').toLowerCase() === 'true';

var TABLE_RESULTADOS = 'logistica_nhe_lancamentos_auto';
var TABLE_EXECUCOES = 'logistica_nhe_lancamentos_execucoes';
var TABLE_LOGIN = 'grm_login_movimentos_importacoes';

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
    if (argv[i] === '--os') out.os = argv[++i];
    else if (argv[i] === '--data') out.data = argv[++i];
    else if (argv[i] === '--debug') out.debug = true;
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--funcionario') out.funcionario = argv[++i];
    else if (argv[i] === '--forcar') out.forcar = true;
  }
  return out;
}

/* ---------------------------------------------------------------------- *
 * Regra do FOB (portada de assets/js/logistica-fob-page-v9.js) — só o que
 * é necessário para chegar às linhas PENDENTE com o campo "funcionario".
 * ---------------------------------------------------------------------- */

function stripAccents(value) {
  return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normHeader(value) {
  return stripAccents(value).replace(/ /g, ' ').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();
}

function normText(value) {
  return stripAccents(value).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normOs(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/^\d+(\.0+)?$/.test(text)) text = text.replace(/\.0+$/, '');
  if (text.indexOf('/') !== -1) text = text.split('/')[0].trim();
  return text.replace(/\s+/g, ' ').trim();
}

function normalizedRow(raw) {
  var output = {};
  Object.keys(raw || {}).forEach(function (key) { output[normHeader(key)] = raw[key]; });
  return output;
}

function pick(row, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var key = normHeader(aliases[i]);
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return '';
}

function parseDateOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var text = String(value == null ? '' : value).trim();
  if (!text) return null;
  var match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  var date = new Date(text);
  return isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function ymd(value) {
  var date = parseDateOnly(value);
  if (!date) return '';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function brDate(value) {
  var date = parseDateOnly(value);
  if (!date) return '-';
  return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
}

function toNumberLoose(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  var text = String(value == null ? '' : value).trim();
  if (!text || text === '--') return 0;
  var cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  var parsed = Number(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

function referenceDate() {
  var date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date;
}
function referenceIso() { return ymd(referenceDate()); }
function referenceBr() { return brDate(referenceDate()); }

function movementDate(row) {
  return ymd(pick(row, ['Última Atualização', 'Ultima Atualizacao', 'Última Atualizacao', 'Ultima Atualização']));
}
function serviceDate(row) {
  return ymd(pick(row, ['Data', 'Última Atualização', 'Ultima Atualizacao']));
}

async function fetchPaged(builder, maxRows) {
  var rows = [];
  var pageSize = 1000;
  var concurrency = 6;
  var waveSpan = pageSize * concurrency;
  for (var waveStart = 0; waveStart < maxRows; waveStart += waveSpan) {
    var requests = [];
    for (var from = waveStart; from < waveStart + waveSpan && from < maxRows; from += pageSize) {
      var to = Math.min(from + pageSize, maxRows) - 1;
      requests.push(builder(from, to));
    }
    var results = await Promise.all(requests);
    var reachedEnd = false;
    for (var i = 0; i < results.length; i++) {
      if (results[i].error) throw results[i].error;
      var chunk = results[i].data || [];
      rows = rows.concat(chunk);
      if (chunk.length < pageSize) reachedEnd = true;
    }
    if (reachedEnd) break;
  }
  return rows;
}

// Igual a fetchPaged, mas 1 página de cada vez (sem 6 requests concorrentes).
// Usada só para as RPCs de lote (fob_lote_recente/fob_producao_lote_vencedor):
// cada chamada reexecuta a função do zero no Postgres (não há cache de
// resultado entre requests HTTP separados), então pedir 6 páginas ao mesmo
// tempo dispara 6 execuções pesadas simultâneas na mesma tabela — foi isso
// que fez as duas RPCs estourarem statement_timeout no diagnóstico da O.S.
// 90869 (31/08). Sequencial evita essa contenção autoinfligida.
async function fetchPagedSequential(builder, maxRows) {
  var rows = [];
  var pageSize = 1000;
  for (var from = 0; from < maxRows; from += pageSize) {
    var to = Math.min(from + pageSize, maxRows) - 1;
    var result = await builder(from, to);
    if (result.error) throw result.error;
    var chunk = result.data || [];
    rows = rows.concat(chunk);
    if (chunk.length < pageSize) return rows;
  }
  log('WARN', 'fetchPagedSequential atingiu o teto de ' + maxRows + ' linhas antes do fim dos dados — resultado pode estar incompleto.');
  return rows;
}

// Paginação por cursor (created_at, id), sem OFFSET: OFFSET numa tabela de
// dezenas de milhares de linhas por dia obriga o Postgres a visitar (não só
// pular) cada linha descartada em toda página seguinte, ficando mais lento a
// cada página. Usa `created_at <= cursor` (inclusive) + dedupe por id no
// cliente em vez de `<` estrito, porque um mesmo sync grava várias linhas com
// o MESMO created_at (uma única transação) — `<` estrito no cursor poderia
// pular o resto desse lote se ele atravessar a borda de uma página, seria a
// mesma classe de perda silenciosa da O.S. 90394/90869.
async function fetchByCreatedAt(table, maxRows, dias) {
  var cutoffIso = new Date(Date.now() - dias * 86400000).toISOString();
  var rows = [];
  var seen = {};
  var cursor = null;
  var pageSize = 1000;
  while (rows.length < maxRows) {
    var query = supabase.from(table).select('id,dados_json,created_at').gte('created_at', cutoffIso)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize);
    if (cursor) query = query.lte('created_at', cursor);
    var result = await query;
    if (result.error) throw result.error;
    var chunk = result.data || [];
    if (!chunk.length) break;
    var novos = 0;
    chunk.forEach(function (row) {
      if (seen[row.id]) return;
      seen[row.id] = true;
      rows.push(row);
      novos++;
    });
    if (chunk.length < pageSize) break;
    cursor = chunk[chunk.length - 1].created_at;
    if (!novos) {
      log('WARN', 'fetchByCreatedAt: página inteira repetida (lote maior que ' + pageSize + ' linhas com o mesmo created_at) em ' + table + ' — parando pra evitar loop.');
      break;
    }
  }
  if (rows.length >= maxRows) {
    log('WARN', 'fetchByCreatedAt atingiu o teto de ' + maxRows + ' linhas para ' + table + ' — pode haver dados da janela de ' + dias + ' dia(s) não capturados.');
  }
  return rows.slice(0, maxRows);
}

async function fetchLoteRecente(table, maxRows) {
  try {
    return await fetchPagedSequential(function (from, to) {
      return supabase.rpc('fob_lote_recente', { p_table: table, p_dias: FOB_JANELA_DIAS }).order('created_at', { ascending: false }).range(from, to);
    }, maxRows);
  } catch (error) {
    log('WARN', 'RPC fob_lote_recente indisponível para ' + table + '; usando fallback created_at: ' + error.message);
    return fetchByCreatedAt(table, maxRows, FOB_JANELA_DIAS);
  }
}

function splitBatches(records, maxGapMs) {
  maxGapMs = maxGapMs || 90000;
  var sorted = (records || []).filter(function (r) { return r && r.created_at; })
    .slice()
    .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
  var batches = [];
  var current = [];
  var previousAt = null;
  sorted.forEach(function (record) {
    var currentAt = new Date(record.created_at).getTime();
    if (current.length && previousAt !== null && currentAt - previousAt > maxGapMs) {
      batches.push(current);
      current = [];
    }
    current.push(record);
    previousAt = currentAt;
  });
  if (current.length) batches.push(current);
  return batches;
}

function chooseMovementBatch(records) {
  // União de todos os lotes da janela, não só o "lote vencedor" (mais linhas
  // batendo a referência): o Mapa de Embarque é um snapshot AO VIVO do board
  // do GRM, e uma O.S. pode sumir dele entre um sync e o próximo (ex.: saiu
  // da tela do GRM antes da próxima execução) sem nunca ter sido resolvida.
  // Escolher só o lote com mais matches descartava silenciosamente qualquer
  // O.S. que só aparecia num lote mais antigo/perdedor — achado com a O.S.
  // 90394 (Última Atualização=27/08 presente até 02:53 UTC, sumida dos syncs
  // seguintes; o agente rodou depois disso e nunca a viu). Mantém, por O.S.,
  // a ocorrência de created_at mais recente entre todos os lotes.
  var byOs = {};
  var rawSeen = {};
  var lastBatchAt = null;
  (records || []).forEach(function (record) {
    if (!lastBatchAt || String(record.created_at) > String(lastBatchAt)) lastBatchAt = record.created_at;
    var row = normalizedRow(record.dados_json || {});
    var os = normOs(pick(row, ['OS', 'O.S.', 'O.S', 'O S']));
    if (!os || normText(os) === 'OS') return;
    rawSeen[os] = true;
    if (movementDate(row) !== referenceIso()) return;
    var existing = byOs[os];
    if (!existing || String(record.created_at) > String(existing.createdAt)) {
      byOs[os] = { row: row, createdAt: record.created_at };
    }
  });
  var rows = Object.keys(byOs).map(function (k) { return byOs[k]; });
  return { score: rows.length, batchAt: lastBatchAt, rawCount: Object.keys(rawSeen).length, matchingCount: rows.length, rows: rows };
}

function chooseServiceBatch(records) {
  var selected = null;
  splitBatches(records).forEach(function (batch) {
    var normalized = batch.map(function (record) { return normalizedRow(record.dados_json || {}); });
    var matching = normalized.filter(function (row) { return serviceDate(row) === referenceIso(); });
    var score = matching.length;
    var batchAt = batch[0] ? batch[0].created_at : null;
    if (!selected || score > selected.score || (score === selected.score && String(batchAt) > String(selected.batchAt))) {
      selected = { score: score, batchAt: batchAt, rawCount: normalized.length, rows: matching };
    }
  });
  if (!selected) return { rows: [] };
  return selected;
}

async function fetchMovementDaily() {
  var records = await fetchLoteRecente('grm_mapa_embarque_importacoes', MAX_MOV_ROWS);
  var selected = chooseMovementBatch(records);
  return (selected && selected.rows) || [];
}

async function fetchServiceDay(table, maxRows) {
  var records = await fetchLoteRecente(table, maxRows);
  return chooseServiceBatch(records).rows || [];
}

// grm_producao_diaria_importacoes (fluxo Puppeteer/XLS, base do
// fetchProducaoLoteVencedor/chooseServiceBatch acima) parou de crescer em
// 01/09: sync-producao-diaria foi pausado em grm_sync_agent_settings a favor
// de grmserver-producao-diaria-api-realtime.js, que grava só em
// producao_snapshot (README do agente confirma "não escreve mais em
// grm_producao_diaria_importacoes"). producao_snapshot é mantida por
// replaceTablePeriodSafely (substitui o período consultado, não acumula
// imports) — não tem lotes concorrentes pra desambiguar, então basta filtrar
// pela data (coluna `data`, tipo date) direto, sem a heurística de
// created_at/gap usada pra tabela antiga.
//
// Achado ao migrar: o texto "Cargas"="NHE" (linha de Produção Diária que
// marca um dia sem carga do classificador, sinal usado por calcularPendentes
// pra pular pendências já cobertas) não existe em producao_snapshot — a API
// usada pelo agente novo só expõe countLoads numérico (mapProducaoSnapshotRow
// em grmserver-producao-diaria-api-realtime.js), sem esse marcador. Testado
// ao vivo (01/09): das O.S. amostradas com "Cargas"="NHE" na tabela antiga,
// NENHUMA tinha um registro correspondente em grm_nhe_importacoes na mesma
// data — ou seja, não é um proxy confiável de "NHE real já lançado" mesmo na
// tabela antiga. Perder esse sinal aqui não abre brecha de duplicidade: a
// trava de segurança nhe_existe_movimento_real (também migrada pra
// producao_snapshot) continua bloqueando o lançamento sempre que já existir
// QUALQUER linha de Produção Diária pra aquela O.S.+data, com ou sem carga —
// o efeito é a O.S. aparecer como candidata e ser barrada ali (status
// JA_EXISTIA_MOVIMENTO_GRM) em vez de nem entrar na lista, mais barulho no
// log mas sem risco de lançar em duplicidade.
async function fetchProducaoSnapshotDia(dataIso) {
  var rows = await fetchPaged(function (from, to) {
    return supabase.from('producao_snapshot').select('os,cargas').eq('data', dataIso).range(from, to);
  }, 20000);
  return rows.map(function (row) { return normalizedRow({ 'O.S.': row.os, Cargas: row.cargas }); });
}

// Mesma regra de assets/js/logistica-fob-page-v9.js:compareFob — só o
// suficiente para chegar às linhas PENDENTE com "funcionario".
// Só resolvido dentro de calcularPendentes (por O.S., data_os <= referência,
// já traz servico pro filtro FOB/CIF); ver resolverCoordenadaOs (versão
// avulsa, usada só no modo manual --os) logo abaixo para o mesmo critério.
async function resolverCoordenadasEmLote(numerosOs) {
  var unique = Array.from(new Set(numerosOs.filter(Boolean)));
  var resolvido = {};
  if (!unique.length) return resolvido;
  var pageSize = 200;
  for (var i = 0; i < unique.length; i += pageSize) {
    var chunk = unique.slice(i, i + pageSize);
    var result = await supabase
      .from('operacional_os')
      .select('numero_os,data_os,cliente,embarque,ponto1_nome,ponto1_latitude,ponto1_longitude,servico,supervisao,situacao,observacao_logistica')
      .in('numero_os', chunk)
      .lte('data_os', referenceIso())
      .order('data_os', { ascending: false });
    if (result.error) throw result.error;
    (result.data || []).forEach(function (row) {
      // A 1ª linha de cada numero_os já é a mais recente <= referência (order
      // by data_os desc) — não sobrescrever com uma mais antiga. Isso evita
      // pegar coordenada/serviço de uma reabertura do MESMO número de O.S. em
      // data futura (ex.: O.S. reaproveitada hoje pra outro embarque) — só
      // aceitamos o que já existia até a data de referência (pedido do
      // usuário 21/07, achado com a O.S. 87597).
      if (resolvido[row.numero_os]) return;
      resolvido[row.numero_os] = {
        lat: isValidCoord(row.ponto1_latitude, row.ponto1_longitude) ? Number(row.ponto1_latitude) : null,
        lng: isValidCoord(row.ponto1_latitude, row.ponto1_longitude) ? Number(row.ponto1_longitude) : null,
        servico: row.servico,
        supervisao: row.supervisao,
        situacao: row.situacao,
        cliente: row.cliente,
        embarque: row.embarque,
        local: row.ponto1_nome || row.embarque,
        // Laudo anexado (remanescente negativo, ver os.js:openLaudoModal) marca
        // observacao_logistica='LAUDO:'+urls — conta como cobertura do ponto
        // igual um NHE já lançado (pedido do usuário 06/08).
        temLaudo: typeof row.observacao_logistica === 'string' && row.observacao_logistica.indexOf('LAUDO:') === 0
      };
    });
  }
  return resolvido;
}

var SERVICOS_FOB_CIF = ['CLASSIFICACAO FOB', 'CLASSIFICACAO CIF'];

async function calcularPendentes(movementRows, productionRows, nheRows) {
  var setCargaRealOs = {};
  var setNheEmProducaoOs = {};
  productionRows.forEach(function (row) {
    var os = normOs(pick(row, ['O.S.', 'OS']));
    if (!os) return;
    var cargasRaw = String(pick(row, ['Cargas']) == null ? '' : pick(row, ['Cargas'])).trim();
    if (normText(cargasRaw) === 'NHE') setNheEmProducaoOs[os] = true;
    else if (cargasRaw && toNumberLoose(cargasRaw) > 0) setCargaRealOs[os] = true;
  });

  var setNheOsOnly = {};
  nheRows.forEach(function (row) {
    var os = normOs(pick(row, ['O.S.', 'OS', 'O.S', 'O S']));
    if (os) setNheOsOnly[os] = true;
  });

  function temNhe(os) { return !!setNheOsOnly[os] || !!setNheEmProducaoOs[os]; }
  function temCargaReal(os) { return !!setCargaRealOs[os]; }

  var brutos = [];
  movementRows.forEach(function (item) {
    var row = item.row;
    var os = normOs(pick(row, ['OS', 'O.S.', 'O.S']));
    var date = movementDate(row);
    if (!os || !date) return;
    brutos.push({
      os: os,
      date: date,
      cliente: pick(row, ['Cliente']),
      local: pick(row, ['Local', 'Local de Embarque']),
      supervisao: pick(row, ['Supervisão', 'Supervisao']),
      funcionario: pick(row, ['Atualizado por', 'Atualizado Por', 'Classificador', 'Funcionário', 'Funcionario'])
    });
  });

  // Coordenada + Serviço de toda O.S. envolvida (informativo do dia + quem já
  // tem NHE/carga, já que essas últimas entram no cálculo de grupo) numa
  // única rodada de consultas — reaproveitada pro filtro de Serviço, pro
  // filtro de data, e pro agrupamento "Dois Embarques" por proximidade.
  var todasOs = brutos.map(function (item) { return item.os; })
    .concat(Object.keys(setCargaRealOs))
    .concat(Object.keys(setNheEmProducaoOs))
    .concat(Object.keys(setNheOsOnly));
  var coordPorOs = await resolverCoordenadasEmLote(todasOs);

  // Só entra no escopo desta tela O.S. de Serviço "Classificação FOB" ou
  // "Classificação CIF" (pedido do usuário 21/07) — qualquer outro serviço
  // (ex.: auditoria) nunca deveria virar pendência de NHE aqui, mesmo que
  // tenha "Última Atualização" no Mapa de Embarque.
  function servicoValido(os) {
    var info = coordPorOs[os];
    return !!(info && (!info.situacao || normText(info.situacao) === 'ABERTA') && info.servico && SERVICOS_FOB_CIF.indexOf(normText(info.servico)) !== -1);
  }

  var base = brutos.filter(function (item) { return servicoValido(item.os); });

  // Na lista de O.S., a coluna Embarque segue "UF - CIDADE (Embarque)".
  // O mesmo embarque é definido pelo valor COMPLETO dessa coluna. Assim,
  // armazéns com o mesmo nome em cidades/UFs diferentes não são agrupados.
  // Mantemos Cliente na chave para preservar a regra FOB original.
  function clusterKeys(item) {
    var info = coordPorOs[item.os] || {};
    var cliente = normText(item.cliente || info.cliente);
    var embarque = normText(info.embarque);
    return cliente && embarque ? [cliente + '|embarque:' + embarque] : [];
  }

  var grupos = {};
  function grupo(key) {
    if (!grupos[key]) grupos[key] = { temCargaReal: false, temNhe: false, temLaudo: false };
    return grupos[key];
  }
  function marcarPonto(item, tipo) {
    clusterKeys(item).forEach(function (key) { grupo(key)[tipo] = true; });
  }

  // Marca o que aparece no Mapa de Embarque.
  base.forEach(function (item) {
    if (temCargaReal(item.os)) marcarPonto(item, 'temCargaReal');
    if (temNhe(item.os)) marcarPonto(item, 'temNhe');
  });

  // Marca também O.S. com carga/NHE que não apareceram na base de informativos
  // do dia. Os dados de Cliente/Local/geo vêm de operacional_os, resolvidos acima.
  Object.keys(setCargaRealOs).forEach(function (os) {
    var info = coordPorOs[os];
    if (info) marcarPonto({ os: os, cliente: info.cliente, local: info.local }, 'temCargaReal');
  });
  Object.keys(setNheEmProducaoOs).concat(Object.keys(setNheOsOnly)).forEach(function (os) {
    var info = coordPorOs[os];
    if (info) marcarPonto({ os: os, cliente: info.cliente, local: info.local }, 'temNhe');
  });

  // Laudo anexado em qualquer O.S. do mesmo cliente+embarque também conta como
  // cobertura do embarque (pedido do usuário 06/08) — não precisa de outro
  // lançamento de NHE se já existe laudo ali.
  Object.keys(coordPorOs).forEach(function (os) {
    var info = coordPorOs[os];
    if (info && info.temLaudo) marcarPonto({ os: os, cliente: info.cliente, local: info.local }, 'temLaudo');
  });

  var pendentes = [];
  var bloqueadasCargaMesmoPonto = 0;
  base.forEach(function (item) {
    if (temCargaReal(item.os)) return;
    if (temNhe(item.os)) return;

    var relacionados = clusterKeys(item).map(function (key) { return grupos[key]; }).filter(Boolean);
    // Regra de segurança: qualquer carga real do mesmo Cliente no mesmo embarque
    // bloqueia a O.S., ainda que o saldo/linha desta O.S. esteja zerado.
    if (relacionados.some(function (g) { return g.temCargaReal; })) {
      bloqueadasCargaMesmoPonto++;
      return;
    }

    var status = relacionados.some(function (g) { return g.temNhe || g.temLaudo; }) ? 'DOIS EMBARQUES' : 'PENDENTE';
    if (status !== 'PENDENTE') return;
    pendentes.push({
      data: item.date,
      data_br: brDate(item.date),
      os: item.os,
      cliente: item.cliente,
      local: item.local,
      supervisao: item.supervisao,
      funcionario: item.funcionario,
      // já resolvido acima (coordenada + serviço) — evita nova consulta.
      osCoord: coordPorOs[item.os] || null
    });
  });
  if (bloqueadasCargaMesmoPonto) {
    log('INFO', bloqueadasCargaMesmoPonto + ' O.S. bloqueada(s): existe carga real do mesmo cliente no mesmo embarque (UF - CIDADE (EMBARQUE)).');
  }
  return pendentes;
}

async function buscarPendentes() {
  log('INFO', 'Recalculando regra do FOB para ' + referenceBr() + '...');
  var movement = await fetchMovementDaily();
  var production = await fetchProducaoSnapshotDia(referenceIso());
  var nhe = await fetchServiceDay('grm_nhe_importacoes', MAX_NHE_ROWS);
  var pendentes = await calcularPendentes(movement, production, nhe);
  log('SUCCESS', pendentes.length + ' O.S. pendente(s) de NHE em ' + referenceBr() + '.');
  return pendentes;
}

async function buscarPendenciasAnteriores(dataReferencia) {
  var inicio = new Date(dataReferencia + 'T12:00:00');
  inicio.setDate(inicio.getDate() - REPROCESSAR_DIAS);
  var statusesHistoricos = ['SEM_LOGIN', 'SEM_COORDENADA_OS', 'FORA_DO_RAIO', 'ERRO', 'SEM_FUNCIONARIO'];
  if (REPETIR_NAO_CONFIRMADO) statusesHistoricos.push('SALVO_NAO_CONFIRMADO');
  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,cliente,supervisao,funcionario,status,raw')
    .gte('data_referencia', ymd(inicio))
    .lt('data_referencia', dataReferencia)
    .in('status', statusesHistoricos)
    .order('data_referencia', { ascending: true });
  if (result.error) throw result.error;
  return (result.data || []).map(function (row) {
    return {
      data: row.data_referencia,
      data_br: brDate(row.data_referencia),
      os: normOs(row.numero_os),
      cliente: row.cliente,
      supervisao: row.supervisao,
      // Em lançamentos via gestor, `funcionario` guarda quem seria escolhido
      // no modal; para refazer a geofence precisamos do colaborador original.
      funcionario: row.raw && row.raw.colaborador_original ? row.raw.colaborador_original : row.funcionario,
      osCoord: undefined,
      reprocessamento: true,
      statusAnterior: row.status
    };
  });
}

function combinarPendentes(atuais, anteriores) {
  var porChave = {};
  (anteriores || []).concat(atuais || []).forEach(function (item) {
    if (!item || !item.os || !item.data) return;
    porChave[chaveUnica(item.data, item.os)] = item;
  });
  return Object.keys(porChave).map(function (key) { return porChave[key]; });
}

/* ---------------------------------------------------------------------- *
 * Coordenada da O.S. + login do colaborador dentro do raio
 * ---------------------------------------------------------------------- */

function haversineMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  function toRad(v) { return Number(v) * Math.PI / 180; }
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoord(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  return isFinite(Number(lat)) && isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && !(Number(lat) === 0 && Number(lng) === 0);
}

// Versão avulsa de resolverCoordenadasEmLote, usada só no modo manual (--os).
// Mesmo critério: só considera operacional_os com data_os <= data de
// referência (não pega reabertura futura do mesmo número de O.S.).
async function resolverCoordenadaOs(numeroOs, dataReferencia) {
  var result = await supabase
    .from('operacional_os')
    .select('numero_os,data_os,cliente,embarque,ponto1_nome,ponto1_latitude,ponto1_longitude,servico,supervisao,situacao,observacao_logistica')
    .eq('numero_os', numeroOs)
    .lte('data_os', dataReferencia || referenceIso())
    .order('data_os', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  var row = result.data;
  if (!row) return null;
  return {
    lat: isValidCoord(row.ponto1_latitude, row.ponto1_longitude) ? Number(row.ponto1_latitude) : null,
    lng: isValidCoord(row.ponto1_latitude, row.ponto1_longitude) ? Number(row.ponto1_longitude) : null,
    servico: row.servico,
    supervisao: row.supervisao,
    situacao: row.situacao,
    cliente: row.cliente,
    embarque: row.embarque,
    local: row.ponto1_nome || row.embarque,
    temLaudo: typeof row.observacao_logistica === 'string' && row.observacao_logistica.indexOf('LAUDO:') === 0
  };
}

var gestoresCache = null;
var loginsPorDataCache = {};

// --forcar sem login real (SEM_LOGIN) não tem de onde tirar a Coordenação/
// Supervisão do colaborador (grm_login_movimentos_importacoes não tem
// registro nesse dia) — sem isso, preencherEModalNhe cai no fallback da
// supervisão da O.S. (texto completo, ex. "MATO GROSSO MT1 - Lucas do Rio
// Verde/Nova Mutum"), que não bate como Coordenação e aciona o fallback por
// UF do embarque, que pode escolher a primeira opção que contém o prefixo
// (ex. "MATO GROSSO DO SUL" ao buscar "MATO GROSSO") e depois não achar o
// colaborador na lista de Funcionário errada. Busca o cadastro dele mesmo
// (mesma fonte usada por carregarGestores) pra preencher com o valor certo.
async function resolverCoordenacaoColaborador(nome) {
  var wanted = normText(nome);
  if (!wanted) return null;
  var result = await supabase
    .from('colaboradores')
    .select('nome,coordenacao,supervisao')
    .eq('situacao', 'Ativo');
  if (result.error) throw result.error;
  var achado = (result.data || []).find(function (row) { return normText(row.nome) === wanted; });
  return achado ? { coordenacao: achado.coordenacao, supervisao: achado.supervisao } : null;
}

async function carregarGestores() {
  if (gestoresCache) return gestoresCache;
  var result = await supabase
    .from('colaboradores')
    .select('nome,cargo,coordenacao,supervisao')
    .eq('situacao', 'Ativo')
    .in('cargo', ['Supervisor', 'Coordenador']);
  if (result.error) throw result.error;
  gestoresCache = result.data || [];
  return gestoresCache;
}

// Colaborador fora do raio: em vez de deixar pendente, lança no nome do
// gestor da regional (pedido do usuário 21/07). Prioriza o Supervisor cuja
// Supervisão bate exatamente com a da O.S. (mais específico); sem isso, cai
// pro Coordenador da mesma Coordenação. Sem nenhum dos dois, retorna null e
// o chamador mantém o comportamento antigo (fica PENDENTE).
async function buscarGestorRegional(coordenacao, supervisao) {
  var gestores = await carregarGestores();
  var alvoSupervisao = normText(supervisao);
  if (alvoSupervisao) {
    var porSupervisao = gestores.find(function (g) { return g.cargo === 'Supervisor' && normText(g.supervisao) === alvoSupervisao; });
    if (porSupervisao) return porSupervisao;

    // Achado 21/07 (O.S. em "SP - Cândido Mota"): existe gestor cadastrado
    // como Coordenador mas com a Supervisão exata dessa sub-região no
    // próprio registro (coordenacao dele é "SÃO PAULO", que não bate com o
    // prefixo "SP" derivado do texto) — tenta por Supervisão antes de cair
    // pro match (mais frágil) por Coordenação abaixo.
    var coordPorSupervisao = gestores.find(function (g) { return g.cargo === 'Coordenador' && normText(g.supervisao) === alvoSupervisao; });
    if (coordPorSupervisao) return coordPorSupervisao;
  }
  var alvoCoordenacao = normText(coordenacao);
  if (alvoCoordenacao) {
    var porCoordenacao = gestores.find(function (g) { return g.cargo === 'Coordenador' && normText(g.coordenacao) === alvoCoordenacao; });
    if (porCoordenacao) return porCoordenacao;
  }
  return null;
}

async function buscarLoginColaborador(dataYmd, funcionario, osCoord) {
  var wanted = normText(funcionario);
  if (!wanted) return null;

  // Não usar apenas .limit(5000): o limite máximo do PostgREST do projeto é
  // menor e truncava dias movimentados (07/08 teve 2.705 linhas), fazendo um
  // login existente como o da O.S. 88709 virar SEM_LOGIN. Pagina até o fim.
  var rows = loginsPorDataCache[dataYmd];
  if (!rows) {
    rows = await fetchPaged(function (from, to) {
      return supabase
        .from(TABLE_LOGIN)
        .select('colaborador,colaborador_chave,latitude,longitude,hora_movimento,coordenacao,supervisao')
        .eq('data_movimento', dataYmd)
        .order('id', { ascending: true })
        .range(from, to);
    }, 20000);
    loginsPorDataCache[dataYmd] = rows;
  }

  var candidatos = rows.filter(function (row) {
    return normText(row.colaborador) === wanted && isValidCoord(row.latitude, row.longitude);
  });
  if (!candidatos.length) return null;

  var melhor = null;
  candidatos.forEach(function (row) {
    var distancia = haversineMeters(row.latitude, row.longitude, osCoord.lat, osCoord.lng);
    if (!melhor || distancia < melhor.distancia) {
      melhor = {
        distancia: distancia,
        colaborador_chave: row.colaborador_chave,
        hora_movimento: row.hora_movimento,
        // Coordenação/Supervisão do PRÓPRIO colaborador (registro do login no
        // GRM) — é o que precisa ser selecionado no modal Adicionar NHE, pois
        // o campo Funcionário só lista quem pertence à Coordenação/Supervisão
        // escolhidas ali. Usar a supervisão da O.S. em vez da do colaborador
        // pode deixar a lista sem esse colaborador (confirmado pelo usuário).
        coordenacao: row.coordenacao,
        supervisao: row.supervisao
      };
    }
  });
  return melhor;
}

/* ---------------------------------------------------------------------- *
 * Persistência do resultado (audita e evita relançar)
 * ---------------------------------------------------------------------- */

function chaveUnica(dataReferencia, numeroOs) {
  return dataReferencia + '|' + numeroOs;
}

var nheRealPorChaveCache = {};
var movimentoRealPorChaveCache = {};

// Uma NHE não pode ser criada se a O.S. já tiver carga ou outro movimento no
// mesmo dia. Consulta diretamente Data + O.S.; não pagina o dia inteiro, pois
// grm_producao_diaria_importacoes é uma tabela volumosa e isso pode estourar o
// statement_timeout do Postgres.
async function existeMovimentoReal(dataReferencia, numeroOs) {
  var key = chaveUnica(dataReferencia, numeroOs);
  if (Object.prototype.hasOwnProperty.call(movimentoRealPorChaveCache, key)) {
    return movimentoRealPorChaveCache[key];
  }

  var result = await supabase.rpc('nhe_existe_movimento_real', {
    p_data: String(dataReferencia),
    p_os: String(normOs(numeroOs))
  });

  if (result.error) {
    throw new Error('Falha ao verificar movimento real para ' + key + ': ' + result.error.message);
  }

  var existe = result.data === true;
  movimentoRealPorChaveCache[key] = existe;
  return existe;
}

// Trava de segurança contra duplicidade histórica: a auditoria do bot não é
// a fonte de verdade para saber se uma NHE já existe. Antes de reprocessar uma
// O.S.+data, consulta o histórico REAL importado do GRM. Em caso de falha na
// consulta, lança erro e interrompe a execução (fail closed), em vez de correr
// o risco de salvar uma segunda NHE.
async function existeNheReal(dataReferencia, numeroOs) {
  var key = chaveUnica(dataReferencia, numeroOs);
  if (Object.prototype.hasOwnProperty.call(nheRealPorChaveCache, key)) {
    return nheRealPorChaveCache[key];
  }

  var result = await supabase.rpc('nhe_existe_nhe_real', {
    p_data: String(dataReferencia),
    p_os: String(normOs(numeroOs))
  });

  if (result.error) {
    throw new Error('Falha ao verificar NHE real para ' + key + ': ' + result.error.message);
  }

  var existe = result.data === true;
  nheRealPorChaveCache[key] = existe;
  return existe;
}

async function carregarJaLancadas(dataReferencia) {
  var inicio = new Date(dataReferencia + 'T12:00:00');
  inicio.setDate(inicio.getDate() - REPROCESSAR_DIAS);
  var statusesResolvidos = ['JA_EXISTIA_GRM', 'JA_EXISTIA_GRUPO_GRM', 'JA_EXISTIA_MOVIMENTO_GRM', 'MESMO_PONTO_AGRUPADO'];
  if (!REPETIR_NAO_CONFIRMADO) statusesResolvidos.push('SALVO_NAO_CONFIRMADO');
  var result = await supabase
    .from(TABLE_RESULTADOS)
    .select('data_referencia,numero_os,status')
    .gte('data_referencia', ymd(inicio))
    .lte('data_referencia', dataReferencia)
    .in('status', statusesResolvidos);
  if (result.error) throw result.error;
  var set = {};
  (result.data || []).forEach(function (row) { set[chaveUnica(row.data_referencia, row.numero_os)] = true; });
  return set;
}

function chaveGrupoEmbarque(candidato) {
  var info = candidato && candidato.osCoord ? candidato.osCoord : {};
  var cliente = normText((candidato && candidato.cliente) || info.cliente);
  var embarque = normText(info.embarque || info.local);
  return cliente && embarque ? cliente + '|embarque:' + embarque : '';
}

function identidadeGrupoEmbarque(candidato) {
  var info = candidato && candidato.osCoord ? candidato.osCoord : {};
  var embarque = String(info.embarque || '').trim();
  var match = embarque.match(/^(.*?)\s*\((.*)\)\s*$/);
  var cidade = match ? match[1].trim() : '';
  var ponto = match ? match[2].trim() : String(info.local || '').split('·')[0].trim();
  return {
    cliente: String((candidato && candidato.cliente) || info.cliente || '').trim(),
    cidade: cidade,
    ponto: ponto
  };
}

function observacaoPara(candidato) {
  return OBS_FIXA;
}

async function salvarResultado(candidato, patch) {
  var now = new Date().toISOString();
  var payload = Object.assign({
    chave_unica: chaveUnica(candidato.data, candidato.os),
    data_referencia: candidato.data,
    numero_os: candidato.os,
    cliente: candidato.cliente || null,
    supervisao: candidato.supervisao || null,
    coordenacao: candidato.osCoord ? candidato.osCoord.coordenacao : null,
    funcionario: candidato.viaGestor ? candidato.gestorNome : (candidato.funcionario || null),
    colaborador_chave: candidato.loginMatch ? candidato.loginMatch.colaborador_chave : null,
    distancia_m: candidato.loginMatch ? Math.round(candidato.loginMatch.distancia) : null,
    raio_m: RAIO_M,
    motivo: MOTIVO_FIXO,
    observacao: candidato.loginMatch ? observacaoPara(candidato) : OBS_FIXA,
    erro: null,
    raw: candidato.viaGestor ? { via_gestor: true, colaborador_original: candidato.funcionario, gestor: candidato.gestorNome } : null,
    updated_at: now
  }, patch);

  var result = await supabase.from(TABLE_RESULTADOS).upsert(payload, { onConflict: 'chave_unica' });
  if (result.error) throw result.error;
}

async function criarExecucao(dataReferencia) {
  var result = await supabase.from(TABLE_EXECUCOES).insert({
    data_referencia: dataReferencia,
    status: 'INICIADO',
    raw: { raio_m: RAIO_M, motivo: MOTIVO_FIXO, dry_run: DRY_RUN }
  }).select('id').single();
  if (result.error) { log('WARN', 'Não consegui criar execução: ' + result.error.message); return null; }
  return result.data ? result.data.id : null;
}

async function finalizarExecucao(runId, patch) {
  if (!runId) return;
  patch.finalizado_em = new Date().toISOString();
  var result = await supabase.from(TABLE_EXECUCOES).update(patch).eq('id', runId);
  if (result.error) log('WARN', 'Falha ao finalizar execução: ' + result.error.message);
}

async function enfileirarContinuacao() {
  var aberto = await supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', 'sync-lancar-nhe')
    .eq('status', 'pendente')
    .limit(1);
  if (aberto.error) throw aberto.error;
  if (aberto.data && aberto.data.length) return false;
  var result = await supabase.from('grm_sync_jobs').insert({
    agente_id: 'sync-lancar-nhe',
    status: 'pendente',
    payload: { continuacao: true }
  });
  if (result.error) throw result.error;
  return true;
}

/* ---------------------------------------------------------------------- *
 * Puppeteer: login + lançamento do NHE
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
    var dir = process.env.GRM_DEBUG_DIR || path.join(os.tmpdir(), 'grm-sync-lancar-nhe-debug');
    fs.mkdirSync(dir, { recursive: true });
    var p = path.join(dir, name);
    await page.screenshot({ path: p, fullPage: false });
    log('DEBUG', 'Screenshot salvo em ' + p);
  } catch (e) { /* debug apenas, nunca derruba o fluxo */ }
}

// Clique real (mousedown+mouseup via CDP) no campo identificado pelo rótulo,
// dentro do diálogo "Adicionar NHE" — um .click() sintético via DOM NÃO abre
// o menu do v-autocomplete (confirmado ao vivo: some ainda clica em outro
// elemento da página por trás, ex. o menu de navegação lateral).
async function realClickCampoNhe(page, label) {
  var box = await page.evaluate(function (label) {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
    var wanted = norm(label);
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return norm(d.innerText || '').indexOf('ADICIONAR NHE') !== -1; });
    if (!dialog) return null;
    var fields = Array.from(dialog.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field'));
    var f = fields.find(function (field) { return norm(field.innerText || '').indexOf(wanted) !== -1; });
    if (!f) return null;
    var r = f.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (!box) throw new Error('Campo "' + label + '" não encontrado no modal Adicionar NHE.');
  await page.mouse.click(box.x, box.y);
}

// Os autocompletes do GRM carregam apenas um subconjunto inicial das opções.
// Coordenações que não estão nesse primeiro lote (ex.: CASCAVEL/PARANÁ) só
// aparecem depois que o texto é digitado e a busca remota é disparada.
async function buscarNoCampoNhe(page, label, texto) {
  var inputHandle = await page.evaluateHandle(function (payload) {
    function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return norm(d.innerText || '').indexOf('ADICIONAR NHE') !== -1; });
    if (!dialog) return null;
    var wanted = norm(payload.label);
    var fields = Array.from(dialog.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field'));
    var field = fields.find(function (f) { return norm(f.innerText || '').indexOf(wanted) !== -1; });
    return field ? field.querySelector('input') : null;
  }, { label: label });
  var input = inputHandle && inputHandle.asElement();
  if (!input) throw new Error('Input do campo "' + label + '" não encontrado no modal Adicionar NHE.');
  await input.click({ clickCount: 3 });
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (texto) await input.type(String(texto), { delay: 50 });
}

// modo: 'primeira' (clica a 1ª opção da lista — usado quando só há uma opção
// possível, ex. Supervisão já filtrada pela Coordenação), 'exata' (texto
// normalizado === alvo) ou 'substring' (alvo contido no texto ou vice-versa —
// usado pra Coordenação/Funcionário, onde o texto exibido pode ter sufixos
// como " - Geral"). IMPORTANTE: os valores capturados no Node (alvo, modo)
// precisam ser passados como dado serializável pro page.evaluate — uma
// closure do Node (função + toString) NÃO carrega as variáveis capturadas
// pro contexto da página (bug já visto ao vivo: ReferenceError na variável
// capturada, pois só o texto-fonte da função sobrevive à serialização).
async function selecionarOpcaoAberta(page, alvo, modo) {
  // Polling cobre a latência da busca server-side dos v-autocompletes. Uma
  // espera fixa de 800ms era curta e transformava lentidão em falso "não achei".
  for (var tentativa = 0; tentativa < 15; tentativa++) {
    await wait(tentativa === 0 ? 800 : 300);
    var clicked = await page.evaluate(function (payload) {
      function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
      var alvoNorm = norm(payload.alvo);
      var overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
      for (var i = overlays.length - 1; i >= 0; i--) {
        var options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
        for (var j = 0; j < options.length; j++) {
          var textoOriginal = (options[j].innerText || options[j].textContent || '').trim();
          if (!textoOriginal) continue;
          var texto = norm(textoOriginal);
          var bate = false;
          if (payload.modo === 'primeira') bate = true;
          else if (payload.modo === 'exata') bate = texto === alvoNorm;
          else bate = alvoNorm.length > 0 && (texto.indexOf(alvoNorm) !== -1 || alvoNorm.indexOf(texto) !== -1);
          if (bate) { options[j].click(); return textoOriginal; }
        }
      }
      return null;
    }, { alvo: alvo || '', modo: modo || 'substring' });
    if (clicked) return clicked;
  }
  return null;
}

async function abrirOsEModalCargas(page, numeroOs) {
  await page.goto('https://www.grmserver.com.br/operation/serviceOrder', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2500);

  var filterButton = await page.$('.serviceOrder-act-filter button, .serviceOrder-act-filter');
  if (filterButton) {
    await filterButton.click();
    await wait(400);
  }

  var osFilled = await page.evaluate(function (numeroOs) {
    var input = Array.from(document.querySelectorAll('input')).find(function (i) {
      var lbl = (i.closest('.v-input') || {}).innerText || '';
      return lbl.trim().indexOf('O.S') === 0;
    }) || Array.from(document.querySelectorAll('input')).find(function (i) {
      return String(i.placeholder || '').trim().toUpperCase() === 'FILTRAR PESQUISA';
    });
    if (!input) return false;
    input.focus();
    return true;
  }, String(numeroOs));
  if (!osFilled) throw new Error('Campo "O.S." não encontrado na tela de Ordem de Serviço.');

  var osInputHandle = await page.evaluateHandle(function () {
    return Array.from(document.querySelectorAll('input')).find(function (i) {
      var lbl = (i.closest('.v-input') || {}).innerText || '';
      return lbl.trim().indexOf('O.S') === 0;
    }) || Array.from(document.querySelectorAll('input')).find(function (i) {
      return String(i.placeholder || '').trim().toUpperCase() === 'FILTRAR PESQUISA';
    });
  });
  await osInputHandle.asElement().click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await osInputHandle.asElement().type(String(numeroOs), { delay: 30 });
  await wait(400);

  var buscaGlobal = await osInputHandle.asElement().evaluate(function (input) {
    return String(input.placeholder || '').trim().toUpperCase() === 'FILTRAR PESQUISA';
  });
  var searchClicked = buscaGlobal || await page.evaluate(function () {
    var btn = document.querySelector('.serviceOrder-act-search button, .serviceOrder-act-search');
    if (!btn) return false;
    (btn.tagName === 'BUTTON' ? btn : btn.querySelector('button') || btn).click();
    return true;
  });
  if (!searchClicked) throw new Error('Botão de busca (.serviceOrder-act-search) não encontrado.');
  await wait(2500);

  var rowSelected = await page.evaluate(function (numeroOs) {
    var cell = Array.from(document.querySelectorAll('td')).find(function (td) { return td.textContent.trim() === numeroOs; });
    if (!cell) return false;
    var row = cell.closest('tr');
    var checkbox = row && row.querySelector('input[type="checkbox"]');
    if (!checkbox) return false;
    checkbox.click();
    return true;
  }, String(numeroOs));
  if (!rowSelected) throw new Error('O.S. ' + numeroOs + ' não encontrada na listagem após a busca.');
  await wait(800);

  var truckClicked = await page.evaluate(function () {
    var icon = document.querySelector('lord-icon[src*="497-truck-delivery"]');
    var btn = icon ? icon.closest('button') : null;
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    btn.click();
    return true;
  });
  if (!truckClicked) throw new Error('Ícone "Lista de Cargas" (caminhão) não encontrado/habilitado.');
  await wait(1800);

  var nheClicked = await page.evaluate(function () {
    var buttons = Array.from(document.querySelectorAll('.sOrderloads-act-add-nhe button'));
    buttons.forEach(function (button) { button.click(); });
    return buttons.length > 0;
  });
  if (!nheClicked) {
    throw new Error('A ação "+NHE" não está disponível para a conta de automação na tela atual do Graint.');
  }

  // Poll em vez de um wait fixo único: um wait(1200) + checagem única falhava
  // com "Modal não abriu" sempre que o GRM demorava um pouco mais que o normal
  // pra montar o overlay (achado investigando a O.S. 90394 — o mesmo clique,
  // repetido com polling, abriu o modal em ~300ms de forma consistente; não
  // era seletor quebrado, só falta de folga no timing). Tenta a cada 300ms por
  // até 6s antes de desistir.
  var modalAberto = false;
  for (var tentativa = 0; tentativa < 20; tentativa++) {
    await wait(300);
    modalAberto = await page.evaluate(function () {
      return Array.from(document.querySelectorAll('.v-overlay--active')).some(function (d) {
        return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1;
      });
    });
    if (modalAberto) break;
  }
  if (!modalAberto) throw new Error('Modal "Adicionar NHE" não abriu.');
}

var COORDENACAO_POR_UF = {
  AC: 'ACRE', AL: 'ALAGOAS', AP: 'AMAPA', AM: 'AMAZONAS', BA: 'BAHIA', CE: 'CEARA',
  DF: 'DISTRITO FEDERAL', ES: 'ESPIRITO SANTO', GO: 'GOIAS', MA: 'MARANHAO', MT: 'MATO GROSSO',
  MS: 'MATO GROSSO DO SUL', MG: 'MINAS GERAIS', PA: 'PARA', PB: 'PARAIBA', PR: 'PARANA',
  PE: 'PERNAMBUCO', PI: 'PIAUI', RJ: 'RIO DE JANEIRO', RN: 'RIO GRANDE DO NORTE',
  RS: 'RIO GRANDE DO SUL', RO: 'RONDONIA', RR: 'RORAIMA', SC: 'SANTA CATARINA',
  SP: 'SAO PAULO', SE: 'SERGIPE', TO: 'TOCANTINS'
};

function coordenacaoPorUf(osCoord) {
  var embarque = normText(osCoord && osCoord.embarque);
  var match = embarque.match(/^([A-Z]{2})\s*-/);
  return match ? (COORDENACAO_POR_UF[match[1]] || '') : '';
}

// Fonte de verdade ao vivo: consulta o endpoint do relatório NHE na sessão já
// autenticada do GRM. Serve tanto como trava pré-lançamento quanto como
// confirmação pós-Salvar. Assim não dependemos da defasagem do sync Supabase.
async function existeNheNoGrmAoVivo(page, dataYmd, numeroOs) {
  var dataBr = brDate(dataYmd);
  return page.evaluate(async function (payload) {
    function normalizarData(value) {
      var texto = String(value || '').trim();
      var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
      var br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      return br ? br[3] + '-' + br[2] + '-' + br[1] : '';
    }
    var token = '';
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var value = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (value && value.userToken) token = value.userToken;
      } catch (_) {}
    }
    if (!token) throw new Error('Token do GRM não encontrado para confirmar NHE.');
    var response = await fetch('/api/reports/classification/nhe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lnsDateFrom: payload.dataBr, lnsDateTo: payload.dataBr })
    });
    var json = await response.json();
    if (!response.ok || json.result === false) {
      throw new Error('Consulta NHE GRM falhou: ' + JSON.stringify(json).slice(0, 500));
    }
    var rows = json.searchData || [];
    return rows.some(function (row) {
      return String(row.sorCode) === String(payload.os)
        && normalizarData(row.lnsDate) === payload.dataYmd;
    });
  }, { dataBr: dataBr, dataYmd: String(dataYmd), os: String(numeroOs) });
}

// Trava ao vivo por Cliente + ponto de embarque. A NHE é única para o
// agrupamento na data, inclusive entre execuções de continuação do mesmo lote.
async function existeNheMesmoPontoNoGrmAoVivo(page, candidato) {
  var dataBr = brDate(candidato.data);
  var identidade = identidadeGrupoEmbarque(candidato);
  return page.evaluate(async function (payload) {
    function normalizarData(value) {
      var texto = String(value || '').trim();
      var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
      var br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      return br ? br[3] + '-' + br[2] + '-' + br[1] : '';
    }
    function norm(value) {
      return String(value == null ? '' : value)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    }
    var token = '';
    for (var i = 0; i < localStorage.length; i++) {
      try {
        var value = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (value && value.userToken) token = value.userToken;
      } catch (_) {}
    }
    if (!token) throw new Error('Token do GRM não encontrado para confirmar grupo NHE.');
    var response = await fetch('/api/reports/classification/nhe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lnsDateFrom: payload.dataBr, lnsDateTo: payload.dataBr })
    });
    var json = await response.json();
    if (!response.ok || json.result === false) {
      throw new Error('Consulta NHE GRM por grupo falhou: ' + JSON.stringify(json).slice(0, 500));
    }
    var cliente = norm(payload.identidade.cliente);
    var cidade = norm(payload.identidade.cidade);
    var ponto = norm(payload.identidade.ponto);
    var rows = json.searchData || [];
    var found = rows.find(function (row) {
      if (normalizarData(row.lnsDate) !== payload.dataYmd) return false;
      if (norm(row.cliName) !== cliente) return false;
      if (ponto && norm(row.splName) !== ponto) return false;
      if (cidade && norm(row.citEmb) !== cidade) return false;
      return true;
    });
    return found ? {
      existe: true,
      os: String(found.sorCode == null ? '' : found.sorCode),
      cliente: String(found.cliName || ''),
      ponto: String(found.splName || ''),
      cidade: String(found.citEmb || '')
    } : { existe: false };
  }, { dataBr: dataBr, dataYmd: String(candidato.data), identidade: identidade });
}

async function preencherEModalNhe(page, candidato, dryRun, debug) {
  var dataBr = brDate(candidato.data);

  await realClickCampoNhe(page, 'Coordenação');
  // O campo Funcionário só lista quem pertence à Coordenação/Supervisão
  // escolhidas aqui — por isso a região tem que ser a do PRÓPRIO colaborador
  // (registrada no login dele, grm_login_movimentos_importacoes), não a da
  // O.S.: um colaborador pode estar registrado numa supervisão ligeiramente
  // diferente da supervisão gravada na O.S., e nesse caso ele não apareceria
  // na lista se seguíssemos a supervisão da O.S. (confirmado pelo usuário).
  // osCoord.supervisao só entra como fallback se o login não tiver essa info.
  // Quando lança no nome do GESTOR (colaborador fora do raio), a região tem
  // que ser a do PRÓPRIO gestor (onde ele está cadastrado), não a do
  // colaborador original que logou longe — senão o Funcionário não o acha.
  var regiaoAlvo = candidato.viaGestor
    ? (candidato.gestorCoordenacao || candidato.gestorSupervisao || '')
    : (candidato.loginMatch && (candidato.loginMatch.coordenacao || candidato.loginMatch.supervisao))
      || (candidato.osCoord && candidato.osCoord.supervisao)
      || candidato.supervisao || '';
  await buscarNoCampoNhe(page, 'Coordenação', regiaoAlvo);
  var coordEscolhida = await selecionarOpcaoAberta(page, regiaoAlvo, 'substring');
  if (!coordEscolhida) {
    var coordUf = coordenacaoPorUf(candidato.osCoord);
    if (coordUf && normText(coordUf) !== normText(regiaoAlvo)) {
      await buscarNoCampoNhe(page, 'Coordenação', coordUf);
      coordEscolhida = await selecionarOpcaoAberta(page, coordUf, 'substring');
      if (coordEscolhida) log('INFO', 'Coordenação resolvida por UF do embarque (' + coordUf + '): ' + coordEscolhida);
    }
  }
  if (!coordEscolhida) throw new Error('Não achei opção de Coordenação compatível com "' + regiaoAlvo + '" nem com a UF da O.S.');
  log('INFO', 'Coordenação selecionada: ' + coordEscolhida);

  // Supervisão é populada por um fetch em cascata disparado pela escolha da
  // Coordenação — precisa de uma folga maior antes de tentar abrir o campo,
  // senão a lista ainda está vazia (confirmado ao vivo: sem essa espera extra
  // o campo abre sem nenhuma opção).
  await wait(1200);
  await realClickCampoNhe(page, 'Supervisão');
  var supervisaoAlvo = candidato.viaGestor
    ? (candidato.gestorSupervisao || '')
    : ((candidato.loginMatch && candidato.loginMatch.supervisao) || '');
  var supEscolhida = supervisaoAlvo ? await selecionarOpcaoAberta(page, supervisaoAlvo, 'substring') : null;
  // Sem opção batendo com a supervisão do colaborador (ou só existe 1 opção
  // mesmo, caso mais comum quando a Coordenação já é bem específica): cai
  // pra "primeira" — a lista continua aberta porque nenhum clique aconteceu.
  if (!supEscolhida) supEscolhida = await selecionarOpcaoAberta(page, '', 'primeira');
  if (!supEscolhida) throw new Error('Não consegui selecionar Supervisão (nenhuma opção na lista).');
  log('INFO', 'Supervisão selecionada: ' + supEscolhida);

  // Funcionário é uma busca server-side com resultado padrão pequeno (~27-48
  // nomes) que NÃO necessariamente inclui o colaborador certo — confirmado ao
  // vivo: um colaborador real da própria Coordenação/Supervisão escolhida só
  // apareceu depois de digitar o nome no campo (o clique sozinho não é
  // suficiente, é preciso digitar pra disparar a busca filtrada no servidor).
  var nomeParaFuncionario = candidato.viaGestor ? candidato.gestorNome : candidato.funcionario;

  await realClickCampoNhe(page, 'Funcionário');
  await wait(900);
  var primeiroNome = String(nomeParaFuncionario || '').trim().split(/\s+/)[0] || '';
  if (primeiroNome) {
    // Não confiar em document.activeElement após o clique de mouse (o campo
    // pode não ter recebido foco de verdade) — acha explicitamente o <input>
    // de busca dentro do campo Funcionário e digita nele via elementHandle.
    var inputHandle = await page.evaluateHandle(function () {
      function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
      var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
      var dialog = dialogs.reverse().find(function (d) { return norm(d.innerText || '').indexOf('ADICIONAR NHE') !== -1; });
      var fields = Array.from(dialog.querySelectorAll('.v-input, .v-select, .v-autocomplete, .v-field'));
      var f = fields.find(function (field) { return norm(field.innerText || '').indexOf('FUNCIONARIO') !== -1; });
      return f ? f.querySelector('input') : null;
    });
    var el = inputHandle && inputHandle.asElement();
    if (el) {
      await el.type(primeiroNome, { delay: 80 });
    } else {
      await page.keyboard.type(primeiroNome, { delay: 80 });
    }
  }
  await wait(1500);
  var funcEscolhido = await selecionarOpcaoAberta(page, nomeParaFuncionario, 'substring');
  if (!funcEscolhido) throw new Error('Não achei "' + nomeParaFuncionario + '" na lista de Funcionário (busquei por "' + primeiroNome + '").');
  log('INFO', 'Funcionário selecionado: ' + funcEscolhido);

  // O GRM atualizado passou a exigir interação real para atualizar o model da Data.
  var dataInput = await page.$('#lnsDate');
  if (!dataInput) throw new Error('Campo Data (#lnsDate) não encontrado.');
  var inputType = await dataInput.evaluate(function (input) { return String(input.type || 'text').toLowerCase(); });
  if (inputType === 'date') {
    await dataInput.evaluate(function (input, value) {
      input.focus();
      var proto = window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, candidato.data);
    await page.keyboard.press('Tab');
  } else {
    await dataInput.click({ clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await dataInput.type(dataBr, { delay: 90 });
    await page.keyboard.press('Tab');
  }
  await wait(500);
  var dataValor = await page.$eval('#lnsDate', function (input) { return String(input.value || '').trim(); });
  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }
  var recebido = soDigitos(dataValor);
  if (recebido !== soDigitos(dataBr) && recebido !== soDigitos(candidato.data)) {
    throw new Error('Campo Data não permaneceu com a data solicitada. Esperado=' + dataBr + ', campo=' + dataValor);
  }
  log('INFO', 'Data NHE preenchida e validada no formulário: ' + dataValor + ' (referência ' + candidato.data + ')');

  await realClickCampoNhe(page, 'Motivo');
  var motivoEscolhido = await selecionarOpcaoAberta(page, MOTIVO_FIXO, 'exata');
  if (!motivoEscolhido) throw new Error('Motivo "' + MOTIVO_FIXO + '" não encontrado na lista.');

  var obsOk = await page.evaluate(function (payload) {
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1; });
    if (!dialog) return false;
    var field = Array.from(dialog.querySelectorAll('.v-input, .v-field')).find(function (f) {
      return (f.innerText || '').toUpperCase().indexOf('OBS') !== -1;
    });
    var input = field && (field.querySelector('input') || field.querySelector('textarea'));
    if (!input) return false;
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(input, payload.value); else input.value = payload.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }, { value: observacaoPara(candidato) });
  if (!obsOk) log('WARN', 'Campo Obs. não encontrado — seguindo sem observação.');

  if (debug) await shot(page, 'os-' + candidato.os + '-form-preenchido.png');

  if (dryRun) {
    log('INFO', 'DRY-RUN: formulário preenchido, cancelando em vez de salvar.');
    var cancelado = await page.evaluate(function () {
      var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
      var dialog = dialogs.reverse().find(function (d) { return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1; });
      var btn = dialog && Array.from(dialog.querySelectorAll('button')).find(function (b) { return (b.innerText || '').toUpperCase().indexOf('CANCELAR') !== -1; });
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!cancelado) log('WARN', 'Botão Cancelar não encontrado no dry-run.');
    return;
  }

  // Diagnóstico da atualização do GRM: captura XHR/fetch disparados pelo Salvar.
  // Não registra headers/tokens; somente método, URL, status, payload e resposta limitada.
  var respostasSalvar = [];
  var falhasSalvar = [];
  var promessasSalvar = [];
  function onResponseSalvar(response) {
    try {
      var req = response.request();
      var tipo = req.resourceType();
      if (tipo !== 'xhr' && tipo !== 'fetch') return;
      if (response.url().indexOf('/api/') === -1) return;
      var promessa = response.text().catch(function () { return ''; }).then(function (body) {
        respostasSalvar.push({
          metodo: req.method(),
          url: response.url(),
          status: response.status(),
          payload: String(req.postData() || '').slice(0, 1500),
          resposta: String(body || '').slice(0, 1500)
        });
      });
      promessasSalvar.push(promessa);
    } catch (_) {}
  }
  function onFalhaSalvar(request) {
    try {
      var tipo = request.resourceType();
      if ((tipo === 'xhr' || tipo === 'fetch') && request.url().indexOf('/api/') !== -1) {
        falhasSalvar.push({ metodo: request.method(), url: request.url(), erro: request.failure() });
      }
    } catch (_) {}
  }
  page.on('response', onResponseSalvar);
  page.on('requestfailed', onFalhaSalvar);

  var salvo = await page.evaluate(function () {
    var dialogs = Array.from(document.querySelectorAll('.v-overlay--active'));
    var dialog = dialogs.reverse().find(function (d) { return (d.innerText || '').toUpperCase().indexOf('ADICIONAR NHE') !== -1; });
    var btn = dialog && Array.from(dialog.querySelectorAll('button')).find(function (b) { return (b.innerText || '').toUpperCase().indexOf('SALVAR') !== -1; });
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!salvo) {
    page.removeListener('response', onResponseSalvar);
    page.removeListener('requestfailed', onFalhaSalvar);
    throw new Error('Botão "Salvar" não encontrado no modal Adicionar NHE.');
  }
  await wait(4000);
  page.removeListener('response', onResponseSalvar);
  page.removeListener('requestfailed', onFalhaSalvar);
  await Promise.allSettled(promessasSalvar);

  var mensagensUi = await page.evaluate(function () {
    var seletores = '.v-snackbar--active,.v-alert,[role="alert"],.v-messages__message';
    return Array.from(document.querySelectorAll(seletores))
      .map(function (el) { return String(el.innerText || el.textContent || '').trim(); })
      .filter(Boolean)
      .slice(-20);
  }).catch(function () { return []; });

  log('INFO', 'DIAGNOSTICO_SALVAR_HTTP=' + JSON.stringify(respostasSalvar));
  if (falhasSalvar.length) log('WARN', 'DIAGNOSTICO_SALVAR_FALHAS=' + JSON.stringify(falhasSalvar));
  if (mensagensUi.length) log('INFO', 'DIAGNOSTICO_SALVAR_UI=' + JSON.stringify(mensagensUi));

  var jaTemMovimento = respostasSalvar.some(function (item) {
    return String(item && item.resposta || '').indexOf('sOrderHasDayMovement') !== -1;
  });
  if (jaTemMovimento) {
    var errMov = new Error('GRM informou que a O.S. já possui carga ou dia sem embarque nesta data.');
    errMov.code = 'GRM_JA_POSSUI_MOVIMENTO';
    throw errMov;
  }
}

// Depois de lançar NHE de verdade no GRM, o painel FOB (logistica-fob-page-v9.js)
// só passa a mostrar essas O.S. na aba "Ok" quando grm_nhe_importacoes tiver um
// LOTE recente com essas linhas — a tela escolhe o lote com mais linhas batendo
// a data de referência (chooseServiceBatch), então inserir manualmente 1 linha
// por O.S. aqui perderia essa disputa contra o próximo lote real. Mais robusto:
// rodar o sync de leitura já existente (grm-sync-nhe.js), que baixa o relatório
// de verdade do GRM (já refletindo os lançamentos que acabamos de fazer) e vira
// o lote mais recente — sem duplicar a lógica de download/parse aqui.
async function atualizarRelatorioNhe() {
  log('INFO', 'Garantindo refresh do relatório NHE pela fila controlada (sync-nhe)...');

  var result = await supabase.rpc('enqueue_grm_sync_job_internal', {
    p_agent_id: 'sync-nhe',
    p_payload: {
      origem: 'sync-lancar-nhe',
      motivo: 'pos_lancamento_nhe',
      reprocessar_dias: REPROCESSAR_DIAS,
      solicitado_em: new Date().toISOString()
    }
  });

  if (result.error) {
    log('WARN', 'NHE foi lançado, mas não foi possível enfileirar sync-nhe: ' +
      result.error.message + ' — o próximo sync automático poderá atualizar o FOB.');
    return false;
  }

  if (!result.data) {
    log('WARN', 'NHE foi lançado, porém sync-nhe está desabilitado; refresh imediato não criado.');
    return false;
  }

  log('SUCCESS', 'Refresh NHE garantido pela fila entrada_os | job=' + result.data + '.');
  return true;
}

async function fecharModais(page) {
  try {
    await page.evaluate(function () {
      Array.from(document.querySelectorAll('.v-overlay--active')).forEach(function (overlay) {
        var closeBtn = overlay.querySelector('button.v-btn[aria-label="Close"], .mdi-close');
        if (closeBtn) (closeBtn.closest('button') || closeBtn).click();
      });
    });
    await page.keyboard.press('Escape');
    await wait(500);
  } catch (e) { /* best-effort */ }
}

async function lancarNheParaCandidato(page, candidato, dryRun, debug) {
  await abrirOsEModalCargas(page, candidato.os);
  if (debug) await shot(page, 'os-' + candidato.os + '-modal-cargas.png');
  await preencherEModalNhe(page, candidato, dryRun, debug);
  await fecharModais(page);
}

/* ---------------------------------------------------------------------- *
 * Main
 * ---------------------------------------------------------------------- */

async function main() {
  assertConfig();
  var args = parseArgs(process.argv.slice(2));
  var debug = args.debug || DEBUG;
  var dryRun = args.dryRun || DRY_RUN;
  var runId = null;

  var stats = { pendentes: 0, candidatos: 0, sucesso: 0, erro: 0, semLogin: 0, semFuncionario: 0, foraDoRaio: 0, semCoordenadaOs: 0, semServico: 0, viaGestor: 0, jaExistiaGrm: 0, jaExistiaMovimento: 0, osNaoAberta: 0, salvoNaoConfirmado: 0, mesmoPontoAgrupado: 0, nheMesmoPontoGrm: 0 };

  try {
    log('INFO', '=== Lançamento automático de NHE (raio=' + RAIO_M + 'm, motivo="' + MOTIVO_FIXO + '"' + (dryRun ? ', DRY-RUN' : '') + ') ===');
    var dataReferencia = referenceIso();
    runId = await criarExecucao(dataReferencia);

    var pendentesAtuais = await buscarPendentes();
    var pendenciasAnteriores = await buscarPendenciasAnteriores(dataReferencia);
    var pendentes = combinarPendentes(pendentesAtuais, pendenciasAnteriores);
    if (pendenciasAnteriores.length) {
      log('INFO', pendenciasAnteriores.length + ' pendência(s) dos últimos ' + REPROCESSAR_DIAS + ' dias incluída(s) para nova tentativa.');
    }
    if (args.os) {
      var osSolicitada = normOs(args.os);
      pendentes = pendentes.filter(function (item) {
        return item.os === osSolicitada && (!args.data || item.data === ymd(args.data));
      });

      // Um --dry-run valida o formulário mas grava DRY_RUN_OK, que de propósito
      // não entra na fila histórica automática. Quando o operador pede
      // explicitamente a MESMA O.S.+data depois do teste, reconstrói somente
      // esse candidato a partir da auditoria. As travas reais abaixo continuam
      // obrigatórias: NHE/movimento existente, situação da O.S., serviço, login
      // e geofence são recalculados antes de qualquer Salvar.
      if (!pendentes.length && args.data) {
        var dataSolicitada = ymd(args.data);
        var dryResult = await supabase
          .from(TABLE_RESULTADOS)
          .select('data_referencia,numero_os,cliente,supervisao,funcionario,status,raw')
          .eq('data_referencia', dataSolicitada)
          .eq('numero_os', osSolicitada)
          .eq('status', 'DRY_RUN_OK')
          .limit(1)
          .maybeSingle();
        if (dryResult.error) throw dryResult.error;
        if (dryResult.data) {
          var dryRow = dryResult.data;
          pendentes = [{
            data: dryRow.data_referencia,
            data_br: brDate(dryRow.data_referencia),
            os: normOs(dryRow.numero_os),
            cliente: dryRow.cliente,
            supervisao: dryRow.supervisao,
            funcionario: dryRow.raw && dryRow.raw.colaborador_original ? dryRow.raw.colaborador_original : dryRow.funcionario,
            osCoord: undefined,
            reprocessamento: true,
            statusAnterior: 'DRY_RUN_OK'
          }];
          log('INFO', 'O.S. ' + osSolicitada + ' em ' + dataSolicitada + ': reaberta manualmente após DRY_RUN_OK; travas de segurança serão revalidadas.');
        }
      }

      if (pendentes.length && args.funcionario) pendentes[0].funcionario = args.funcionario;
      if (!pendentes.length) {
        log('WARN', 'O.S. ' + osSolicitada + (args.data ? ' em ' + args.data : '') + ' não é elegível: pode existir carga/NHE no mesmo ponto, serviço fora do escopo ou ausência de informativo. --forcar não ignora esta regra.');
      }
    }
    stats.pendentes = pendentes.length;

    var jaLancadas = await carregarJaLancadas(dataReferencia);
    var candidatos = [];

    for (var i = 0; i < pendentes.length; i++) {
      var p = pendentes[i];
      var chavePendente = chaveUnica(p.data, p.os);
      if (jaLancadas[chavePendente]) continue;

      // Não confiar apenas em logistica_nhe_lancamentos_auto: uma execução
      // antiga pode ter falhado/registrado SEM_LOGIN enquanto a NHE foi
      // lançada manualmente ou por outro fluxo. O histórico importado do GRM
      // é verificado por O.S.+data antes de abrir a tela de lançamento.
      var temNheReal = false;
      var temMovimentoReal = false;
      try {
        temNheReal = await existeNheReal(p.data, p.os);
        if (!temNheReal) temMovimentoReal = await existeMovimentoReal(p.data, p.os);
      } catch (checkError) {
        stats.erro++;
        var msgCheck = 'Falha na trava de segurança NHE/movimento para ' + p.data + '|' + p.os + ': ' + String(checkError.message || checkError);
        await salvarResultado(p, { status: 'ERRO', erro: msgCheck.slice(0, 2000) });
        log('ERROR', msgCheck + ' — O.S. bloqueada nesta execução; seguindo para as demais.');
        continue;
      }

      if (temNheReal) {
        stats.jaExistiaGrm++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'NHE já existente no GRM antes desta execução',
            origem_verificacao: 'rpc:nhe_existe_nhe_real',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': NHE já existe no GRM; lançamento bloqueado.');
        continue;
      }

      if (temMovimentoReal) {
        stats.jaExistiaMovimento++;
        await salvarResultado(p, {
          status: 'JA_EXISTIA_MOVIMENTO_GRM',
          erro: null,
          lancado_em: null,
          raw: {
            reconciliacao: 'Produção Diária já possui carga/movimento para esta O.S.+data',
            origem_verificacao: 'rpc:nhe_existe_movimento_real',
            nao_lancado_nesta_execucao: true
          }
        });
        jaLancadas[chavePendente] = true;
        log('INFO', 'O.S. ' + p.os + ' em ' + p.data + ': já existe carga/movimento no GRM; lançamento de NHE bloqueado.');
        continue;
      }

      if (!p.funcionario) {
        stats.semFuncionario++;
        await salvarResultado(p, { status: 'SEM_FUNCIONARIO', erro: 'Informativo sem valor no campo Atualizado por/Funcionário.' });
        continue;
      }

      // pendentes vindos de calcularPendentes já trazem osCoord resolvido; o
      // modo manual (--os) não passa por calcularPendentes, então resolve na
      // hora (mesmo critério: data_os <= referência).
      var osCoord = p.osCoord !== undefined ? p.osCoord : await resolverCoordenadaOs(p.os, p.data);
      if (!osCoord) {
        stats.semCoordenadaOs++;
        await salvarResultado(p, { status: 'SEM_COORDENADA_OS' });
        continue;
      }

      if (osCoord.situacao && normText(osCoord.situacao) !== 'ABERTA') {
        stats.osNaoAberta++;
        await salvarResultado(Object.assign({}, p, { osCoord: osCoord }), {
          status: 'OS_NAO_ABERTA',
          erro: 'O.S. está com situação "' + osCoord.situacao + '" em operacional_os; lançamento não executado.'
        });
        continue;
      }

      // Defensivo: o caminho automático já filtra por Serviço dentro de
      // calcularPendentes, mas o modo manual (--os) não passa por lá.
      if (!osCoord.servico || SERVICOS_FOB_CIF.indexOf(normText(osCoord.servico)) === -1) {
        stats.semServico++;
        await salvarResultado(Object.assign({}, p, { osCoord: osCoord }), { status: 'SERVICO_NAO_APLICAVEL' });
        continue;
      }

      if (!isValidCoord(osCoord.lat, osCoord.lng)) {
        stats.semCoordenadaOs++;
        await salvarResultado(Object.assign({}, p, { osCoord: osCoord }), { status: 'SEM_COORDENADA_OS' });
        continue;
      }

      var loginMatch = await buscarLoginColaborador(p.data, p.funcionario, osCoord);
      if (!loginMatch && args.forcar) {
        var cadastroColaborador = await resolverCoordenacaoColaborador(p.funcionario);
        loginMatch = {
          distancia: 0,
          colaborador_chave: null,
          hora_movimento: null,
          coordenacao: cadastroColaborador ? cadastroColaborador.coordenacao : null,
          supervisao: cadastroColaborador ? cadastroColaborador.supervisao : null
        };
      }
      if (!loginMatch) {
        stats.semLogin++;
        await salvarResultado(Object.assign({}, p, { osCoord: osCoord }), { status: 'SEM_LOGIN' });
        continue;
      }

      if (loginMatch.distancia > RAIO_M && !args.forcar) {
        // Colaborador fora do raio: não fica mais pendente sem mais — lança
        // no nome do gestor da regional (pedido do usuário 21/07), mantendo a
        // observação fixa 'Aprovado pelo Gestor'. Só cai pro comportamento antigo (fica
        // PENDENTE) se não achar nenhum gestor pra essa Coordenação/Supervisão.
        // operacional_os não tem coluna "coordenação" própria — só supervisão
        // (texto "MATO GROSSO MT4 - Geral"); a coordenação é o prefixo antes
        // do " - " (mesmo padrão usado pro campo Coordenação do GRM alhures).
        var coordenacaoDaOs = osCoord.supervisao ? String(osCoord.supervisao).split(' - ')[0].trim() : null;
        var gestor = await buscarGestorRegional(coordenacaoDaOs, osCoord.supervisao);
        if (gestor) {
          stats.viaGestor++;
          candidatos.push(Object.assign({}, p, {
            osCoord: osCoord,
            loginMatch: loginMatch,
            viaGestor: true,
            gestorNome: gestor.nome,
            gestorCoordenacao: gestor.coordenacao,
            gestorSupervisao: gestor.supervisao
          }));
        } else {
          stats.foraDoRaio++;
          await salvarResultado(Object.assign({}, p, { osCoord: osCoord, loginMatch: loginMatch }), { status: 'FORA_DO_RAIO', erro: 'Sem gestor regional identificado para lançar em nome dele.' });
        }
        continue;
      }

      candidatos.push(Object.assign({}, p, { osCoord: osCoord, loginMatch: loginMatch }));
    }

    // REGRA OPERACIONAL: somente uma NHE por Cliente + ponto de embarque.
    // Duas O.S. irmãs podem chegar PENDENTE no mesmo cálculo; apenas uma segue
    // para o GRM e as demais ficam auditadas como agrupadas.
    var gruposCandidatos = {};
    var candidatosUnicos = [];
    for (var u = 0; u < candidatos.length; u++) {
      var cand = candidatos[u];
      var chaveGrupo = chaveGrupoEmbarque(cand);
      if (chaveGrupo && gruposCandidatos[chaveGrupo]) {
        stats.mesmoPontoAgrupado++;
        await salvarResultado(cand, {
          status: 'MESMO_PONTO_AGRUPADO',
          lancado_em: null,
          erro: null,
          raw: {
            agrupado_com_os: gruposCandidatos[chaveGrupo],
            regra: 'MESMO_CLIENTE_MESMO_PONTO_UMA_NHE'
          }
        });
        log('INFO', 'O.S. ' + cand.os + ': mesma combinação Cliente + Embarque já representada pela O.S. ' + gruposCandidatos[chaveGrupo] + '; lançamento bloqueado.');
        continue;
      }
      if (chaveGrupo) gruposCandidatos[chaveGrupo] = cand.os;
      candidatosUnicos.push(cand);
    }
    candidatos = candidatosUnicos;

    stats.candidatos = candidatos.length;
    log('SUCCESS', candidatos.length + ' grupo(s) único(s) Cliente + Embarque elegível(is); ' + stats.mesmoPontoAgrupado + ' O.S. irmã(s) agrupada(s).');

    var totalCandidatos = candidatos.length;
    if (MAX_LANCAMENTOS_POR_EXECUCAO > 0 && candidatos.length > MAX_LANCAMENTOS_POR_EXECUCAO) {
      candidatos = candidatos.slice(0, MAX_LANCAMENTOS_POR_EXECUCAO);
      log('INFO', 'Processando lote de ' + candidatos.length + '/' + totalCandidatos + ' candidato(s) para respeitar o tempo do worker.');
    }

    if (candidatos.length) {
      var browser = await puppeteer.launch({
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
      browserAtual = browser;

      try {
        var page = await browser.newPage();
        await login(page);

        for (var c = 0; c < candidatos.length; c++) {
          var candidato = candidatos[c];
          try {
            if (!dryRun) {
              var nheGrupoAoVivo = await existeNheMesmoPontoNoGrmAoVivo(page, candidato);
              if (nheGrupoAoVivo && nheGrupoAoVivo.existe) {
                stats.jaExistiaGrm++;
                var mesmaOs = String(nheGrupoAoVivo.os) === String(candidato.os);
                if (!mesmaOs) stats.nheMesmoPontoGrm++;
                await salvarResultado(candidato, {
                  status: mesmaOs ? 'JA_EXISTIA_GRM' : 'JA_EXISTIA_GRUPO_GRM',
                  lancado_em: null,
                  raw: {
                    origem_verificacao: 'grm_api_ao_vivo_cliente_ponto',
                    nao_lancado_nesta_execucao: true,
                    os_nhe_existente: nheGrupoAoVivo.os,
                    ponto_nhe_existente: nheGrupoAoVivo.ponto,
                    cidade_nhe_existente: nheGrupoAoVivo.cidade
                  }
                });
                log('INFO', 'O.S. ' + candidato.os + ' em ' + candidato.data + ': já existe NHE para o mesmo Cliente + ponto na O.S. ' + nheGrupoAoVivo.os + '; novo lançamento bloqueado.');
                continue;
              }
            }

            log('INFO', 'Lançando NHE para O.S. ' + candidato.os + ' (' + (candidato.viaGestor ? 'via gestor ' + candidato.gestorNome + ', colaborador original=' + candidato.funcionario : 'colaborador=' + candidato.funcionario) + ', distância=' + Math.round(candidato.loginMatch.distancia) + 'm)...');
            await lancarNheParaCandidato(page, candidato, dryRun, debug);

            if (dryRun) {
              await salvarResultado(candidato, { status: 'DRY_RUN_OK', lancado_em: null, erro: null });
              log('SUCCESS', 'O.S. ' + candidato.os + ': NHE validado (dry-run).');
              continue;
            }

            var confirmado = false;
            var erroConfirmacao = null;
            for (var tentativaConf = 1; tentativaConf <= 3; tentativaConf++) {
              await wait(1500 * tentativaConf);
              try {
                delete nheRealPorChaveCache[chaveUnica(candidato.data, candidato.os)];
                if (await existeNheNoGrmAoVivo(page, candidato.data, candidato.os)) {
                  confirmado = true;
                  break;
                }
              } catch (confErr) {
                erroConfirmacao = confErr;
                break;
              }
            }

            if (!confirmado) {
              stats.erro++;
              stats.salvoNaoConfirmado++;
              var msgConfirmacao = erroConfirmacao
                ? 'Salvar foi acionado, mas a confirmação ao vivo falhou: ' + erroConfirmacao.message
                : 'Salvar foi acionado, mas a NHE não apareceu no relatório do GRM para O.S. ' + candidato.os + ' na data ' + candidato.data + '.';
              await salvarResultado(candidato, { status: 'SALVO_NAO_CONFIRMADO', lancado_em: null, erro: msgConfirmacao.slice(0, 2000) });
              log('ERROR', 'O.S. ' + candidato.os + ': ' + msgConfirmacao + ' Bloqueada contra nova tentativa automática.');
              continue;
            }

            stats.sucesso++;
            await salvarResultado(candidato, { status: 'SUCESSO', lancado_em: new Date().toISOString() });
            log('SUCCESS', 'O.S. ' + candidato.os + ': NHE lançado e confirmado no GRM em ' + candidato.data + '.');
          } catch (error) {
            if (error && error.code === 'GRM_JA_POSSUI_MOVIMENTO') {
              stats.jaExistiaMovimento++;
              await salvarResultado(candidato, {
                status: 'JA_EXISTIA_MOVIMENTO_GRM',
                lancado_em: null,
                erro: null,
                raw: Object.assign({}, candidato.viaGestor ? {
                  via_gestor: true,
                  colaborador_original: candidato.funcionario,
                  gestor: candidato.gestorNome
                } : {}, {
                  reconciliacao: 'Backend GRM recusou NHE porque já existe movimento no dia',
                  origem_verificacao: 'api/loadNoShip/setRecord:sOrderHasDayMovement',
                  nao_lancado_nesta_execucao: true
                })
              });
              log('INFO', 'O.S. ' + candidato.os + ': GRM confirmou movimento já existente; NHE não necessária.');
              await fecharModais(page);
              continue;
            }
            stats.erro++;
            log('ERROR', 'O.S. ' + candidato.os + ': ' + error.message);
            if (debug) await shot(page, 'erro-os-' + candidato.os + '.png');
            await salvarResultado(candidato, { status: 'ERRO', erro: String(error.message || error).slice(0, 2000) });
            await fecharModais(page);
          }
        }
      } finally {
        browserAtual = null;
        await browser.close();
      }

      if (stats.sucesso > 0 && !dryRun) {
        await atualizarRelatorioNhe();
      }
    }

    var restantes = Math.max(0, totalCandidatos - candidatos.length);
    if (!dryRun && AUTO_CONTINUACAO && restantes > 0 && stats.sucesso > 0) {
      var criada = await enfileirarContinuacao();
      log('INFO', restantes + ' candidato(s) restante(s); continuação ' + (criada ? 'enfileirada' : 'já estava pendente') + '.');
    } else if (!dryRun && !AUTO_CONTINUACAO && restantes > 0) {
      log('INFO', restantes + ' candidato(s) restante(s); continuação automática desativada por NHE_LANCAMENTO_AUTO_CONTINUACAO=false.');
    } else if (!dryRun && restantes > 0 && stats.sucesso === 0) {
      log('WARN', restantes + ' candidato(s) não processado(s), mas nenhuma operação do lote teve sucesso; continuação automática bloqueada para evitar loop de erro.');
    }

    var totalFalhas = stats.erro + stats.semLogin + stats.semFuncionario + stats.foraDoRaio + stats.semCoordenadaOs + stats.salvoNaoConfirmado;
    await finalizarExecucao(runId, {
      status: totalFalhas > 0 ? 'PARCIAL' : 'SUCESSO',
      total_pendentes: stats.pendentes,
      total_candidatos: stats.candidatos,
      total_sucesso: stats.sucesso,
      total_erro: stats.erro,
      total_sem_login: stats.semLogin,
      total_fora_do_raio: stats.foraDoRaio,
      total_sem_coordenada_os: stats.semCoordenadaOs
    });

    log('SUCCESS', 'Concluído: ' + JSON.stringify(stats));
  } catch (error) {
    log('ERROR', error.stack || error.message);
    await finalizarExecucao(runId, { status: 'ERRO', erro: String(error.message || error).slice(0, 4000) }).catch(function () {});
    throw error;
  }
}

if (require.main === module) {
  main().then(function () { process.exit(0); }).catch(function () { process.exit(1); });
  setTimeout(function () {
    log('ERROR', 'Timeout geral do agente atingido.');
    if (browserAtual) browserAtual.close().catch(function () {});
    process.exit(1);
  }, Number(process.env.NHE_LANCAMENTO_TIMEOUT_MS || 720000)).unref();
}

module.exports = {
  calcularPendentes: calcularPendentes,
  haversineMeters: haversineMeters,
  normOs: normOs,
  normText: normText,
  buscarPendentes: buscarPendentes,
  buscarPendenciasAnteriores: buscarPendenciasAnteriores,
  combinarPendentes: combinarPendentes,
  buscarLoginColaborador: buscarLoginColaborador,
  resolverCoordenadaOs: resolverCoordenadaOs,
  buscarGestorRegional: buscarGestorRegional,
  existeNheReal: existeNheReal,
  existeMovimentoReal: existeMovimentoReal,
  chaveGrupoEmbarque: chaveGrupoEmbarque,
  identidadeGrupoEmbarque: identidadeGrupoEmbarque
};
