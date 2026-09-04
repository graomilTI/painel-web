#!/usr/bin/env node

const laneArg = process.argv.find((arg) => arg.startsWith('--lane='));
const workerArg = process.argv.find((arg) => arg.startsWith('--worker-id='));
const WORKER_LANE = laneArg ? laneArg.split('=')[1] : (process.env.GRM_SYNC_WORKER_LANE || 'fixed');
const WORKER_ID = workerArg ? workerArg.split('=')[1] : (process.env.GRM_SYNC_WORKER_ID || `${WORKER_LANE}-${process.pid}`);
const WORKER_RUNTIME = `/home/grao100/chrome-runtime/${WORKER_ID}`;

// Ambiente isolado por worker para Chromium/Puppeteer no cPanel.
// Evita erro de partition_address_space e permission denied em /home/grao100/tmp.
process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = `${WORKER_RUNTIME}/tmp`;
process.env.TEMP = `${WORKER_RUNTIME}/tmp`;
process.env.TMPDIR = `${WORKER_RUNTIME}/tmp`;
process.env.XDG_RUNTIME_DIR = `${WORKER_RUNTIME}/tmp`;
process.env.XDG_CACHE_HOME = `${WORKER_RUNTIME}/cache`;
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
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODE_BIN = process.env.GRM_SYNC_NODE_BIN || '/home/grao100/bin/node';
const SAFE_TMP = process.env.GRM_SYNC_TMPDIR || `${WORKER_RUNTIME}/tmp`;
const POLL_MS = Number(process.env.GRM_SYNC_JOB_POLL_MS || 15000);
const MAX_OUTPUT = 30000;

fs.mkdirSync(`${WORKER_RUNTIME}/tmp`, { recursive: true });
fs.mkdirSync(`${WORKER_RUNTIME}/cache`, { recursive: true });

