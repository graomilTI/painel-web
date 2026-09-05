#!/usr/bin/env node

/**
 * Sincroniza Mapa de Embarque direto pela API do Graint, substituindo o
 * fluxo Puppeteer (grm-sync-mapa-embarque.js) — mesmo padrão de
 * grmserver-patrimonios-api.js. Diferente dos outros agentes migrados, o
 * script Puppeteer antigo NÃO fazia fetch nenhum: baixava um XLS gerado
 * 100% no navegador (biblioteca exceljs rodando client-side a partir dos
 * mesmos dados que a tela já tinha).
 *
 * Descoberto ao vivo em 05/09 (sessão logada real + baixando o bundle JS da
 * tela `/assets/BoardingMap-*.js`):
 * - Endpoint: POST `/api/manager/boardPanel/getDayBoardingData`, body `{}`
 *   devolve TODAS as 339 O.S. do dia (sem filtro) — o checkbox "Apenas com
 *   Logística" da tela manda `withLogistic:'S'` no body e reduz pra ~2
 *   linhas; como grm_mapa_embarque_importacoes historicamente gira
 *   ~21-27 mil linhas/dia (ver grm-sync-lancar-nhe.js) contra ~339 O.S.
 *   ativas, e o clique nesse checkbox no script antigo tinha fallback
 *   silencioso pra "seguir sem alterar filtro" quando não encontrava o
 *   elemento, o volume histórico bate com o corpo VAZIO (sem filtro), não
 *   com `withLogistic:'S'`. Replicado aqui sem filtro.
 * - Mapeamento de colunas: extraído da função de geração do XLS
 *   (`PrintBoardingListXLS` em BoardingMap-*.js, que grava as colunas
 *   col1..col34 com os MESMOS nomes de cabeçalho do XLS antigo) — column
 *   title -> campo da API, replicado 1:1 abaixo em `mapBoardingRow`. Em
 *   particular "Última Atualização" (usada por assets/js/logistica-fob-page-v9.js
 *   e grm-sync-lancar-nhe.js pra decidir se uma O.S. teve movimento hoje)
 *   vem de `solDate`, confirmado também no card de detalhe do pin no mapa
 *   ("Última Atualização: " + sOrder.solDate).
 *
 * Datas formatadas como DD/MM/AAAA HH:mm (mesmo formato que o XLS produzia,
 * numFmt "dd/mm/yyyy hh:mm") pra não quebrar o parser Brasileiro usado
 * pelos consumidores (`parseDateOnly` em logistica-fob-page-v9.js e
 * grm-sync-lancar-nhe.js).
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
  name: 'Mapa de Embarque',
  tableName: 'grm_mapa_embarque_importacoes',
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

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

async function fetchBoardData(token) {
  log('INFO', `Buscando ${REPORT_CONFIG.name} via API...`);
  const json = await postJson(`${GRM_BASE_URL}manager/boardPanel/getDayBoardingData`, {}, authHeaders(token));
  if (!json.result) throw new Error(`getDayBoardingData falhou: ${json.message || 'erro'}`);
  const rows = Array.isArray(json.sOrderData) ? json.sOrderData : [];
  log('SUCCESS', `${rows.length} O.S. recebidas (${json.resume?.sPlaces ?? '?'} locais de embarque).`);
  return rows;
}

function pad2(n) { return String(n).padStart(2, '0'); }

// GRM devolve "YYYY-MM-DD HH:mm:ss"; formata igual ao XLS antigo (DD/MM/AAAA HH:mm)
// pra não quebrar o parser Brasileiro dos consumidores (parseDateOnly).
function toBrDateTime(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return '';
}

function todayBr() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Mesmo mapeamento 1:1 que PrintBoardingListXLS (BoardingMap-*.js) grava no XLS —
// ver comentário no topo do arquivo.
function mapBoardingRow(row, dataHoje) {
  return {
    'Data': dataHoje,
    'OS': row.sorCode,
    'Contrato': row.sorContract,
    'Cliente': row.cliName,
    'Supervisão': row.olsName,
    'UF': row.citNameUF,
    'Cidade': row.citName,
    'Local': row.splName,
    'Classificador': row.staName,
    'Produto': row.proName,
    'Tipo de Produto': row.ptyName,
    'Início': row.checkInDate ? toBrDateTime(row.checkInDate) : (row.firstLoad ? toBrDateTime(row.firstLoad) : '--'),
    'Tons Hoje': (row.totalLoadsDayWeight ?? 0) / 1000,
    'Tons Total O.S.': (row.totalLoadsWeight ?? 0) / 1000,
    'Remanescente': (row.sorLotSize ?? 0) / 1000 - (row.totalLoadsWeight ?? 0) / 1000,
    'Número do Lote': row.sorLotNumber,
    'Lote': (row.sorLotSize ?? 0) / 1000,
    'Aguardando': row.solYard || 0,
    'Ag. N.F. Produtor': row.solWaitingProducerInvoice || 0,
    'Carregando': row.solLoading || 0,
    'Cargas Hoje': row.totalLoadsDayCount || 0,
    'Ag. Manifesto': row.solWaitingManifest || 0,
    'Liberados': row.solOnTravel || 0,
    'Integra Iniciado': row.integraInitiated,
    'Integra Pendente': (row.integraInitiated - row.integraFinalized) || 0,
    'Integra Finalizado': row.integraFinalized,
    'Refugados': row.solPNE || 0,
    'Checkin': row.checkInDate ? toBrDateTime(row.checkInDate) : '',
    'Primeira Carga': row.firstLoad ? toBrDateTime(row.firstLoad) : '',
    'Última Carga': row.lastLoad ? toBrDateTime(row.lastLoad) : '',
    'CheckOut': row.checkOutDate ? toBrDateTime(row.checkOutDate) : '',
    'Última Atualização': row.solDate ? toBrDateTime(row.solDate) : '',
    'Atualizado por': row.staNameLogistic,
    'Observações': row.solObs,
  };
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const records = data.map(row => ({
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

// Usa fetch cru, não supabase.functions.invoke(): na versão do @supabase/supabase-js
// instalada em produção (2.112.0) o invoke() não está mandando o header Authorization
// esperado pela função (que exige `Bearer <SUPABASE_SERVICE_ROLE_KEY>` — ver
// supabase/functions/mapa-embarque-alertas/index.ts), e a chamada sempre volta 401
// "Não autorizado" mesmo com a service key certa no .env. Confirmado ao vivo em 05/09:
// fetch cru com a mesma chave funciona (200), invoke() falha (401) — bug pré-existente
// da lib, não específico deste agente (script Puppeteer antigo tinha o mesmo problema
// nessa mesma chamada, silenciosamente falhando só nesse passo final).
async function processarAlertasDeAtualizacao() {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const response = await requestJson(`${process.env.SUPABASE_URL}/functions/v1/mapa-embarque-alertas`, 'POST', { action: 'scan' }, {
    authorization: `Bearer ${supabaseKey}`,
    apikey: supabaseKey,
  });
  if (!response?.ok) throw new Error(`Alertas do Mapa de Embarque recusados: ${response?.error || 'resposta inválida'}`);
  log('SUCCESS', `Alertas processados: ${JSON.stringify(response)}`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API) ===`);
  const token = await login();
  const rows = await fetchBoardData(token);
  const dataHoje = todayBr();
  const data = rows.map((row) => mapBoardingRow(row, dataHoje));
  await upsertData(data);
  await processarAlertasDeAtualizacao();
  log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchBoardData, mapBoardingRow, toBrDateTime, login };
