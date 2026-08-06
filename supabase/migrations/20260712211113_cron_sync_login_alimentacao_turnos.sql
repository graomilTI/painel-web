select cron.schedule(
  'sync-login-alimentacao-06h',
  '0,15,30,45 9 * * *',
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
  'sync-login-alimentacao-07h',
  '0,15,30 10 * * *',
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
  'sync-login-alimentacao-19h',
  '0,15,30,45 22 * * *',
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
  'sync-login-alimentacao-20h',
  '0,15,30 23 * * *',
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
