select cron.schedule(
  'sync-lancar-nhe-09h',
  '0 12 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-lancar-nhe', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-lancar-nhe' AND status IN ('pendente','rodando')
    );
  $$
);;
