#!/usr/bin/env node

/**
 * Correção pontual (não roda em cron): reconcilia no Graint uma ou mais O.S.
 * específicas que ficaram fora da janela normal do agente
 * grmserver-aplicar-distribuicao-os-api.js.
 *
 * Achado 15/09/2026: O.S. 92611 e 92659 (Londrina, VILELA & MACHADO /
 * OURO SAFRA) têm data_os=2026-09-14 (ontem) e continuam status_gestor=ATENDER
 * (não finalizadas — "reaproveitadas" pro dia seguinte). janelaDatas() do
 * agente cobre só [hoje, hoje+3] e nunca olha pra trás, então nenhuma
 * execução normal do agente jamais tenta reconciliar essas duas O.S. — o
 * colaborador confirmado no painel (RODRIGO RICARDO / JULIO CESAR FERREIRA
 * DE OLIVEIRA) nunca chega no Graint, não importa quantas vezes o gestor
 * reconfirme (relatos de Jean Carlos e outros gestores, 15/09/2026).
 *
 * Este script NÃO altera o agente nem sua janela — é um disparo manual,
 * escopado só às O.S. passadas em OS_NUMEROS, usando a data real da O.S.
 * (data_os) em vez da janela [hoje, hoje+3]. Roda em --dry-run por padrão;
 * precisa de --apply pra gravar no Graint de verdade.
 *
 * Uso:
 *   node grm-corrigir-os-antiga-atender-pontual.js --os=92611,92659 [--apply]
 */

require('dotenv').config();
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } }
);

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const APPLY = process.argv.includes('--apply');
const osArg = process.argv.find((a) => a.startsWith('--os='));
const OS_NUMEROS = (osArg ? osArg.split('=')[1] : '').split(',').map((v) => v.trim()).filter(Boolean);

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safe(data) { return Array.isArray(data) ? data : []; }
function codeKey(value) { return String(value); }

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function toBrDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : null;
}

