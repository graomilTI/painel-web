#!/usr/bin/env node

/**
 * Sincroniza O.S. abertas diretamente pela API do GRM (upsert quase em tempo
 * real em operacional_os), substituindo — só para os campos "core" da O.S. —
 * o fluxo Puppeteer/XLS (sync-lista-os) e a derivação em lote (sync-operacional-os).
 *
 * A promoção de locais de embarque (operacional_pontos_embarque), que antes
 * era um efeito colateral de sync-operacional-os, foi movida para dentro de
 * grm-sync-locais-embarque.js — este script não depende mais dela nem do
 * antigo sync-operacional-os, que fica pausado (enabled=false na tabela
 * public.grm_sync_agent_settings, não em worker/grm-sync-fixed-agents.js —
 * ver aviso nesse arquivo) mas continua no disco para rollback.
 *
 * supervisao/embarcado vêm direto de serviceOrder/getRecords (olsName /
 * totalLoadsWeight) — confirmado batendo com o que a derivação antiga
 * calculava cruzando Distribuição de O.S./Mapa de Embarque (01/09), então
 * esse cruzamento deixou de ser necessário para operacional_os.
 */

const dotenvResult = require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Alguns servidores legados mantêm `.env` com espaços ao redor do `=`. A
// versão antiga de dotenv instalada no cPanel não normaliza todas essas linhas.
// Reaproveita somente os pares já parseados e corrige o nome da variável, sem
// imprimir ou persistir os valores.
for (const [rawKey, value] of Object.entries(dotenvResult.parsed || {})) {
  const key = rawKey.trim();
  if (key && !process.env[key]) process.env[key] = value;
}

// Fallback para dotenv legado: aceita `CHAVE = valor`, preservando o valor
// integral e removendo apenas aspas externas.
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch {
  // requiredEnv produzirá uma mensagem objetiva se o arquivo não existir.
}

const https = require('https');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const POLL_INTERVAL_MS = Math.max(3000, Number(process.env.GRM_LISTA_OS_POLL_MS || 8000));
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const LOTE_MINIMO = 50;
const LIMITE_PROPORCAO_REMOCAO = 0.8;
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

// Situação=Abertas + Financeiro=Não Faturadas: mesmo filtro padrão que a tela
// "Ordem de Serviço" do GRM já vinha marcada (ver comentário em grm-sync-lista-os.js).
const SERVICE_ORDER_FILTER = {
  clnCode: '', clrCode: '', cliCode: '', sorBilled: 'N', sorNeedNHE: '', sorStatus: 'A', sorCode: '', joinCItems: false,
};

const TRACKED_FIELDS = [
  'data_os', 'cliente', 'embarque', 'destino', 'contrato', 'produto',
  'lote', 'remanescente', 'situacao', 'financeiro', 'servico', 'supervisao', 'embarcado',
];

const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
};

