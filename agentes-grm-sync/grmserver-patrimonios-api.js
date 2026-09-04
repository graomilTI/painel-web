#!/usr/bin/env node

/**
 * Sincroniza Patrimônios direto pela API do Graint, substituindo o fluxo
 * Puppeteer/XLS (grm-sync-patrimonios.js) — mesmo tipo de migração já feita em
 * Colaboradores, Lista de O.S., Distribuição de O.S. e Liberação de Despesas
 * (ver grmserver-colaboradores-api-realtime.js, grmserver-lista-os-api-realtime.js,
 * grmserver-aplicar-distribuicao-os-api.js, grmserver-liberacao-despesas-api.js).
 *
 * Endpoint descoberto no bundle do Graint (assets/index-*.js, chave `patrimony`
 * do mapa de recursos): `patrimonies/getRecords` (POST, sem filtros no body
 * devolve TODOS os patrimônios, inclusive baixados/inativos — 4907 linhas em
 * 04/09 contra 3137 na exportação em XLS). A tela de Patrimônio exporta só os
 * registros com patStatus:"A" ("ativos" no sentido de registro não removido,
 * não confundir com patSituation) — replicado abaixo com o mesmo filtro.
 *
 * Mapeamento de campos validado 1:1 comparando a resposta da API com
 * patrimonios_snapshot (dados da última sincronização via XLS, mesmos
 * patrimonio_codigo):
 *   patNumber        -> Patrimônio        | olcName -> Coordenação
 *   olsName          -> Supervisão        | staName -> Funcionário
 *   patName          -> Identificação     | pcaName -> Categoria
 *   pbrName          -> Marca             | pmoName -> Modelo
 *   patAcquisitionDate -> Data de Aquisição | patRegisterDate -> Data de Registro
 *   patLastCheck     -> Ultima Leitura    | daysWithoutCheck -> Dias sem Leitura
 *   patSituation     -> Situação (código A/B/M/E, ver SITUACAO_LABELS abaixo,
 *                        confirmado por contagem: A=3090, M=45, B=1, E=1 na
 *                        API == Ativo=3090, Manutenção=45, Baixado=1,
 *                        Estoque=1 no snapshot atual)
 *
 * As linhas geradas usam as MESMAS chaves em português que o XLS produzia
 * (COL abaixo) de propósito: o restante do arquivo (mapAgentRow em diante) é
 * a mesma lógica de grm-sync-patrimonios.js/assets/js/patrimoniosAgentSync.js
 * (efeitos colaterais: patrimonios_snapshot, regional de veículo por leitura,
 * fila do BFleet) e assets/js/patrimoniosAgentSync.js lê essas mesmas chaves
 * de volta de grm_patrimonios_importacoes.dados_json quando o usuário dispara
 * a sincronização manual pela tela — não pode divergir.
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
  name: 'Patrimônios',
  tableName: 'grm_patrimonios_importacoes',
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

// Código de patSituation -> mesmo texto que a exportação em XLS produzia na
// coluna "Situação" (ver descoberta no comentário do topo).
const SITUACAO_LABELS = { A: 'Ativo', B: 'Baixado', M: 'Manutenção', E: 'Estoque' };

async function fetchPatrimonyRows(token) {
  log('INFO', `Buscando ${REPORT_CONFIG.name} via API...`);
  const response = await postJson(`${GRM_BASE_URL}patrimonies/getRecords`, {}, authHeaders(token));
  if (!response.result) throw new Error(`patrimonies/getRecords falhou: ${response.message || 'erro'}`);
  const rows = Array.isArray(response.searchData) ? response.searchData : [];
  // patStatus:"A" == registro ativo (não removido) no Graint; é o filtro que a
  // tela de Patrimônio aplica antes de gerar o XLS (replicado aqui).
  const ativos = rows.filter((row) => row.patStatus === 'A');
  const data = ativos.map((row) => ({
    'Patrimônio': row.patNumber,
    'Coordenação': row.olcName,
    'Supervisão': row.olsName,
    'Funcionário': row.staName,
    'Identificação': row.patName,
    'Categoria': row.pcaName,
    'Marca': row.pbrName,
    'Modelo': row.pmoName,
    'Data de Aquisição': row.patAcquisitionDate,
    'Data de Registro': row.patRegisterDate,
    'Situação': SITUACAO_LABELS[row.patSituation] || row.patSituation || null,
    'Ultima Leitura': row.patLastCheck,
    'Dias sem Leitura': row.daysWithoutCheck,
  }));
  log('SUCCESS', `${data.length} linhas (${rows.length} no Graint, ${rows.length - ativos.length} ignoradas por patStatus != "A")`);
  return data;
}

async function upsertData(data) {
  const startedAt = new Date();
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: startedAt.toISOString(), sincronizado_em: startedAt.toISOString() }));
  for (let i = 0; i < records.length; i += 100) {
    // Mesmo motivo do script Puppeteer que este substitui: onConflict:'id'
    // nunca colide (id é gen_random_uuid() por default) — insert simples +
    // limpeza do lote anterior, tabela só serve de estágio do lote mais
    // recente (lido por assets/js/patrimoniosAgentSync.js).
    const { error } = await supabase.from(REPORT_CONFIG.tableName).insert(records.slice(i, i + 100));
    if (error) throw error;
  }
  const { error: cleanupError } = await supabase
    .from(REPORT_CONFIG.tableName)
    .delete()
    .lt('created_at', startedAt.toISOString());
  if (cleanupError) log('WARN', `Falha ao limpar lote antigo de ${REPORT_CONFIG.tableName}: ${cleanupError.message}`);
  log('SUCCESS', `${records.length} registros sincronizados`);
}

// A partir daqui: mesmo mapeamento/efeitos colaterais que assets/js/patrimoniosAgentSync.js
// e grm-sync-patrimonios.js (Puppeteer, mantido no disco pra rollback) — ver LOTE_MINIMO e
// comentários abaixo para o motivo de cada etapa. Roda logo após a leitura de patrimônio para
// já associar motorista<->veículo e enfileirar o condutor pro BFleet nesta mesma execução.
const COL = {
  patrimonioCodigo: ['Patrimônio', 'Patrimonio'],
  coordenacao: ['Coordenação', 'Coordenacao'],
  supervisao: ['Supervisão', 'Supervisao'],
  funcionario: ['Funcionário', 'Funcionario'],
  identificacao: ['Identificação', 'Identificacao'],
};

function normalizeKeyAgente(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getFieldAgente(row, aliases = []) {
  if (!row) return null;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const map = new Map();
  Object.keys(row).forEach((key) => map.set(normalizeKeyAgente(key), row[key]));
  for (const alias of aliases) {
    const hit = map.get(normalizeKeyAgente(alias));
    if (hit !== undefined) return hit;
  }
  return null;
}

function normalizeTextAgente(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeIntegerAgente(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).replace(/[^\d-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizePatrimonioCodigoAgente(value) {
  return normalizeTextAgente(value)?.trim().toUpperCase() || null;
}

function dateTimeToIsoAgente(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const brDateTime = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDateTime) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = brDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }
  const isoDateTime = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoDateTime) {
    const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = isoDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }
  return null;
}

function mapAgentRow(d, dataUpload, importacaoId) {
  const patrimonioCodigo = normalizePatrimonioCodigoAgente(getFieldAgente(d, COL.patrimonioCodigo));
  return {
    importacao_id: importacaoId,
    data_upload: dataUpload,
    patrimonio_codigo: patrimonioCodigo,
    coordenacao: normalizeTextAgente(getFieldAgente(d, COL.coordenacao)),
    supervisao: normalizeTextAgente(getFieldAgente(d, COL.supervisao)),
    funcionario: normalizeTextAgente(getFieldAgente(d, COL.funcionario)),
    identificacao: normalizeTextAgente(getFieldAgente(d, COL.identificacao)),
    categoria: normalizeTextAgente(getFieldAgente(d, ['Categoria'])),
    marca: normalizeTextAgente(getFieldAgente(d, ['Marca'])),
    modelo: normalizeTextAgente(getFieldAgente(d, ['Modelo'])),
    data_aquisicao: dateTimeToIsoAgente(getFieldAgente(d, ['Data de Aquisição', 'Data de Aquisicao'])),
    data_registro: dateTimeToIsoAgente(getFieldAgente(d, ['Data de Registro'])),
    situacao: normalizeTextAgente(getFieldAgente(d, ['Situação', 'Situacao'])),
    ultima_leitura: dateTimeToIsoAgente(getFieldAgente(d, ['Ultima Leitura', 'Última Leitura'])),
    dias_sem_leitura: normalizeIntegerAgente(getFieldAgente(d, ['Dias sem Leitura'])),
    hash_linha: patrimonioCodigo,
  };
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertBatches(table, rows, batchSize, onConflict) {
  for (const chunk of chunkArray(rows, batchSize)) {
    const query = onConflict
      ? supabase.from(table).upsert(chunk, { onConflict })
      : supabase.from(table).insert(chunk);
    const { error } = await query;
    if (error) throw error;
  }
}

const LETRA_PARA_DIGITO = { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9' };

function placaKey(value) {
  const p = String(value || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (p.length !== 7) return p;
  const c4 = p[4];
  return LETRA_PARA_DIGITO[c4] !== undefined ? p.slice(0, 4) + LETRA_PARA_DIGITO[c4] + p.slice(5) : p;
}

function extrairPlacasKeys(texto) {
  const s = String(texto || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = s.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/g) || [];
  return [...new Set(matches.map(placaKey))].filter((k) => k.length === 7);
}

function dataMs(value) {
  const t = value ? Date.parse(value) : 0;
  return Number.isFinite(t) ? t : 0;
}

async function ajustarRegionalVeiculosPorLeitura(rows) {
  const leituras = rows
    .filter((row) => row.coordenacao && row.identificacao)
    .flatMap((row) => extrairPlacasKeys(row.identificacao).map((key) => ({
      key, coordenacao: row.coordenacao, ultima_leitura: row.ultima_leitura, data_upload: row.data_upload,
    })));
  if (!leituras.length) return 0;

  const { data: veiculos, error } = await supabase
    .from('frotas_veiculos').select('id,placa,coordenacao,status').eq('status', 'ATIVO').limit(10000);
  if (error) throw error;

  const porPlaca = new Map((veiculos || []).map((v) => [placaKey(v.placa), v]));
  const melhorPorVeiculo = new Map();
  leituras.forEach((leitura) => {
    const veiculo = porPlaca.get(leitura.key);
    if (!veiculo) return;
    const atual = melhorPorVeiculo.get(veiculo.id);
    const novaData = Math.max(dataMs(leitura.ultima_leitura), dataMs(leitura.data_upload));
    const atualData = atual ? Math.max(dataMs(atual.ultima_leitura), dataMs(atual.data_upload)) : -1;
    if (!atual || novaData >= atualData) melhorPorVeiculo.set(veiculo.id, { ...leitura, veiculo });
  });

  let atualizados = 0;
  for (const { veiculo, coordenacao } of melhorPorVeiculo.values()) {
    if (veiculo.coordenacao === coordenacao) continue;
    const { error: updError } = await supabase.from('frotas_veiculos').update({ coordenacao }).eq('id', veiculo.id);
    if (!updError) atualizados += 1;
  }
  return atualizados;
}

// lote mínimo aceitável, mesmo critério de patrimoniosAgentSync.js: um lote muito menor
// indica leitura parcial/falha e não deve sobrescrever o snapshot atual (patrimonios_snapshot
// é truncado e reescrito a cada sincronização).
const LOTE_MINIMO = 1000;

async function sincronizarSnapshotEVeiculos(data) {
  if (data.length < LOTE_MINIMO) {
    log('WARN', `leitura pequena demais (${data.length} linhas); associação de veículos/BFleet ignorada para não sobrescrever a base atual.`);
    return;
  }

  const dataUpload = new Date().toISOString();

  const { data: importacao, error: impError } = await supabase
    .from('patrimonios_importacoes')
    .insert({
      nome_arquivo: 'sync-patrimonios (worker/api)',
      origem: 'agente_grm_sync',
      status: 'processando',
      total_linhas: data.length,
      data_upload: dataUpload,
    })
    .select('id')
    .single();
  if (impError) throw impError;
  const importacaoId = importacao.id;

  const mappedRaw = data.map((d) => mapAgentRow(d, dataUpload, importacaoId)).filter((row) => row.patrimonio_codigo);
  const uniqueMap = new Map();
  mappedRaw.forEach((row) => uniqueMap.set(row.patrimonio_codigo, row));
  const mapped = [...uniqueMap.values()];

  const { error: limparError } = await supabase.rpc('limpar_patrimonios_snapshot');
  if (limparError) throw limparError;
  await upsertBatches('patrimonios_snapshot', mapped, 500, 'patrimonio_codigo');

  await supabase
    .from('patrimonios_importacoes')
    .update({
      status: 'concluido',
      total_importadas: mapped.length,
      total_erros: Math.max(data.length - mapped.length, 0),
    })
    .eq('id', importacaoId);

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('patrimonios_historico_leituras')
    .select('id', { count: 'exact', head: true })
    .gte('data_upload', inicioHoje.toISOString());
  if (!count) await upsertBatches('patrimonios_historico_leituras', mapped, 500, null);

  let veiculosRegionalAjustados = 0;
  try {
    veiculosRegionalAjustados = await ajustarRegionalVeiculosPorLeitura(mapped);
  } catch (error) {
    log('WARN', `falha ao ajustar regional dos veículos: ${error.message}`);
  }

  const { data: syncData, error: syncError } = await supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
  if (syncError) throw syncError;

  log('SUCCESS', `patrimônios processados: ${mapped.length}, veículos atualizados: ${Number(syncData?.veiculos_atualizados || 0)}, regionais ajustadas: ${veiculosRegionalAjustados}`);

  // trg_enqueue_bfleet_condutor_update já colocou os veículos com motorista alterado em
  // frotas_bfleet_condutores_fila; dispara a Edge Function agora pra não esperar o cron de
  // segurança (update-bfleet-condutores-5min) drenar a fila.
  const { data: bfleetData, error: bfleetError } = await supabase.functions.invoke('update-bfleet-condutores', {
    body: { mode: 'pending', limit: 200 },
  });
  if (bfleetError) throw bfleetError;
  log('SUCCESS', `BFleet condutores: ${Number(bfleetData?.updated || 0)} atualizado(s), ${Number(bfleetData?.errors || 0)} erro(s), ${Number(bfleetData?.skipped || 0)} ignorado(s) de ${Number(bfleetData?.total_fila || 0)} na fila.`);
}

async function main() {
  log('INFO', `=== ${REPORT_CONFIG.name} (API) ===`);
  const token = await login();
  const data = await fetchPatrimonyRows(token);
  await upsertData(data);
  try {
    await sincronizarSnapshotEVeiculos(data);
  } catch (error) {
    // best-effort: a leitura de patrimônio (o que importa pro grm_sync_jobs) já foi
    // gravada com sucesso acima; não derruba o job por uma falha na associação de
    // veículos/BFleet (o cron update-bfleet-condutores-5min ainda drena a fila depois).
    log('WARN', `associação veículos/BFleet falhou: ${error.message}`);
  }
  log('SUCCESS', 'Concluído');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 120000);
}

module.exports = { fetchPatrimonyRows, mapAgentRow, login, SITUACAO_LABELS };
