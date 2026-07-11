#!/usr/bin/env node

// Ambiente fixo para Chromium/Puppeteer no cPanel.
// Evita erro de partition_address_space e permission denied em /home/grao100/tmp.
process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = '/home/grao100/chrome-runtime/tmp';
process.env.TMPDIR = '/home/grao100/chrome-runtime/tmp';
process.env.XDG_RUNTIME_DIR = '/home/grao100/chrome-runtime/tmp';
process.env.XDG_CACHE_HOME = '/home/grao100/chrome-runtime/cache';
process.env.MALLOC_ARENA_MAX = '2';

/*
  Worker de jobs GRM.

  Uso:
    node worker/grm-sync-job-worker.js --once
    node worker/grm-sync-job-worker.js --loop

  Ele lê public.grm_sync_jobs com status "pendente", executa o script Node/Puppeteer
  correspondente e atualiza o job com sucesso/erro.
*/

require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODE_BIN = process.env.GRM_SYNC_NODE_BIN || '/home/grao100/bin/node';
const SAFE_TMP = process.env.GRM_SYNC_TMPDIR || '/home/grao100/chrome-runtime/tmp';
const POLL_MS = Number(process.env.GRM_SYNC_JOB_POLL_MS || 15000);
const MAX_OUTPUT = 30000;

const SCRIPT_MAP = {
  'sync-colaboradores': 'grmserver-colaboradores-sync.js',
  'sync-producao-diaria': 'grm-sync-producao-diaria.js',
  'sync-locais-embarque': 'grm-sync-locais-embarque.js',
  'sync-resultado-diario': 'grm-sync-resultado-diario.js',
  'sync-despesas': 'grm-sync-despesas.js',
  'sync-notas-fiscais': 'grm-sync-notas-fiscais.js',
  'sync-mapa-embarque': 'grm-sync-mapa-embarque.js',
  'sync-patrimonios': 'grm-sync-patrimonios.js',
  'sync-contas-pagar': 'grm-sync-contas-pagar.js',
  'sync-contas-receber': 'grm-sync-contas-receber.js',
  'sync-auditorias': 'grm-sync-auditorias.js',
  'sync-nhe': 'grm-sync-nhe.js',
  'sync-lista-os': 'grm-sync-lista-os.js',
  'sync-operacional-os': 'grm-sync-operacional-os.js',
  'sync-distribuicao-os': 'grm-sync-distribuicao-os.js',
  'sync-cargas-geofence': 'grm-sync-cargas-geofence.js',
  'sync-btg-relatorios': 'grm-sync-btg-classificador.js',
  'sync-btg-classificador': 'grm-sync-btg-classificador.js',
  'sync-btg-checkin': 'grm-sync-btg-checkin.js',
  'sync-adiantamentos': 'grm-sync-adiantamentos.js',
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.SB_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const supabase = getSupabase();

function log(message) {
  console.log(`[JOB] ${new Date().toISOString()} - ${message}`);
}

function trimOutput(value) {
  if (!value) return '';
  const str = String(value);
  return str.length > MAX_OUTPUT ? str.slice(str.length - MAX_OUTPUT) : str;
}

async function getNextJob() {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateJob(id, patch) {
  const { error } = await supabase
    .from('grm_sync_jobs')
    .update(patch)
    .eq('id', id);

  if (error) throw error;
}

function runScript(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = path.join(PROJECT_ROOT, scriptName);
    const started = Date.now();
    let stdout = '';
    let stderr = '';

    log(`Executando ${scriptName}`);

    const child = spawn(NODE_BIN, [scriptPath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        HOME: process.env.HOME || '/home/grao100',
        TMP: '/home/grao100/chrome-runtime/tmp',
        TEMP: '/home/grao100/chrome-runtime/tmp',
        TMPDIR: '/home/grao100/chrome-runtime/tmp',
        XDG_RUNTIME_DIR: '/home/grao100/chrome-runtime/tmp',
        XDG_CACHE_HOME: '/home/grao100/chrome-runtime/cache',
        MALLOC_ARENA_MAX: '2',
},
      shell: false,
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        code: -1,
        duration_ms: Date.now() - started,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        error: error.message,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        duration_ms: Date.now() - started,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        error: code === 0 ? null : `Script saiu com código ${code}`,
      });
    });
  });
}

async function processOne() {
  const job = await getNextJob();
  if (!job) {
    log('Nenhum job pendente.');
    return false;
  }

  const scriptName = SCRIPT_MAP[job.agente_id];
  if (!scriptName) {
    await updateJob(job.id, {
      status: 'erro',
      finalizado_em: new Date().toISOString(),
      erro: `Agente sem script configurado: ${job.agente_id}`,
    });
    return true;
  }

  await updateJob(job.id, {
    status: 'rodando',
    iniciado_em: new Date().toISOString(),
    erro: null,
  });

  const result = await runScript(scriptName);

  await updateJob(job.id, {
    status: result.ok ? 'sucesso' : 'erro',
    finalizado_em: new Date().toISOString(),
    duration_ms: result.duration_ms,
    output: {
      script: scriptName,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    erro: result.error || null,
  });

  log(`Job ${job.id} finalizado: ${result.ok ? 'sucesso' : 'erro'}`);
  return true;
}

async function main() {
  const mode = process.argv.includes('--loop') ? 'loop' : 'once';
  log(`Iniciando worker em modo ${mode}`);

  if (mode === 'once') {
    await processOne();
    return;
  }

  while (true) {
    try {
      await processOne();
    } catch (error) {
      console.error('[JOB] Erro no worker:', error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error('[JOB] Erro fatal:', error);
  process.exit(1);
});
