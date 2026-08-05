#!/usr/bin/env node

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.SB_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SB_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
const AGENTES_FIXOS = require('./grm-sync-fixed-agents');

// sync-login-alimentacao também saiu daqui: precisa rodar várias vezes SÓ entre 11h-12h30
// (jobs "sync-login-alimentacao-11h"/"-12h", ver migration
// 20260712140000_cron_sync_login_alimentacao_janela.sql) pra capturar login tardio do
// colaborador antes do fechamento da janela de elegibilidade — o round-robin de 60min
// roda em qualquer horário do dia, o que não serve pra esse caso.

// Nenhum dos 14 agentes historicamente passa de ~10min rodando; acima disso é job travado (processo morto sem atualizar status).
const TIMEOUT_JOB_TRAVADO_MIN = 20;

function log(msg) {
  console.log(`[SCHEDULER] ${new Date().toISOString()} - ${msg}`);
}

function minutosDesde(dataIso) {
  if (!dataIso) return Infinity;
  return (Date.now() - new Date(dataIso).getTime()) / 60000;
}

async function liberarJobTravado(job) {
  log(`${job.agente_id}: job ${job.status} há ${job.minutos.toFixed(1)} min (> ${TIMEOUT_JOB_TRAVADO_MIN}min) sem finalizar — marcando como erro para liberar a fila.`);

  const { error } = await supabase
    .from('grm_sync_jobs')
    .update({
      status: 'erro',
      finalizado_em: new Date().toISOString(),
      erro: `Job travado em '${job.status}' por mais de ${TIMEOUT_JOB_TRAVADO_MIN}min sem atualizar status — finalizado automaticamente pelo agendador.`,
    })
    .eq('id', job.id);

  if (error) throw error;
}

async function existeJobAberto() {
  // Somente sync-login-alimentacao fica fora da esteira fixa: ele roda em
  // janelas próprias e não deve impedir a recuperação/continuidade da fila.
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id,agente_id,status,solicitado_em,iniciado_em,created_at')
    .in('status', ['pendente', 'rodando'])
    .neq('agente_id', 'sync-login-alimentacao')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!data || !data.length) return null;

  const job = data[0];
  const referencia = job.status === 'rodando' ? job.iniciado_em : job.solicitado_em || job.created_at;
  const minutos = minutosDesde(referencia);

  if (minutos > TIMEOUT_JOB_TRAVADO_MIN) {
    await liberarJobTravado({ ...job, minutos });
    return null;
  }

  return job;
}

async function ultimoJob(agente_id) {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id,agente_id,status,created_at,finalizado_em')
    .eq('agente_id', agente_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function criarJob(agente_id) {
  const { error } = await supabase
    .from('grm_sync_jobs')
    .insert({
      agente_id,
      status: 'pendente',
    });

  if (error) throw error;
}

async function escolherProximoAgenteFixo() {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('agente_id,finalizado_em,created_at')
    .in('agente_id', AGENTES_FIXOS)
    .in('status', ['sucesso', 'erro'])
    .order('finalizado_em', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return AGENTES_FIXOS[0];
  const index = AGENTES_FIXOS.indexOf(data.agente_id);
  return AGENTES_FIXOS[(index + 1) % AGENTES_FIXOS.length];
}

async function main() {
  log('Iniciando agendador automático');

  const aberto = await existeJobAberto();

  if (aberto) {
    log(`Já existe job ${aberto.status} (${aberto.agente_id}), aguardando terminar.`);
    log('Agendador finalizado');
    return;
  }

  const proximo = await escolherProximoAgenteFixo();

  if (!proximo) {
    log('Nenhum agente disponível para executar.');
    log('Agendador finalizado');
    return;
  }

  await criarJob(proximo);
  log(`${proximo}: job automático criado.`);
  log('Agendador finalizado');
}

main().catch((error) => {
  console.error('[SCHEDULER] Erro fatal:', error);
  process.exit(1);
});
