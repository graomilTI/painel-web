#!/usr/bin/env node

/**
 * Disparo imediato do agente aplicar-distribuicao-os: escuta INSERT em
 * grm_sync_jobs (agente_id='aplicar-distribuicao-os') via Supabase Realtime e,
 * assim que um job 'pendente' aparece, roda o job-worker na hora — em vez de
 * esperar o próximo ciclo do cron (até 1min, lane saida_logistica).
 *
 * Não duplica lógica nenhuma: só chama o mesmo
 * `worker/grm-sync-job-worker.js --once --lane=saida_logistica`, que já claima
 * o job via RPC atômica (claim_next_grm_sync_job) — seguro rodar em paralelo
 * com o cron da lane (que continua ativo como rede de segurança caso essa
 * conexão realtime caia).
 *
 * Processo persistente (systemd, ver grm-aplicar-distribuicao-os-realtime.service),
 * mesmo padrão dos outros agentes *-realtime deste diretório.
 *
 * Dependências isoladas (node_modules deste subdiretório, ver package.json):
 * o @supabase/supabase-js 2.39.x compartilhado por agentes-grm-sync não fala
 * Realtime com o formato novo de chave (sb_secret_...) — trava em TIMED_OUT.
 * 2.114+ resolve. Isolado aqui pra não mexer na dependência dos outros agentes.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { execFile } = require('child_process');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODE_BIN = process.env.GRM_SYNC_NODE_BIN || '/opt/node22/bin/node';
const LANE = 'saida_logistica';
const AGENTE_ID = 'aplicar-distribuicao-os';
const DEBOUNCE_MS = Number(process.env.APLICAR_DISTRIBUICAO_DEBOUNCE_MS || 2000);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } },
);

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

let disparoEmAndamento = false;
let disparoPendenteDeNovo = false;
let debounceTimer = null;

function rodarWorkerAgora() {
  if (disparoEmAndamento) {
    disparoPendenteDeNovo = true;
    return;
  }
  disparoEmAndamento = true;
  const args = ['worker/grm-sync-job-worker.js', '--once', `--lane=${LANE}`, '--worker-id=realtime-trigger'];
  log('INFO', `Disparando job-worker (${args.join(' ')})...`);
  execFile(NODE_BIN, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: process.env.HOME || '/home/grao100',
      GRM_SYNC_NODE_BIN: NODE_BIN,
    },
    maxBuffer: 10 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    disparoEmAndamento = false;
    if (error) log('ERROR', `job-worker saiu com erro: ${error.message}`);
    if (stderr && stderr.trim()) log('WARN', `stderr: ${stderr.trim().slice(0, 2000)}`);
    if (stdout && stdout.trim()) log('INFO', `stdout: ${stdout.trim().slice(-2000)}`);
    if (disparoPendenteDeNovo) {
      disparoPendenteDeNovo = false;
      rodarWorkerAgora();
    }
  });
}

function agendarDisparo(motivo) {
  log('INFO', `Job pendente detectado (${motivo}) — agendando disparo em ${DEBOUNCE_MS}ms.`);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    rodarWorkerAgora();
  }, DEBOUNCE_MS);
}

function main() {
  log('INFO', `Agente realtime iniciado; escutando grm_sync_jobs (agente_id=${AGENTE_ID}).`);

  const channel = supabase
    .channel('aplicar-distribuicao-os-jobs')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'grm_sync_jobs', filter: `agente_id=eq.${AGENTE_ID}` },
      (payload) => {
        if (payload?.new?.status === 'pendente') agendarDisparo(`insert id=${payload.new.id}`);
      },
    )
    .subscribe((status) => {
      log('INFO', `Status da subscription: ${status}`);
    });

  // Ao subir, pode já existir um job pendente (deploy/restart no meio do dia) —
  // confere uma vez pra não ficar esperando o próximo INSERT à toa.
  supabase
    .from('grm_sync_jobs')
    .select('id')
    .eq('agente_id', AGENTE_ID)
    .eq('status', 'pendente')
    .limit(1)
    .then(({ data, error }) => {
      if (error) { log('WARN', `Falha ao checar pendências no boot: ${error.message}`); return; }
      if (data && data.length) agendarDisparo('pendência já existente no boot');
    });

  process.on('SIGTERM', () => { channel.unsubscribe(); process.exit(0); });
  process.on('SIGINT', () => { channel.unsubscribe(); process.exit(0); });
}

main();
