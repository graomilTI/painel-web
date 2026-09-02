#!/usr/bin/env node

/**
 * Sincroniza Resultado Diário direto pela API do GRM, sem abrir navegador —
 * mesmo padrão HTTP puro de grmserver-producao-diaria-api-realtime.js.
 * Continua rodando como job pontual na esteira (SCRIPT_MAP sync-resultado-
 * diario, lane `fixed`), só troca COMO os dados são buscados: a versão
 * anterior já usava a API (fetchReportApi, dentro de page.evaluate) em vez
 * do XLS — só o login (Puppeteer completo: abrir Chrome, preencher form,
 * esperar navegação) era o gargalo. Aqui o login também vira POST direto em
 * user/login, então o script inteiro roda sem browser.
 *
 * Removido código morto que já não era chamado por main() antes desta
 * mudança: downloadReport/parseXLS/ensureAddValuesSim (fluxo de XLS nunca
 * usado de fato, main() sempre chamou fetchReportApi).
 *
 * Janela default reduzida de 30 dias (monthsBack:1, today-29) pra 7 dias
 * (GRM_RESULTADO_DIARIO_DAYS_BACK) — pedido do usuário 02/09. Como
 * replaceTablePeriodSafely só substitui as datas presentes na consulta,
 * histórico fora da janela continua intacto; pra reprocessar um período mais
 * antigo, rodar manualmente com GRM_RESULTADO_DIARIO_DAYS_BACK maior.
 *
 * MIN_ROWS escalado junto com a janela: o valor antigo (1000) foi calibrado
 * pra 30 dias de volume; mantido em 1000 ele abortaria toda promoção de uma
 * janela de 7 dias (staging sempre "pequena demais"). Default novo: ~33
 * linhas/dia (medida do volume antigo) × 7 dias, com folga pra baixo.
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
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { replaceTablePeriodSafely } = require('./safe-table-load');

const supabase = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
);

const REPORT_CONFIG = {
  name: 'Resultado Diário',
  tableName: 'grm_resultado_diario_importacoes',
  painelTableName: 'relatorio_resultado_diario',
};

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const DAYS_BACK = Math.max(1, Number(process.env.GRM_RESULTADO_DIARIO_DAYS_BACK || 7));
const MIN_ROWS = Math.max(1, Number(process.env.GRM_RESULTADO_DIARIO_MIN_ROWS || 200));
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

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
      timeout: 60000,
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

function formatDateBr(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function calculateDateRange() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - (DAYS_BACK - 1));
  return { from: formatDateBr(pastDate), to: formatDateBr(today) };
}

function toIso(brDate) {
  const [day, month, year] = brDate.split('/');
  return `${year}-${month}-${day}`;
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getByAliases(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const expected = normalizeText(alias);
    const key = keys.find((candidate) => normalizeText(candidate) === expected);
    if (key && clean(row[key]) !== '') return row[key];
  }
  return null;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = clean(value);
  const br = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
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

async function fetchResultadoDiarioApi(token, dateRange) {
  const response = await postJson(
    `${GRM_BASE_URL}reports/classification/getDailyResultReport`,
    { requestDateFrom: dateRange.from, requestDateTo: dateRange.to, addValues: 'S' },
    { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` },
  );
  if (!response.result) {
    const error = new Error(`Consulta de Resultado Diário recusada: ${response.message || 'erro GRM'}`);
    error.requiresLogin = Boolean(response.logoutUser);
    throw error;
  }
  if (!Array.isArray(response.searchData)) throw new Error('Resposta do GRM não contém searchData.');
  return response.searchData;
}

// Busca com retry de login em caso de 401/logoutUser, devolvendo o token
// (possivelmente renovado).
async function fetchComRelogin(token, dateRange) {
  try {
    return { rows: await fetchResultadoDiarioApi(token, dateRange), token };
  } catch (error) {
    if (!error.requiresLogin && error.statusCode !== 401) throw error;
    log('WARN', 'Token expirado, refazendo login...');
    const novoToken = await login();
    return { rows: await fetchResultadoDiarioApi(novoToken, dateRange), token: novoToken };
  }
}

function mapApiRowsToFriendlyKeys(rows) {
  const data = rows.map((row) => ({
    'O.S.': row.sorCode,
    Contrato: row.sorContract,
    Produto: row.proName,
    Data: row.loaDate,
    'Funcionário': row.staName,
    'Coordenação': row.olcName,
    'Supervisão': row.olsName,
    'Cliente Nacional': row.clnName,
    'Cliente Regional': row.clrName,
    'Cliente Final': row.cliName,
    'Local de Embarque': row.splName,
    Destino: [row.citNameDestiny, row.staAbreviationDestiny, row.sorDestination].filter(Boolean).join(' - '),
    Cargas: row.qtdLoads,
    Toneladas: row.loaWeight,
    'R$/Ton': row.tonUnitValue,
    'Cadência': row.cadence,
    'Tons Cadência': row.cadenceTons,
    Embarcado: row.embTons,
    'Valor Embarcado': row.embTonsValue,
    'Valor Afla': row.aflaUnitValue,
    'Total Afla': row.aflaTotalValue,
    'Valor Vomitoxina': row.vomitoxinUnitValue,
    'Total Vomitoxina': row.vomitoxinTotalValue,
    'Valor Falling Number': row.fallingNumberUnitValue,
    'Total Falling Number': row.fallingNumberTotalValue,
    'Valor Intacta': row.intactaUnitValue,
    'Total Intacta': row.intactaTotalValue,
    'Valor GMO': row.gmoUnitValue,
    'Total GMO': row.gmoTotalValue,
    'Total Embarcado + Teste': row.totalValue,
    Remanescente: row.sorRemainLot,
    'Motivo NHE': row.nheReason,
    'Observações NHE': row.nheObs,
    _api: row,
  }));
  log('SUCCESS', `${data.length} linhas recebidas pela API`);
  return data;
}

// Mapeamento alinhado com a importação manual (assets/js/modules/relatorios.js,
// readResultadoDiarioRowsFromFile) — mesmas colunas, mesma regra: sem "Embarcado"
// preenchido a linha não entra no painel (é o que o DRE exige).
function mapResultadoDiarioToPainelRows(data) {
  return (data || []).map((row) => {
    const dataRegistro = toIsoDateValue(getByAliases(row, [
      'Data',
      'Data Classificação',
      'Data de Classificação',
      'Dt Classificação',
      'Dt. Classificação',
      'Data Resultado',
      'Data Embarque',
      'Data de Embarque',
    ]));

    const coordenacao = clean(getByAliases(row, ['Coordenação', 'Coordenacao', 'Regional']));
    const toneladas = toNumber(getByAliases(row, ['Toneladas', 'Tons', 'Ton', 'Ton.', 'Peso Líquido', 'Peso Liquido', 'Volume', 'Quantidade', 'Volume Classificado']));
    const embarcadoRaw = getByAliases(row, ['Embarcado', 'Volume Embarcado']);
    const embarcado = embarcadoRaw === null ? null : toNumber(embarcadoRaw);
    const totalEmbTeste = toNumber(getByAliases(row, ['Total Embarcado + Teste', 'Total Embarcado Mais Teste', 'Total Embarcado']));
    const cargas = toNumber(getByAliases(row, ['Cargas', 'Carga', 'Qtd Cargas', 'Qtde Cargas', 'Quantidade de Cargas']));

    return {
      os: clean(getByAliases(row, ['O.S.', 'O.S', 'OS', 'Ordem de Serviço', 'Ordem Servico', 'Nº OS', 'N° OS', 'Nr OS'])),
      contrato: clean(getByAliases(row, ['Contrato'])) || null,
      produto: clean(getByAliases(row, ['Produto'])) || null,
      data: dataRegistro,
      funcionario: clean(getByAliases(row, ['Funcionário', 'Funcionario', 'Classificador', 'Colaborador', 'Nome'])),
      coordenacao,
      supervisao: clean(getByAliases(row, ['Supervisão', 'Supervisao'])) || null,
      cliente_nacional: clean(getByAliases(row, ['Cliente Nacional', 'Cli. Nacional'])) || null,
      cliente_regional: clean(getByAliases(row, ['Cliente Regional', 'Cli. Regional'])) || null,
      cliente_final: clean(getByAliases(row, ['Cliente Final', 'Cli. Final'])) || null,
      local_embarque: clean(getByAliases(row, ['Local de Embarque', 'Local Embarque', 'Local', 'Cidade Embarque', 'Cidade de Embarque', 'Embarque', 'Ponto de Embarque'])),
      destino: clean(getByAliases(row, ['Destino'])) || null,
      cargas,
      toneladas,
      valor_ton: toNumber(getByAliases(row, ['R$/Ton', 'Valor Ton', 'Valor/Ton'])),
      cadencia: toNumber(getByAliases(row, ['Cadência', 'Cadencia'])),
      tons_cadencia: toNumber(getByAliases(row, ['Tons Cadência', 'Tons Cadencia'])),
      embarcado,
      valor_embarcado: toNumber(getByAliases(row, ['Valor Embarcado'])),
      valor_afla: toNumber(getByAliases(row, ['Valor Afla'])),
      total_afla: toNumber(getByAliases(row, ['Total Afla'])),
      valor_vomitoxina: toNumber(getByAliases(row, ['Valor Vomitoxina'])),
      total_vomitoxina: toNumber(getByAliases(row, ['Total Vomitoxina'])),
      valor_falling_number: toNumber(getByAliases(row, ['Valor Falling Number'])),
      total_falling_number: toNumber(getByAliases(row, ['Total Falling Number'])),
      valor_intacta: toNumber(getByAliases(row, ['Valor Intacta'])),
      total_intacta: toNumber(getByAliases(row, ['Total Intacta'])),
      valor_gmo: toNumber(getByAliases(row, ['Valor GMO'])),
      total_gmo: toNumber(getByAliases(row, ['Total GMO'])),
      total_embarcado_mais_teste: totalEmbTeste,
      remanescente: toNumber(getByAliases(row, ['Remanescente'])),
      motivo_nhe: clean(getByAliases(row, ['Motivo NHE'])) || null,
      observacoes_nhe: clean(getByAliases(row, ['Observações NHE', 'Observacoes NHE'])) || null,
      situacao: clean(getByAliases(row, ['Situação', 'Situacao'])) || null,
      observacoes: clean(getByAliases(row, ['Observações', 'Observacoes'])) || null,
    };
  }).filter((row) => {
    if (!(row.data && row.coordenacao !== '' && row.toneladas !== null)) return false;
    // mesma regra da importação manual: precisa de pelo menos um indicador de volume/embarcado/carga.
    const hasMetric = [row.toneladas, row.embarcado, row.total_embarcado_mais_teste, row.cargas].some((v) => v !== null && v !== 0);
    if (!hasMetric) return false;
    if (row.embarcado === null) {
      log('WARN', `O.S. ${row.os || '(sem número)'}: sem "Embarcado" na resposta da API — verifique se addValues=S está sendo enviado.`);
      return false;
    }
    return true;
  });
}

async function replacePainelResultadoDiario(data) {
  const dateRange = calculateDateRange();
  const fromIso = toIso(dateRange.from);
  const toIsoRange = toIso(dateRange.to);
  const rows = mapResultadoDiarioToPainelRows(data);

  if (!rows.length) {
    log('WARN', `Nenhuma linha compatível com ${REPORT_CONFIG.painelTableName}. Verifique a resposta da API acima.`);
    return;
  }

  log('INFO', `Atualizando ${REPORT_CONFIG.painelTableName}: ${rows.length} registros de ${fromIso} até ${toIsoRange}...`);

  await replaceTablePeriodSafely(supabase, REPORT_CONFIG.painelTableName, rows, {
    dateColumn: 'data',
    minRows: MIN_ROWS,
    chunkSize: 500,
    logger: console,
  });

  log('SUCCESS', `Tabela ${REPORT_CONFIG.painelTableName} sincronizada com segurança: ${rows.length} registros.`);
}

async function upsertData(data) {
  log('INFO', `Iniciando upsert de ${data.length} registros...`);
  const dateRange = calculateDateRange();
  const records = data.map(row => ({
    data_classificacao_de: toIso(dateRange.from),
    data_classificacao_ate: toIso(dateRange.to),
    cliente_nacional: row['Cliente Nacional'] || null,
    uf_embarque: row['UF de Embarque'] || null,
    uf_destino: row['UF de Destino'] || null,
    produto: row['Produto'] || null,
    coordenacao: row['Coordenação'] || null,
    resultado: parseFloat(row['Resultado'] || row['Valor']) || null,
    dados_json: row,
    data_sincronizacao: new Date().toISOString(), sincronizado_em: new Date().toISOString()
  }));

  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error } = await supabase.from(REPORT_CONFIG.tableName).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + 100, records.length)}/${records.length}`);
  }

  log('SUCCESS', `Upsert concluído: ${records.length} registros`);
  await replacePainelResultadoDiario(data);
}

async function main() {
  log('INFO', `=== Iniciando sincronização ${REPORT_CONFIG.name} (via API, janela de ${DAYS_BACK} dia(s)) ===`);
  const token = await login();
  const dateRange = calculateDateRange();
  log('INFO', `Consultando API de Resultado Diário: ${dateRange.from} até ${dateRange.to}`);
  const busca = await fetchComRelogin(token, dateRange);
  const data = mapApiRowsToFriendlyKeys(busca.rows);
  await upsertData(data);
  log('SUCCESS', `Sincronização ${REPORT_CONFIG.name} concluída!`);
}

main().then(() => process.exit(0)).catch(err => { log('ERROR', err.stack || err.message); process.exit(1); });
setTimeout(() => process.exit(0), 300000);