function requiredEnv(name, alternatives = []) {
  for (const key of [name, ...alternatives]) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(`Variável obrigatória ausente: ${[name, ...alternatives].join(' ou ')}`);
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
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`);
          error.statusCode = response.statusCode;
          reject(error);
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

function postJson(url, body, headers = {}) {
  return requestJson(url, 'POST', body, headers);
}

function createSupabaseRest(baseUrl, serviceKey) {
  const restUrl = `${String(baseUrl).replace(/\/$/, '')}/rest/v1`;
  const authHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
  };

  return {
    async selectAll(table, columns, offset, limit) {
      return requestJson(
        `${restUrl}/${table}?select=${columns}&offset=${offset}&limit=${limit}`,
        'GET',
        null,
        authHeaders,
      );
    },
    async upsertByNumeroOs(body) {
      await requestJson(
        `${restUrl}/operacional_os?on_conflict=numero_os`,
        'POST',
        body,
        { ...authHeaders, prefer: 'resolution=merge-duplicates,return=minimal' },
      );
    },
    async deleteByNumeroOs(numeros) {
      if (!numeros.length) return;
      const lista = numeros.map((n) => encodeURIComponent(n)).join(',');
      await requestJson(
        `${restUrl}/operacional_os?numero_os=in.(${lista})`,
        'DELETE',
        null,
        authHeaders,
      );
    },
  };
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeDate(value) {
  const text = normalizeText(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function statusLabel(value) {
  const map = { A: 'Aberta', F: 'Finalizada', C: 'Cancelada' };
  return map[String(value || '').toUpperCase()] || normalizeText(value);
}

function billedLabel(value) {
  return String(value || '').toUpperCase() === 'S' ? 'Faturada' : 'Não Faturada';
}

function mapServiceOrder(row, synchronizedAt) {
  const numero_os = normalizeText(row.sorCode);
  return {
    numero_os,
    data_os: normalizeDate(row.sorDate),
    cliente: normalizeText(row.cliName),
    embarque: normalizeText(row.sorBoardingLocal),
    destino: normalizeText(row.sorDestinationLocal),
    contrato: normalizeText(row.sorContract),
    produto: normalizeText(row.proName),
    lote: Number(row.sorLotSize) || 0,
    remanescente: Number(row.totalRemain) || 0,
    situacao: statusLabel(row.sorStatus),
    financeiro: billedLabel(row.sorBilled),
    servico: normalizeText(row.serName),
    supervisao: normalizeText(row.olsName),
    embarcado: Number(row.totalLoadsWeight) || 0,
    arquivo_origem: 'agente:grmserver-lista-os-api-realtime',
    updated_at: synchronizedAt,
    raw: row,
  };
}

function comparable(row) {
  const result = {};
  for (const field of TRACKED_FIELDS) result[field] = row?.[field] ?? null;
  return result;
}

function diffFields(previous, current) {
  const before = comparable(previous || {});
  const after = comparable(current || {});
  return TRACKED_FIELDS.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
}

async function login() {
  const userEmail = requiredEnv('GRMSERVER_USER');
  const userPass = requiredEnv('GRMSERVER_PASSWORD');
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
  return response.token;
}

async function fetchServiceOrders(token) {
  const response = await postJson(`${GRM_BASE_URL}serviceOrder/getRecords`, SERVICE_ORDER_FILTER, {
    ...GRM_WEB_HEADERS, authorization: `Bearer ${token}`,
  });
  if (!response.result) {
    const error = new Error(`Consulta de O.S. recusada: ${response.message || 'erro GRM'}`);
    error.requiresLogin = Boolean(response.logoutUser);
    throw error;
  }
  if (!Array.isArray(response.searchData)) throw new Error('Resposta do GRM não contém searchData.');
  return response.searchData;
}

async function fetchAllCurrent(supabase) {
  // status_gestor não é um TRACKED_FIELD (não vem do GRM, não entra no diff),
  // mas precisa vir junto pra decidir se preserva data_os de uma O.S. ATENDER/
  // FINALIZAR (ver applyCycle).
  const columns = ['numero_os', 'status_gestor', ...TRACKED_FIELDS].join(',');
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const data = await supabase.selectAll('operacional_os', columns, offset, PAGE_SIZE);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// Referência da cobertura de remoção fica em memória (ciclo anterior bem-sucedido
// deste próprio processo), não em "lote anterior" salvo em tabela de importação —
// este script não tem mais tabela de importação. No primeiro ciclo depois de subir
// (ou reiniciar) ainda não há referência, então nenhuma remoção é feita.
let ultimoCicloNumeros = null;

async function applyCycle(supabase, rawRows) {
  const synchronizedAt = new Date().toISOString();
  const remoteRows = rawRows.map((row) => mapServiceOrder(row, synchronizedAt)).filter((row) => row.numero_os);

  if (remoteRows.length < LOTE_MINIMO) {
    logger.warn(`Lote pequeno demais (${remoteRows.length} O.S.); ciclo ignorado para não apagar O.S. válidas por engano.`);
    return { skipped: true, remote: remoteRows.length };
  }

  const currentRows = await fetchAllCurrent(supabase);
  const byNumero = new Map(currentRows.map((row) => [row.numero_os, row]));
  const novosNumeros = new Set(remoteRows.map((row) => row.numero_os));

  let upserts = 0;
  for (const remote of remoteRows) {
    const previous = byNumero.get(remote.numero_os) || null;

    // data_os do GRM (sorDate) é a data de ABERTURA da O.S., não a data em que
    // ela está sendo atendida — o painel move data_os de propósito quando o
    // gestor confirma equipe na Programação (trigger programacao_equipe_marca_
    // os_atender), podendo divergir do sorDate por dias. Sem essa preservação,
    // toda O.S. ATENDER/FINALIZAR reusada em dias seguintes (remanescente) tinha
    // data_os revertido pro valor velho do GRM a cada ciclo (~8s), sumindo do
    // Mapa Operacional (filtra data_os=hoje) e caindo fora da janela de datas
    // aceita pelo agente aplicar-distribuicao-os (mesma lógica de proteção que
    // o antigo listaOsAgentSync.js já tinha). Achado em produção 01/09 (O.S. 90497).
    const preservarAtendimento = Boolean(previous && ['ATENDER', 'FINALIZAR'].includes(previous.status_gestor));
    const payload = { ...remote };
    if (preservarAtendimento) payload.data_os = previous.data_os;

    if (previous && diffFields(previous, payload).length === 0) continue;

    const mesmaOcorrencia = Boolean(previous && previous.data_os === remote.data_os);
    if (!preservarAtendimento && !mesmaOcorrencia) {
      // O.S. nova ou que avançou pra uma ocorrência/data diferente: entra limpa,
      // senão fica presa no status_gestor de uma ocorrência anterior e some da
      // Programação de hoje (mesma lógica do antigo sync-operacional-os).
      payload.status_gestor = null;
      payload.status_conferencia = 'PENDENTE';
    }
    await supabase.upsertByNumeroOs(payload);
    upserts++;
  }

  let removidos = 0;
  if (ultimoCicloNumeros) {
    const referencia = ultimoCicloNumeros.size;
    const cobertura = referencia > 0 ? novosNumeros.size / referencia : 1;
    if (cobertura >= LIMITE_PROPORCAO_REMOCAO) {
      const ausentes = currentRows.map((row) => row.numero_os).filter((numero) => !novosNumeros.has(numero));
      if (ausentes.length) {
        await supabase.deleteByNumeroOs(ausentes);
        removidos = ausentes.length;
      }
    } else {
      logger.warn(`Cobertura ${(cobertura * 100).toFixed(1)}% (${novosNumeros.size}/${referencia}) abaixo do limite; pulando remoção automática de O.S. ausentes (possível resposta incompleta do GRM).`);
    }
  }
  ultimoCicloNumeros = novosNumeros;

  return { remote: remoteRows.length, upserts, removidos };
}

async function main() {
  const supabase = createSupabaseRest(
    requiredEnv('SUPABASE_URL', ['SB_URL']),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY', 'SB_SERVICE_KEY', 'SUPABASE_KEY']),
  );
  let token = await login();
  logger.info(`Agente iniciado; intervalo ${POLL_INTERVAL_MS} ms.`);

  while (true) {
    const startedAt = Date.now();
    try {
      let orders;
      try {
        orders = await fetchServiceOrders(token);
      } catch (error) {
        if (!error.requiresLogin && error.statusCode !== 401) throw error;
        token = await login();
        orders = await fetchServiceOrders(token);
      }
      const result = await applyCycle(supabase, orders);
      if (result.upserts || result.removidos) {
        logger.info(`${result.upserts || 0} O.S. atualizada(s), ${result.removidos || 0} removida(s), de ${result.remote} em aberto.`);
      }
    } catch (error) {
      logger.error(error.stack || error.message);
    }
    const remaining = Math.max(500, POLL_INTERVAL_MS - (Date.now() - startedAt));
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { mapServiceOrder, diffFields, applyCycle, createSupabaseRest };
