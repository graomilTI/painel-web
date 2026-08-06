-- Reagenda o job de lançamento automático de NHE de 02h para 03h de Brasília
-- (06:00 UTC, Brasil sem horário de verão desde 2019). pg_cron nesta versão
-- não suporta renomear via alter_job (sem parâmetro jobname) — recria o job
-- com nome atualizado (mesmo padrão já usado quando o horário mudou de 09h
-- para 02h). Pedido do usuário 06/08/2026.
select cron.unschedule(24);

select cron.schedule(
  'sync-lancar-nhe-03h',
  '0 6 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-lancar-nhe', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-lancar-nhe' AND status IN ('pendente','rodando')
    );
  $$
);;
