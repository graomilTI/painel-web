-- Pausa o agente de saída sem interromper uma execução já iniciada.
-- O histórico permanece disponível e somente trabalhos ainda pendentes são removidos.
select cron.unschedule(jobid)
from cron.job
where jobname = 'aplicar-distribuicao-os-15min';

delete from public.grm_sync_jobs
where agente_id = 'aplicar-distribuicao-os'
  and status = 'pendente';
