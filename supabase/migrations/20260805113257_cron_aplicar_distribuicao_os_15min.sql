-- O cartão do painel sempre informou frequência de 15 minutos, porém não
-- existia um agendamento para o agente de escrita no Graint.
select cron.unschedule(jobid)
from cron.job
where jobname = 'aplicar-distribuicao-os-15min';

select cron.schedule(
  'aplicar-distribuicao-os-15min',
  '*/15 * * * *',
  $cron$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'aplicar-distribuicao-os', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'aplicar-distribuicao-os'
        AND status IN ('pendente', 'rodando')
    );
  $cron$
);