function sameCodeSet(atual, esperado) {
  const a = new Set(safe(atual).map(codeKey));
  const b = new Set(safe(esperado).map(codeKey));
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function requestJson(url, method = 'GET', body = null, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
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
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch {
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

function postJson(url, body, headers = {}) { return requestJson(url, 'POST', body, headers); }

async function comRetentativas(fn, contexto, tentativas = 3, delayMs = 1500) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try { return await fn(); } catch (error) {
      ultimoErro = error;
      if (tentativa < tentativas) {
        const espera = delayMs + Math.floor(Math.random() * delayMs);
        log('WARN', `${contexto}: tentativa ${tentativa}/${tentativas} falhou (${error.message}); tentando de novo em ${espera}ms.`);
        await delay(espera);
      }
    }
  }
  throw ultimoErro;
}

async function login() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail, userPass,
    loginInfo: { ip: '', browser: 'GRM API Agent (pontual)', browserVersion: '1.0', engine: 'Node.js', engineVersion: process.version, platform: process.platform, screenSize: '', windowSize: '' },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

async function carregarSupervisoes(token) {
  const response = await postJson(`${GRM_BASE_URL}supervision/getForSelect`, { olsStatus: 'A' }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!response.result) throw new Error(`Falha ao listar supervisões do Graint: ${response.message || 'erro'}`);
  const map = new Map();
  for (const item of safe(response.searchData)) if (item.olsName) map.set(normalize(item.olsName), item.olsCode);
  return map;
}

async function getDistributionData(token, olsCode, sodDate) {
  return comRetentativas(async () => {
    const response = await postJson(`${GRM_BASE_URL}serviceOrder/distribution/getDistributionData`, { olsCode, sodDate }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
    if (!response.result) throw new Error(`getDistributionData falhou: ${response.message || 'erro'}`);
    return response;
  }, `getDistributionData (olsCode=${olsCode}, sodDate=${sodDate})`);
}

async function setDistributionData(token, staffs, sOrders, sodDate) {
  return comRetentativas(async () => {
    const response = await postJson(`${GRM_BASE_URL}serviceOrder/distribution/setDistributionData`, { staffs, sOrders, sodDate }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
    if (!response.result) throw new Error(`setDistributionData falhou: ${response.message || 'erro'}`);
    return response;
  }, `setDistributionData (sodDate=${sodDate})`);
}

// Busca o colaborador confirmado pra essa O.S. SEM nenhum filtro de janela de
// data — a data real vem do próprio operacional_os.data_os, não de "hoje".
async function carregarProgramadosDaOs(osId) {
  const { data, error } = await supabase
    .from('programacao_equipe')
    .select('colaborador_id, nome_colaborador, confirmado')
    .eq('os_id', osId)
    .eq('confirmado', true);
  if (error) throw new Error(`Falha ao consultar programacao_equipe (os_id=${osId}): ${error.message}`);
  const vistos = new Set();
  const out = [];
  for (const row of safe(data)) {
    const nome = String(row.nome_colaborador || '').trim();
    const key = normalize(nome);
    if (!nome || !key || vistos.has(key)) continue;
    vistos.add(key);
    out.push(nome);
  }
  return out;
}

async function main() {
  if (!OS_NUMEROS.length) throw new Error('Uso: node grm-corrigir-os-antiga-atender-pontual.js --os=92611,92659 [--apply]');
  log('INFO', `=== Correção pontual de distribuição — O.S. ${OS_NUMEROS.join(', ')}${APPLY ? '' : ' (DRY-RUN, use --apply pra gravar)'} ===`);

  const { data: osRows, error: osError } = await supabase
    .from('operacional_os')
    .select('id, numero_os, data_os, supervisao, status_gestor, cliente')
    .in('numero_os', OS_NUMEROS);
  if (osError) throw new Error(`Falha ao consultar operacional_os: ${osError.message}`);
  if (!osRows || osRows.length !== OS_NUMEROS.length) {
    const achadas = new Set((osRows || []).map((r) => r.numero_os));
    throw new Error(`O.S. não encontrada(s): ${OS_NUMEROS.filter((n) => !achadas.has(n)).join(', ')}`);
  }

  const porSupervisaoData = new Map();
  for (const os of osRows) {
    const key = `${normalize(os.supervisao)}|${os.data_os}`;
    if (!porSupervisaoData.has(key)) porSupervisaoData.set(key, { supervisao: os.supervisao, data_os: os.data_os, osList: [] });
    porSupervisaoData.get(key).osList.push(os);
  }

  const token = await login();
  const supervisoes = await carregarSupervisoes(token);

  for (const grupo of porSupervisaoData.values()) {
    const olsCode = supervisoes.get(normalize(grupo.supervisao));
    if (olsCode == null) { log('ERROR', `Supervisão "${grupo.supervisao}" não encontrada no Graint.`); continue; }

    const sodDate = toBrDate(grupo.data_os);
    log('INFO', `Consultando Distribuição de OS — ${grupo.supervisao} / ${sodDate} (${grupo.osList.map((o) => o.numero_os).join(', ')})`);
    const dist = await getDistributionData(token, olsCode, sodDate);
    const { staffs, sOrders } = dist;

    const staCodePorNome = new Map();
    for (const s of safe(staffs)) if (s.staName && s.staCode != null) staCodePorNome.set(normalize(s.staName), s.staCode);

    const ordemPorNumero = new Map();
    for (const o of safe(sOrders)) if (o.sorCode != null) ordemPorNumero.set(String(o.sorCode), o);

    let algumaMudanca = false;
    for (const os of grupo.osList) {
      const ordem = ordemPorNumero.get(String(os.numero_os));
      if (!ordem) { log('ERROR', `OS ${os.numero_os} não encontrada na Distribuição de OS do Graint (${grupo.supervisao}/${sodDate}).`); continue; }

      const nomesProgramados = await carregarProgramadosDaOs(os.id);
      const faltantes = [];
      const codigosEsperados = [];
      for (const nome of nomesProgramados) {
        const staCode = staCodePorNome.get(normalize(nome));
        if (staCode == null) faltantes.push(nome);
        else codigosEsperados.push(staCode);
      }
      if (faltantes.length) {
        log('ERROR', `OS ${os.numero_os}: ${faltantes.length} colaborador(es) não encontrado(s) no Graint: ${faltantes.join(', ')} — pulando esta OS.`);
        continue;
      }

      const codigosAtuais = safe(ordem.staCodes);
      if (sameCodeSet(codigosAtuais, codigosEsperados)) {
        log('INFO', `OS ${os.numero_os}: já está correto no Graint (${nomesProgramados.join(', ') || 'sem colaborador esperado'}). Nada a fazer.`);
        continue;
      }

      log(
        'INFO',
        `OS ${os.numero_os}: staCodes atuais=[${codigosAtuais.join(', ')}] -> esperado=[${codigosEsperados.join(', ')}] `
          + `(colaborador(es): ${nomesProgramados.join(', ') || 'nenhum'})`
      );
      ordem.staCodes = codigosEsperados;
      algumaMudanca = true;
    }

    if (!algumaMudanca) { log('INFO', `${grupo.supervisao}/${sodDate}: nenhuma mudança necessária.`); continue; }

    if (!APPLY) {
      log('INFO', `[DRY-RUN] setDistributionData NÃO enviado. Rode de novo com --apply pra gravar de verdade.`);
      continue;
    }

    await setDistributionData(token, staffs, sOrders, sodDate);
    log('SUCCESS', `${grupo.supervisao}/${sodDate}: setDistributionData enviado com sucesso.`);
  }

  log('SUCCESS', 'Concluído.');
}

main().then(() => process.exit(0)).catch((error) => { log('ERROR', error.stack || error.message); process.exit(1); });
