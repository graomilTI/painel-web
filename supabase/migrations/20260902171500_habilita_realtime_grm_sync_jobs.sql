-- Habilita Realtime (postgres_changes) na tabela grm_sync_jobs, necessário
-- pro disparo imediato do agente aplicar-distribuicao-os (ver
-- agentes-grm-sync/aplicar-distribuicao-os-realtime/index.js) reagir a
-- INSERTs sem precisar esperar o polling do cron (até 1min).
alter publication supabase_realtime add table public.grm_sync_jobs;
