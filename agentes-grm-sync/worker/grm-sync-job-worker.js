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
  'sync-colaboradores': 'grmserver-colaboradores-sync-historico.js',
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
  'aplicar-distribuicao-os': 'grm-sync-aplicar-distribuicao-os.js',
  'sync-cargas-geofence': 'grm-sync-cargas-geofence.js',
  'sync-btg-relatorios': 'grm-sync-btg-classificador.js',
  'sync-btg-classificador': 'grm-sync-btg-classificador.js',
  'sync-btg-checkin': 'grm-sync-btg-checkin.js',
  'sync-adiantamentos': 'grm-sync-adiantamentos.js',
  'sync-login-alimentacao': 'grm-sync-login-alimentacao.js',
  'sync-lancar-nhe': 'grm-sync-lancar-nhe.js',
  'sync-finalizar-os': 'grm-sync-finalizar-os.js',
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

async function claimNextJob() {
  // RPC atômica (trava via pg_advisory_xact_lock): só retorna um job se não
  // houver NENHUM outro agente 'rodando' no momento, mesmo que a fila tenha
  // sido alimentada por fontes diferentes (auto-scheduler, cron de
  // sync-colaboradores, cron de sync-login-alimentacao). Isso serializa todos
  // os agentes entre si e também evita que dois processos --once concorrentes
  // (cron de 1min disparando antes do anterior terminar) rodem jobs em paralelo.
  const { data, error } = await supabase.rpc('claim_next_grm_sync_job');

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
  const job = await claimNextJob();
  // Quando a função SQL retorna NULL (composite), o PostgREST serializa como
  // objeto com todos os campos null em vez de JSON null puro — por isso o
  // check precisa ser em job.id, não só em job.
  if (!job || !job.id) {
    log('Nenhum job pendente (ou já existe outro agente rodando).');
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
