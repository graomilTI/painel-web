select cron.schedule(
  'sync-login-alimentacao-11h',
  '0,15,30,45 14 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-login-alimentacao', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-login-alimentacao' AND status IN ('pendente','rodando')
    );
  $$
);

select cron.schedule(
  'sync-login-alimentacao-12h',
  '0,15,30 15 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-login-alimentacao', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-login-alimentacao' AND status IN ('pendente','rodando')
    );
  $$
);
;
