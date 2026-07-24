#!/usr/bin/env node

/**
 * Sincronização de colaboradores com histórico de situação.
 *
 * O relatório XLS do GRM é a fonte da verdade. Antes de sobrescrever a tabela
 * `colaboradores`, este wrapper compara a situação recém-extraída com o último
 * relatório conhecido e grava as mudanças em `colaboradores_status_historico`.
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loginGrmServer,
  downloadColaboradoresXls,
  parseColaboradoresXls,
  upsertColaboradores,
} = require('./grmserver-colaboradores-sync');

puppeteer.use(StealthPlugin());

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
};

function loadSecrets() {
  const secrets = {
    GRMSERVER_USER: process.env.GRMSERVER_USER,
    GRMSERVER_PASSWORD: process.env.GRMSERVER_PASSWORD,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_KEY,
  };

  const missing = Object.entries(secrets)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`Secrets ausentes: ${missing.join(', ')}`);
  return secrets;
}

function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'grm-sync');
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function isActiveStatus(value) {
  return normalizeStatus(value) === 'ATIVO';
}

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function effectiveDate(row) {
  const dates = [isoDate(row?.admissao), isoDate(row?.desligamento)].filter(Boolean).sort();
  return dates.at(-1) || '';
}

function reportRowScore(row) {
  const effective = effectiveDate(row).replace(/-/g, '');
  const dateScore = Number(effective || 0);
  const statusScore = isActiveStatus(row?.situacao) ? 0 : 1;
  const dismissalScore = row?.desligamento ? 1 : 0;
  return dateScore * 100 + statusScore * 10 + dismissalScore;
}

function dedupeReport(rows) {
  const byCpf = new Map();
  let duplicates = 0;

  for (const row of rows || []) {
    const cpf = normalizeCpf(row?.cpf);
    if (!cpf) continue;
    const normalized = { ...row, cpf };
    const previous = byCpf.get(cpf);
    if (!previous) {
      byCpf.set(cpf, normalized);
      continue;
    }
    duplicates += 1;
    if (reportRowScore(normalized) >= reportRowScore(previous)) byCpf.set(cpf, normalized);
  }

  if (duplicates) logger.warn(`${duplicates} linha(s) duplicada(s) por CPF no XLS foram consolidadas.`);
  return [...byCpf.values()];
}

async function fetchAll(supabase, table, select, maxRows = 20000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function rowMoment(row) {
  const candidates = [
    row?.sincronizado_em,
    row?.updated_at,
    row?.created_at,
    row?.desligamento,
    row?.admissao,
  ];
  return Math.max(...candidates.map((value) => Date.parse(value || '') || 0));
}

function currentByCpf(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const cpf = normalizeCpf(row?.cpf);
    if (!cpf) continue;
    if (!grouped.has(cpf)) grouped.set(cpf, []);
    grouped.get(cpf).push(row);
  }

  const result = new Map();
  grouped.forEach((records, cpf) => {
    const latest = [...records].sort((a, b) => rowMoment(b) - rowMoment(a))[0];
    result.set(cpf, latest || records[0]);
  });
  return result;
}

function latestHistoryByCpf(rows) {
  const result = new Map();
  for (const row of rows || []) {
    const cpf = normalizeCpf(row?.cpf);
    if (!cpf) continue;
    const previous = result.get(cpf);
    const rowKey = `${row?.data_efetiva || ''}|${row?.detectado_em || ''}`;
    const previousKey = previous ? `${previous.data_efetiva || ''}|${previous.detectado_em || ''}` : '';
    if (!previous || rowKey > previousKey) result.set(cpf, row);
  }
  return result;
}

async function insertHistoryRow(supabase, payload) {
  const { error } = await supabase.from('colaboradores_status_historico').insert(payload);
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function registerStatusChanges(supabase, reportRows, reportReference) {
  logger.info('Comparando a situação do XLS com o relatório anterior...');

  const [currentRows, historyRows] = await Promise.all([
    fetchAll(
      supabase,
      'colaboradores',
      'id,cpf,nome,situacao,admissao,desligamento,sincronizado_em,created_at,updated_at',
      20000,
    ),
    fetchAll(
      supabase,
      'colaboradores_status_historico',
      'id,cpf,nome,situacao_nova,ativo_novo,data_efetiva,detectado_em',
      50000,
    ).catch((error) => {
      if (error.code === '42P01' || /does not exist|não existe/i.test(error.message || '')) {
        throw new Error('A migration colaboradores_status_historico ainda não foi aplicada no Supabase.');
      }
      throw error;
    }),
  ]);

  const currentMap = currentByCpf(currentRows);
  const historyMap = latestHistoryByCpf(historyRows);
  const detectedDate = reportReference.slice(0, 10);
  const changes = [];

  for (const row of reportRows) {
    const cpf = normalizeCpf(row.cpf);
    const current = currentMap.get(cpf);
    const latestHistory = historyMap.get(cpf);
    const newActive = isActiveStatus(row.situacao);
    const previousActive = latestHistory
      ? Boolean(latestHistory.ativo_novo)
      : current
        ? isActiveStatus(current.situacao)
        : null;

    // Na primeira execução, registra também todo não ativo já existente no XLS.
    // Assim o histórico começa correto mesmo quando a mudança ocorreu antes da
    // instalação desta rotina.
    const needsInactiveBaseline = !newActive && !latestHistory;
    const changed = previousActive !== null && previousActive !== newActive;
    if (!changed && !needsInactiveBaseline) continue;

    const dataEfetiva = newActive
      ? (isoDate(row.admissao) || detectedDate)
      : (isoDate(row.desligamento) || detectedDate);

    const payload = {
      colaborador_id: current?.id || null,
      cpf,
      nome: row.nome || current?.nome || '',
      situacao_anterior: latestHistory?.situacao_nova || current?.situacao || null,
      situacao_nova: row.situacao || (newActive ? 'Ativo' : 'Não ativo'),
      ativo_anterior: previousActive,
      ativo_novo: newActive,
      data_efetiva: dataEfetiva,
      detectado_em: reportReference,
      relatorio_referencia: reportReference,
      fonte: 'grmserver_relatorio_colaboradores',
      metadata: {
        comparacao: latestHistory ? 'ultimo_historico_x_novo_xls' : 'base_atual_x_novo_xls',
        admissao_xls: row.admissao || null,
        desligamento_xls: row.desligamento || null,
      },
    };

    if (await insertHistoryRow(supabase, payload)) {
      changes.push(payload);
      historyMap.set(cpf, payload);
    }
  }

  const inactive = changes.filter((row) => !row.ativo_novo).length;
  const reactivated = changes.filter((row) => row.ativo_novo).length;
  logger.success(`Comparação concluída: ${changes.length} mudança(s), ${inactive} não ativo(s), ${reactivated} reativação(ões).`);
  return { total: changes.length, inactive, reactivated };
}

async function cleanup(browser, tempDir) {
  try {
    if (browser) await browser.close();
  } catch (error) {
    logger.warn(`Falha ao fechar o navegador: ${error.message}`);
  }

  try {
    if (!fs.existsSync(tempDir)) return;
    for (const file of fs.readdirSync(tempDir)) {
      const filePath = path.join(tempDir, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.warn(`Falha na limpeza temporária: ${error.message}`);
  }
}

async function main() {
  let browser = null;
  const tempDir = getTempDir();

  try {
    logger.info('=== Iniciando sincronização de colaboradores com histórico ===');
    const secrets = loadSecrets();
    const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket },
    });

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
        '--disable-site-isolation-trials',
      ],
      defaultViewport: { width: 1920, height: 1440 },
    });

    const page = await loginGrmServer(
      browser,
      secrets.GRMSERVER_USER,
      secrets.GRMSERVER_PASSWORD,
    );
    const xlsFile = await downloadColaboradoresXls(page, tempDir);
    await page.close();

    const parsedRows = parseColaboradoresXls(xlsFile);
    const reportRows = dedupeReport(parsedRows);
    const reportReference = new Date().toISOString();

    // A comparação precisa acontecer antes do upsert, pois a tabela colaboradores
    // ainda representa o relatório anterior neste ponto.
    const history = await registerStatusChanges(supabase, reportRows, reportReference);
    const upsert = await upsertColaboradores(supabase, reportRows);

    const result = { extracted: parsedRows.length, unique: reportRows.length, history, upsert };
    logger.success('=== Sincronização com histórico concluída ===');
    logger.info(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await cleanup(browser, tempDir);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(`Erro fatal: ${error.message}`);
      logger.error(error.stack || '');
      process.exit(1);
    });
  setTimeout(() => process.exit(1), 180000);
}

module.exports = {
  dedupeReport,
  registerStatusChanges,
  main,
};
