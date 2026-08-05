-- Executa o lançamento automático de NHE todos os dias às 02:00 no horário de
-- Brasília. O pg_cron usa UTC, portanto 02:00 BRT corresponde a 05:00 UTC.
-- Remove o agendamento anterior das 09:00 para impedir duas execuções diárias.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-lancar-nhe-09h') then
    perform cron.unschedule('sync-lancar-nhe-09h');
  end if;
end
$$;

select cron.schedule(
  'sync-lancar-nhe-02h',
  '0 5 * * *',
  $cron$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-lancar-nhe', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-lancar-nhe' AND status IN ('pendente','rodando')
    );
  $cron$
);
