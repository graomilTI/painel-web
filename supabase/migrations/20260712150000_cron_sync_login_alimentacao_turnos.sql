-- sync-login-alimentacao agora classifica 3 turnos (Café/Almoço/Janta, ver TURNOS no
-- script). Faltavam os agendamentos de Café (06:00-07:30) e Janta (19:00-20:30) — Almoço
-- (11:00-12:30) já tinha sido criado na migration 20260712140000. Banco em UTC, Brasília =
-- UTC-3: Café 06:00-07:30 BRT = 09:00-10:30 UTC; Janta 19:00-20:30 BRT = 22:00-23:30 UTC.
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
