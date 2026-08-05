-- Colaboradores e Lista de OS passam a ter cadência própria de 30 minutos.
-- A cláusula NOT EXISTS evita acumular execuções quando o worker estiver ocupado.

select cron.unschedule(jobid)
from cron.job
where jobname in ('sync-colaboradores-5min', 'sync-colaboradores-30min');

select cron.schedule(
  'sync-colaboradores-30min',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/sync-colaboradores',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sync_colaboradores_secret'
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-lista-os-30min';

select cron.schedule(
  'sync-lista-os-30min',
  '*/30 * * * *',
  $cron$
    insert into public.grm_sync_jobs (agente_id, status)
    select 'sync-lista-os', 'pendente'
    where not exists (
      select 1
      from public.grm_sync_jobs
      where agente_id = 'sync-lista-os'
        and status in ('pendente', 'rodando')
    );
  $cron$
);
