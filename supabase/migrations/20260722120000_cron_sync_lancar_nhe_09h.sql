-- sync-lancar-nhe (lançamento automático de NHE por geofence de login, ver
-- agentes-grm-sync/grm-sync-lancar-nhe.js) sai do round-robin de 24h em
-- AGENTES_DIARIOS (que não garante horário fixo, só um intervalo mínimo desde a
-- última execução) e ganha agendamento próprio via pg_cron, igual ao padrão já
-- usado por sync-login-alimentacao. Usuária pediu rodar sempre às 09:00 de
-- Brasília (UTC-3, sem horário de verão desde 2019) = 12:00 UTC.
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
);
