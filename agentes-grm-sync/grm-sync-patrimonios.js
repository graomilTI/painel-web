require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { setupDownloadDir, triggerAndWaitForDownload } = require('./download-utils');

puppeteer.use(StealthPlugin());
const supabase = createClient(process.env.SUPABASE_URL, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY), { realtime: { transport: WebSocket } });

const REPORT_CONFIG = {
  name: 'Patrimônios',
  url: 'https://www.grmserver.com.br/assets/patrimony',
  xlsSelector: '.patrimony-report-to-xls button',
  tableName: 'grm_patrimonios_importacoes'
};

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

async function login(page) {
  log('INFO', 'Login...');
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([page.click('button.submit-btn'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);
  log('SUCCESS', 'Login OK');
}

async function downloadReport(page) {
  log('INFO', `Abrindo ${REPORT_CONFIG.name}...`);
  await page.goto(REPORT_CONFIG.url, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  const tempDir = setupDownloadDir('patrimonios');
  return triggerAndWaitForDownload(page, REPORT_CONFIG.xlsSelector, tempDir);
}

async function parseXLS(filePath) {
  const data = XLSX.utils.sheet_to_json(XLSX.readFile(filePath).Sheets[XLSX.readFile(filePath).SheetNames[0]]);
  log('SUCCESS', `${data.length} linhas`);
  return data;
}

async function upsertData(data) {
  const startedAt = new Date();
  const records = data.map(row => ({ dados_json: row, data_sincronizacao: startedAt.toISOString(), sincronizado_em: startedAt.toISOString() }));
  for (let i = 0; i < records.length; i += 100) {
    // Era upsert com onConflict:'id', mas o payload nunca envia "id" (a coluna é
    // gen_random_uuid() por default) — o onConflict nunca colidia com nada e cada
    // "sincronização" só inserta linhas novas. Isso fez grm_patrimonios_importacoes
    // crescer sem limite (2,26 milhões de linhas em 19 dias). A tabela só serve de
    // estágio do lote mais recente (lido por patrimoniosAgentSync.js), então trocamos
    // por insert simples + limpeza do que sobrou de execuções anteriores logo abaixo.
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
// (porta CommonJS/service-role, sem depender do usuário abrir o painel) — ver LOTE_MINIMO e
// comentários lá para o motivo de cada etapa. Roda logo após a leitura de patrimônio para
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
      nome_arquivo: 'sync-patrimonios (worker)',
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
  let browser;
  try {
    log('INFO', `=== ${REPORT_CONFIG.name} ===`);
    browser = await puppeteer.launch({
      headless: true,
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
    const page = await browser.newPage();
    page.setViewport({ width: 1920, height: 1440 });
    await login(page);
    const data = await parseXLS(await downloadReport(page));
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
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => process.exit(0), 120000);
