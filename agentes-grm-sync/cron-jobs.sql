-- DESATUALIZADO (2026-07-03): secret hardcoded abaixo foi exposto em log e
-- 12 dos 13 syncs têm verify_jwt:true (gateway do Supabase rejeita esse
-- bearer custom com 401 antes de chegar na function). Só sync-colaboradores
-- foi migrado pro padrão correto — ver supabase/migrations/20260703140000_cron_sync_colaboradores_job_queue.sql.
-- As outras 12 ainda precisam ser migradas pro padrão job-queue.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule('sync-colaboradores-5min', '*/5 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-colaboradores', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-producao-diaria-hourly', '1 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-producao-diaria', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-locais-embarque-hourly', '2 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-locais-embarque', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-resultado-diario-hourly', '3 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-resultado-diario', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-despesas-hourly', '4 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-despesas', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-notas-fiscais-hourly', '5 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-notas-fiscais', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-mapa-embarque-hourly', '6 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-mapa-embarque', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-patrimonios-hourly', '7 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-patrimonios', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-contas-pagar-hourly', '8 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-contas-pagar', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-contas-receber-hourly', '9 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-contas-receber', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-auditorias-hourly', '10 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-auditorias', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-nhe-hourly', '11 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-nhe', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-lista-os-hourly', '12 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-lista-os', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT cron.schedule('sync-distribuicao-os-hourly', '13 * * * *', $$SELECT net.http_post(url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-distribuicao-os', headers := jsonb_build_object('Authorization', 'Bearer sync-colaboradores-secret-key-123', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$);

SELECT * FROM cron.job;
