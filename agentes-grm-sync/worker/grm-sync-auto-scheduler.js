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

// sync-colaboradores tem agendamento próprio via pg_cron (job "sync-colaboradores-5min",
// a cada 5min, ver migration 20260703140000_cron_sync_colaboradores_job_queue.sql) — não
// entra no round-robin pra não ser escolhido em duplicidade.
const AGENTES_CONTINUOS = [
  'sync-mapa-embarque',
  'sync-nhe',
  'sync-lista-os',
  'sync-operacional-os',
  'sync-distribuicao-os',
  'sync-locais-embarque',
  'sync-auditorias',
  'sync-btg-relatorios',
  'sync-patrimonios',
  'sync-contas-pagar',
  'sync-contas-receber',
  'sync-notas-fiscais',
  'sync-producao-diaria',
  'sync-resultado-diario',
];

const AGENTES_DIARIOS = [
  { agente_id: 'sync-despesas', intervalo_minutos: 60 },
  {
    agente_id: 'sync-cargas-geofence',
    nome: 'Relatório de Cargas - Geofence',
    intervalo_minutos: 60,
    ativo: true,
  },
];

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
  // sync-colaboradores é agendado direto pelo pg_cron (fora deste round-robin) e roda a
  // cada 5min o dia todo — ignorar seus jobs aqui pra não bloquear os outros agentes.
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id,agente_id,status,solicitado_em,iniciado_em,created_at')
    .in('status', ['pendente', 'rodando'])
    .neq('agente_id', 'sync-colaboradores')
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

async function escolherAgenteDiarioVencido() {
  for (const agente of AGENTES_DIARIOS) {
    const ultimo = await ultimoJob(agente.agente_id);
    const referencia = ultimo?.finalizado_em || ultimo?.created_at;
    const minutos = minutosDesde(referencia);

    if (!ultimo || minutos >= agente.intervalo_minutos) {
      return agente.agente_id;
    }

    log(`${agente.agente_id}: último job há ${minutos.toFixed(1)} min, aguardando 24h.`);
  }

  return null;
}

async function escolherAgenteContinuo() {
  const candidatos = [];

  for (const agente_id of AGENTES_CONTINUOS) {
    const ultimo = await ultimoJob(agente_id);
    const referencia = ultimo?.finalizado_em || ultimo?.created_at;
    const minutos = minutosDesde(referencia);

    candidatos.push({
      agente_id,
      minutos,
    });
  }

  candidatos.sort((a, b) => b.minutos - a.minutos);
  return candidatos[0]?.agente_id || null;
}

async function main() {
  log('Iniciando agendador automático');

  const aberto = await existeJobAberto();

  if (aberto) {
    log(`Já existe job ${aberto.status} (${aberto.agente_id}), aguardando terminar.`);
    log('Agendador finalizado');
    return;
  }

  const diario = await escolherAgenteDiarioVencido();
  const proximo = diario || await escolherAgenteContinuo();

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