const SCRIPT_MAP = {
  'sync-colaboradores': 'grmserver-colaboradores-sync-snapshot.js',
  'sync-producao-diaria': 'grm-sync-producao-diaria.js',
  'sync-locais-embarque': 'grm-sync-locais-embarque.js',
  'sync-resultado-diario': 'grm-sync-resultado-diario.js',
  'sync-despesas': 'grm-sync-despesas.js',
  'sync-notas-fiscais': 'grm-sync-notas-fiscais.js',
  'sync-mapa-embarque': 'grm-sync-mapa-embarque.js',
  // Migrado pra API direta em 04/09 (patrimonies/getRecords, ver comentário no
  // topo de grmserver-patrimonios-api.js). grm-sync-patrimonios.js (Puppeteer)
  // mantido no disco pra rollback.
  'sync-patrimonios': 'grmserver-patrimonios-api.js',
  'sync-contas-pagar': 'grm-sync-contas-pagar.js',
  'sync-contas-receber': 'grm-sync-contas-receber.js',
  'sync-auditorias': 'grm-sync-auditorias.js',
  'sync-nhe': 'grm-sync-nhe.js',
  'sync-lista-os': 'grm-sync-lista-os.js',
  'sync-operacional-os': 'grm-sync-operacional-os.js',
  'sync-distribuicao-os': 'grm-sync-distribuicao-os.js',
  // Migrado pra API direta em 01/09 (ver memória painel-web-distribuicao-os-api-investigacao).
  // grm-sync-aplicar-distribuicao-os.js (Puppeteer) mantido no disco pra rollback.
  'aplicar-distribuicao-os': 'grmserver-aplicar-distribuicao-os-api.js',
  // Exclusivo do cron das 02h (novo dia): limpa e redistribui em seguida,
  // supervisão por supervisão, só as pendências de "novo dia" — força o Graint
  // a registrar a virada do dia mesmo quando a distribuição de hoje é idêntica
  // à de ontem. Mesmo script do agente acima, só liga a flag RESET_DIA.
  'aplicar-distribuicao-os-reset-dia': 'grmserver-aplicar-distribuicao-os-reset-dia.js',
  'sync-cargas-geofence': 'grm-sync-cargas-geofence.js',
  'sync-btg-relatorios': 'grm-sync-btg-classificador.js',
  'sync-btg-classificador': 'grm-sync-btg-classificador.js',
  'sync-btg-checkin': 'grm-sync-btg-checkin.js',
  'sync-adiantamentos': 'grm-sync-adiantamentos.js',
  'sync-login-alimentacao': 'grm-sync-login-alimentacao.js',
  'sync-lancar-nhe': 'grm-sync-lancar-nhe.js',
  // Migrado pra API direta em 04/09 (payInvoice/setRecord, ver comentário no
  // topo de grmserver-lancar-notas-fiscais-api.js) — validado com um
  // lançamento real de teste (código GRM 118857) antes do deploy.
  // grm-sync-lancar-notas-fiscais.js (Puppeteer) mantido no disco pra
  // rollback. Essa entrada tinha sumido do SCRIPT_MAP (drift não commitado
  // entre 08/08 e 10/08) — é por isso que o agente não rodava mais.
  'sync-lancar-notas-fiscais': 'grmserver-lancar-notas-fiscais-api.js',
  'sync-finalizar-os': 'grm-sync-finalizar-os.js',
  'sync-reabrir-os': 'grm-sync-reabrir-os.js',
  'sync-abrir-os': 'grm-sync-abrir-os.js',
  // Migrado pra API direta em 02/09 (ver memória painel-web-grm-liberacao-despesas-api-descoberta).
  // grm-sync-liberacao-despesas.js (Puppeteer) mantido no disco pra rollback.
  'sync-liberacao-despesas': 'grmserver-liberacao-despesas-api.js',
  'sync-bonus-caixa': 'grm-sync-bonus-caixa.js',
  'sync-despesas-retroativas': 'grm-sync-despesas-retroativas.js',
  'botconversa-sync': 'grm-sync-botconversa.js',
  'sync-classificacao-ourosafra': 'grm-sync-classificacao-ourosafra.js',
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
  const { data, error } = await supabase.rpc('claim_next_grm_sync_job', {
    p_lane: WORKER_LANE,
    p_worker_id: WORKER_ID,
  });

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

async function enqueueNextFixedAgent(job) {
  if (!String(job.lane || '').startsWith('fixed_') || job.pipeline_seq == null) return;
  const { data, error } = await supabase.rpc('enqueue_next_grm_fixed_job');
  if (error) throw error;
  log(`${data?.agente_id || 'próximo agente fixo'}: sequência ${data?.pipeline_seq || '?'} enfileirada.`);
}

function startHeartbeat(jobId) {
  const renew = async () => {
    const now = new Date();
    const lease = new Date(now.getTime() + 10 * 60 * 1000);
    const { error } = await supabase.from('grm_sync_jobs').update({
      heartbeat_at: now.toISOString(),
      lease_expires_at: lease.toISOString(),
    }).eq('id', jobId).eq('status', 'rodando').eq('worker_id', WORKER_ID);
    if (error) log(`Heartbeat de ${jobId} falhou: ${error.message}`);
  };
  const timer = setInterval(() => renew().catch((error) => log(`Heartbeat falhou: ${error.message}`)), 60_000);
  return () => clearInterval(timer);
}

function runScript(scriptName, jobId) {
  return new Promise((resolve) => {
    const scriptPath = path.join(PROJECT_ROOT, scriptName);
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let memoryPeakMb = 0;
    let lastReportedMemoryMb = 0;
    let vpsMemoryPeakMb = 0;
    let vpsMemoryTotalMb = 0;
    let vpsDiskUsedMb = 0;
    let vpsDiskTotalMb = 0;
    let lastReportedVpsMemoryMb = 0;

    log(`Executando ${scriptName}`);

    const child = spawn(NODE_BIN, [scriptPath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        HOME: process.env.HOME || '/home/grao100',
        TMP: `${WORKER_RUNTIME}/tmp`,
        TEMP: `${WORKER_RUNTIME}/tmp`,
        TMPDIR: `${WORKER_RUNTIME}/tmp`,
        XDG_RUNTIME_DIR: `${WORKER_RUNTIME}/tmp`,
        XDG_CACHE_HOME: `${WORKER_RUNTIME}/cache`,
        MALLOC_ARENA_MAX: '2',
      },
      shell: false,
    });

    // Soma o RSS do processo do agente e de toda a árvore Chromium/Puppeteer.
    // A leitura é leve (a cada 5s) e falhas de telemetria não interrompem o job.
    const sampleMemory = () => {
      if (!child.pid) return;
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const values = Object.fromEntries([...meminfo.matchAll(/^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/gm)].map((match) => [match[1], Number(match[2])]));
        if (values.MemTotal && values.MemAvailable != null) {
          vpsMemoryTotalMb = values.MemTotal / 1024;
          vpsMemoryPeakMb = Math.max(vpsMemoryPeakMb, (values.MemTotal - values.MemAvailable) / 1024);
        }
      } catch (_) {
        // /proc pode não existir fora do Linux; a memória da árvore continua sendo coletada.
      }
      execFile('df', ['-Pk', PROJECT_ROOT], { timeout: 1500 }, (error, output) => {
        if (error) return;
        const columns = String(output || '').trim().split('\n').at(-1)?.trim().split(/\s+/) || [];
        if (columns.length >= 4) {
          vpsDiskTotalMb = Number(columns[1] || 0) / 1024;
          vpsDiskUsedMb = Number(columns[2] || 0) / 1024;
        }
      });
      execFile('ps', ['-eo', 'pid=,ppid=,rss='], { timeout: 1500 }, (error, output) => {
        if (error) return;
        const rows = String(output || '').trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
        const children = new Map();
        const rssByPid = new Map();
        rows.forEach(([pid, ppid, rss]) => {
          rssByPid.set(pid, rss || 0);
          if (!children.has(ppid)) children.set(ppid, []);
          children.get(ppid).push(pid);
        });
        const stack = [child.pid];
        const seen = new Set();
        let rssKb = 0;
        while (stack.length) {
          const pid = stack.pop();
          if (seen.has(pid)) continue;
          seen.add(pid);
          rssKb += rssByPid.get(pid) || 0;
          stack.push(...(children.get(pid) || []));
        }
        memoryPeakMb = Math.max(memoryPeakMb, rssKb / 1024);
        if (memoryPeakMb >= lastReportedMemoryMb + 5 || vpsMemoryPeakMb >= lastReportedVpsMemoryMb + 25) {
          lastReportedMemoryMb = memoryPeakMb;
          lastReportedVpsMemoryMb = vpsMemoryPeakMb;
          updateJob(jobId, {
            memory_peak_mb: Number(memoryPeakMb.toFixed(2)),
            vps_memory_peak_mb: Number(vpsMemoryPeakMb.toFixed(2)) || null,
            vps_memory_total_mb: Number(vpsMemoryTotalMb.toFixed(2)) || null,
            vps_disk_used_mb: Number(vpsDiskUsedMb.toFixed(2)) || null,
            vps_disk_total_mb: Number(vpsDiskTotalMb.toFixed(2)) || null,
          })
            .catch((updateError) => log(`Falha ao atualizar memória do job ${jobId}: ${updateError.message}`));
        }
      });
    };
    sampleMemory();
    const memoryTimer = setInterval(sampleMemory, 5000);

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
      clearInterval(memoryTimer);
      resolve({
        ok: false,
        code: -1,
        duration_ms: Date.now() - started,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        error: error.message,
        memory_peak_mb: Number(memoryPeakMb.toFixed(2)) || null,
        vps_memory_peak_mb: Number(vpsMemoryPeakMb.toFixed(2)) || null,
        vps_memory_total_mb: Number(vpsMemoryTotalMb.toFixed(2)) || null,
        vps_disk_used_mb: Number(vpsDiskUsedMb.toFixed(2)) || null,
        vps_disk_total_mb: Number(vpsDiskTotalMb.toFixed(2)) || null,
      });
    });

    child.on('close', (code) => {
      clearInterval(memoryTimer);
      resolve({
        ok: code === 0,
        code,
        duration_ms: Date.now() - started,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        error: code === 0 ? null : `Script saiu com código ${code}`,
        memory_peak_mb: Number(memoryPeakMb.toFixed(2)) || null,
        vps_memory_peak_mb: Number(vpsMemoryPeakMb.toFixed(2)) || null,
        vps_memory_total_mb: Number(vpsMemoryTotalMb.toFixed(2)) || null,
        vps_disk_used_mb: Number(vpsDiskUsedMb.toFixed(2)) || null,
        vps_disk_total_mb: Number(vpsDiskTotalMb.toFixed(2)) || null,
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

  const stopHeartbeat = startHeartbeat(job.id);
  const result = await runScript(scriptName, job.id);
  stopHeartbeat();

  await updateJob(job.id, {
    status: result.ok ? 'sucesso' : 'erro',
    finalizado_em: new Date().toISOString(),
    duration_ms: result.duration_ms,
    memory_peak_mb: result.memory_peak_mb,
    vps_memory_peak_mb: result.vps_memory_peak_mb,
    vps_memory_total_mb: result.vps_memory_total_mb,
    vps_disk_used_mb: result.vps_disk_used_mb,
    vps_disk_total_mb: result.vps_disk_total_mb,
    output: {
      script: scriptName,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    erro: result.error || null,
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: null,
  });

  log(`Job ${job.id} finalizado: ${result.ok ? 'sucesso' : 'erro'}`);
  await enqueueNextFixedAgent(job);
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