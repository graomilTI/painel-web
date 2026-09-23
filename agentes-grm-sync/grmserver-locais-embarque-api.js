#!/usr/bin/env node

/**
 * Sincroniza Locais de Embarque direto pela API do Graint (sem navegador).
 *
 * Duas etapas:
 *  1) Relatório reports/classification/servicePlaces (janela de 30 dias) -> tabela
 *     grm_locais_embarque_importacoes. Continua só porque alimenta o card de status do agente
 *     e as opções de filtro da lista da Programação; NÃO promove mais pontos.
 *  2) Espelho do cadastro: servicePlaces/getRecords (o mesmo endpoint da tela Operação > Locais de
 *     Serviço do GRM; a tela mostra só 400 porque o limite padrão da consulta é 400) ->
 *     operacional_pontos_embarque. O GRM é a fonte da verdade: casa por spl_code (e adota linhas
 *     antigas por nome+cidade+UF), atualiza tipo/coordenadas/flag de histórico de problemas,
 *     insere locais novos com coordenada e marca ativo=false o que saiu do GRM ou está inativo lá.
 *
 * Antes a promoção partia do relatório de classificação dos últimos 30 dias — uma lista antiga que
 * continuava trazendo locais que já não existem mais no GRM.
 *
 * Modos: `--dry-run` (ou GRM_LOCAIS_DRY_RUN=1) só loga o que faria, sem gravar nada;
 * GRM_LOCAIS_FORCE=1 libera a trava que impede inativar muitos locais de uma vez.
 */

require('dotenv').config();
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } },
);

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const REPORT_CONFIG = {
  name: 'Locais de Embarque',
  tableName: 'grm_locais_embarque_importacoes',
  daysBack: 30,
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function calculateDateRange(daysBack) {
  const today = new Date();
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { from: formatDate(pastDate), to: formatDate(today) };
}

function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

function requestJson(url, method = 'GET', body = null, headers = {}, timeoutMs = 30000) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout ao consultar o GRM.')));
    request.on('error', reject);
    request.end(payload || undefined);
  });
}
function postJson(url, body, headers = {}, timeoutMs = 30000) { return requestJson(url, 'POST', body, headers, timeoutMs); }
function authHeaders(token) { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }; }

async function login() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  log('INFO', 'Login via API...');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail,
    userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  log('SUCCESS', 'Login OK');
  return response.token;
}

async function fetchReportApi(token) {
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  log('INFO', `Consultando ${REPORT_CONFIG.name} via API: ${dateRange.from} até ${dateRange.to}`);
  const json = await postJson(`${GRM_BASE_URL}reports/classification/servicePlaces`, {
    requestDateFrom: dateRange.from, requestDateTo: dateRange.to,
  }, authHeaders(token));
  if (json.result === false) throw new Error(JSON.stringify(json).slice(0, 500));
  const data = json.searchData || [];
  log('SUCCESS', `${data.length} registros recebidos`);
  return data;
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const dateRange = calculateDateRange(REPORT_CONFIG.daysBack);
  const records = data.map(row => ({
    data_solicitacao_de: toIso(dateRange.from),
    data_solicitacao_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || row.clnName || null,
    produto: row['Produto'] || null,
    coordenacao: row['Coordenação'] || null,
    servico: row['Serviço'] || null,
    local_tipo_servico: row['Tipo Local de Serviço'] || row.sptName || null,
    uf: row['UF'] || row.splCitUF || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString(),
  }));

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }

  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
}


// ---------------------------------------------------------------------------
// Espelho do cadastro de Locais de Serviço do GRM -> operacional_pontos_embarque
// (lookup geográfico usado por TODA O.S. via trg_operacional_os_resolver_ponto).
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run') || process.env.GRM_LOCAIS_DRY_RUN === '1';
const FORCE = process.env.GRM_LOCAIS_FORCE === '1';
// Trava: se o GRM devolver muito menos que o esperado (~18 mil ativos), algo deu errado na
// consulta — não pode virar "inativar tudo que não veio".
const MIN_GRM_ATIVOS = 5000;
// Trava: inativar mais que isso (e mais que 50% dos ativos) de uma vez exige GRM_LOCAIS_FORCE=1.
const MAX_INATIVAR_SEM_FORCE = 300;
const PAGE = 1000;
const CHUNK = 500;

function normKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toGeoNum(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isGeoBrasil(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= -34.5 && a <= 6 && b >= -75 && b <= -33;
}

function pontoKey({ uf, cidade, nome_local }) {
  return `${normKey(uf)}|${normKey(cidade)}|${normKey(nome_local)}`;
}

// Mesma chave do índice único parcial (ativo=true): upper(btrim(uf)), upper(btrim(cidade)), upper(btrim(nome_local)).
function chaveAtiva({ uf, cidade, nome_local }) {
  return [uf, cidade, nome_local].map((v) => String(v || '').trim().toUpperCase()).join('|');
}

function mesmaCoord(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return Number(a).toFixed(7) === Number(b).toFixed(7);
}

// GET sem filtro de status devolve TODOS (ativos "A" e inativos "N") — 18.141 em 23/09/2026.
// A tela do GRM só mostra 400 porque `limit` padrão é 400; com limit alto vem o cadastro inteiro.
async function fetchCadastroGrm(token) {
  const json = await postJson(`${GRM_BASE_URL}servicePlaces/getRecords`, { limit: 100000 }, authHeaders(token), 120000);
  if (json.result === false) throw new Error(JSON.stringify(json).slice(0, 500));
  const data = json.searchData || [];
  log('SUCCESS', `[cadastro-grm] ${data.length} locais de serviço recebidos do GRM`);
  return data;
}

function mapCadastroGrm(r) {
  const lat = toGeoNum(r.splLat);
  const lng = toGeoNum(r.splLon);
  const geoOk = isGeoBrasil(lat, lng);
  return {
    spl_code: Number(r.splCode),
    ativoGrm: r.splStatus === 'A',
    nome_local: toText(r.splName),
    uf: toText(r.staAbreviation || r.splCitUF),
    cidade: toText(r.citName || r.splCitName),
    tipo_local: toText(r.sptName),
    latitude: geoOk ? lat : null,
    longitude: geoOk ? lng : null,
    tem_historico_problemas: r.splHasIssueHistory === 'S',
  };
}

async function buscarPontosExistentes() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('operacional_pontos_embarque')
      .select('id,nome_local,uf,cidade,tipo_local,latitude,longitude,ativo,spl_code,tem_historico_problemas')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function espelharCadastroGrm(token) {
  const grm = (await fetchCadastroGrm(token))
    .map(mapCadastroGrm)
    .filter((g) => Number.isInteger(g.spl_code) && g.nome_local && g.uf && g.cidade);
  const ativosGrm = grm.filter((g) => g.ativoGrm).sort((a, b) => a.spl_code - b.spl_code);
  if (ativosGrm.length < MIN_GRM_ATIVOS) {
    log('WARN', `[cadastro-grm] só ${ativosGrm.length} locais ativos no GRM (mínimo ${MIN_GRM_ATIVOS}); espelho ignorado por segurança.`);
    return;
  }

  const existentes = await buscarPontosExistentes();
  const porSpl = new Map();
  const porKey = new Map();
  existentes.forEach((p) => {
    if (p.spl_code != null) porSpl.set(p.spl_code, p);
    const k = pontoKey(p);
    if (!porKey.has(k)) porKey.set(k, []);
    porKey.get(k).push(p);
  });

  const alvoIds = new Set(); // linhas existentes que continuam válidas no GRM
  const chavesAtivas = new Set(); // evita 2 ativos com a mesma chave (índice único parcial)
  const atualizacoes = [];
  const insercoes = [];
  let semCoordenada = 0;
  let homonimosIgnorados = 0;

  for (const g of ativosGrm) {
    let ex = porSpl.get(g.spl_code);
    if (!ex) {
      const candidatos = (porKey.get(pontoKey(g)) || []).filter((p) => p.spl_code == null && !alvoIds.has(p.id));
      ex = candidatos.find((p) => p.ativo) || candidatos[0];
    }

    const latitude = g.latitude ?? ex?.latitude ?? null;
    const longitude = g.longitude ?? ex?.longitude ?? null;
    if (latitude == null || longitude == null) { semCoordenada++; continue; }

    const nomeFinal = ex ? { nome_local: ex.nome_local, uf: ex.uf, cidade: ex.cidade } : { nome_local: g.nome_local, uf: g.uf, cidade: g.cidade };
    const chave = chaveAtiva(nomeFinal);
    if (chavesAtivas.has(chave)) { homonimosIgnorados++; continue; } // mesmo nome/cidade/UF com outro splCode
    chavesAtivas.add(chave);

    if (ex) {
      alvoIds.add(ex.id);
      const mudou = ex.spl_code !== g.spl_code || !ex.ativo
        || (g.tipo_local && ex.tipo_local !== g.tipo_local)
        || !mesmaCoord(ex.latitude, latitude) || !mesmaCoord(ex.longitude, longitude)
        || ex.tem_historico_problemas !== g.tem_historico_problemas;
      if (mudou) {
        atualizacoes.push({
          id: ex.id, ...nomeFinal, spl_code: g.spl_code, tipo_local: g.tipo_local ?? ex.tipo_local,
          latitude, longitude, tem_historico_problemas: g.tem_historico_problemas, ativo: true,
        });
      }
    } else {
      insercoes.push({
        ...nomeFinal, spl_code: g.spl_code, tipo_local: g.tipo_local, latitude, longitude,
        tem_historico_problemas: g.tem_historico_problemas, origem: 'grm_cadastro', ativo: true,
      });
    }
  }

  // Ativos no painel que o GRM não confirma (saiu do cadastro, status "N" ou sem coordenada) -> inativar.
  const inativar = existentes.filter((p) => p.ativo && !alvoIds.has(p.id));
  const totalAtivos = existentes.filter((p) => p.ativo).length;

  log('INFO', `[cadastro-grm] GRM ativos=${ativosGrm.length} | painel ativos=${totalAtivos} | atualizar=${atualizacoes.length} inserir=${insercoes.length} inativar=${inativar.length} | sem coordenada=${semCoordenada} homônimos ignorados=${homonimosIgnorados}`);

  if (inativar.length > MAX_INATIVAR_SEM_FORCE && inativar.length > totalAtivos * 0.5 && !FORCE) {
    throw new Error(`[cadastro-grm] trava: ${inativar.length} de ${totalAtivos} locais seriam inativados de uma vez. Confira com --dry-run e rode com GRM_LOCAIS_FORCE=1 se estiver correto.`);
  }
  if (DRY_RUN) {
    log('INFO', '[cadastro-grm] --dry-run: nada foi gravado.');
    return;
  }

  // Ordem importa por causa do índice único parcial (ativo=true): primeiro libera quem sai, depois grava quem fica.
  for (let i = 0; i < inativar.length; i += CHUNK) {
    const ids = inativar.slice(i, i + CHUNK).map((p) => p.id);
    const { error } = await supabase.from('operacional_pontos_embarque').update({ ativo: false }).in('id', ids);
    if (error) throw error;
  }
  for (let i = 0; i < atualizacoes.length; i += CHUNK) {
    const chunk = atualizacoes.slice(i, i + CHUNK);
    const { error } = await supabase.from('operacional_pontos_embarque').upsert(chunk, { onConflict: 'id' });
    if (!error) continue;
    log('WARN', `[cadastro-grm] chunk de atualização falhou (${error.message}); tentando linha a linha...`);
    for (const row of chunk) {
      const { error: rowError } = await supabase.from('operacional_pontos_embarque').upsert([row], { onConflict: 'id' });
      if (rowError) log('WARN', `[cadastro-grm] atualização ignorada (splCode ${row.spl_code}): ${rowError.message}`);
    }
  }
  let inseridos = 0;
  let colisoes = 0;
  for (let i = 0; i < insercoes.length; i += CHUNK) {
    const chunk = insercoes.slice(i, i + CHUNK);
    const { error } = await supabase.from('operacional_pontos_embarque').insert(chunk);
    if (!error) { inseridos += chunk.length; continue; }
    log('WARN', `[cadastro-grm] chunk de inserção falhou (${error.message}); tentando linha a linha...`);
    for (const row of chunk) {
      const { error: rowError } = await supabase.from('operacional_pontos_embarque').insert([row]);
      if (rowError) colisoes++; else inseridos++;
    }
  }

  log('SUCCESS', `[cadastro-grm] espelho concluído: ${atualizacoes.length} atualizados, ${inseridos} inseridos${colisoes ? ` (${colisoes} ignorados por colisão)` : ''}, ${inativar.length} inativados.`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API)${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);
  const token = await login();
  if (!DRY_RUN) {
    const data = await fetchReportApi(token);
    await upsertData(data);
  }
  await espelharCadastroGrm(token);
  log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 300000);
}

module.exports = { fetchReportApi, fetchCadastroGrm, login };
