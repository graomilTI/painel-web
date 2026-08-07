-- Sincroniza os dois relatórios de notificação às 04:00 em Brasília.
-- O pg_cron opera em UTC; em agosto, America/Sao_Paulo = UTC-3.

select cron.unschedule('sync-bfleet-excesso-velocidade-diario')
where exists (select 1 from cron.job where jobname = 'sync-bfleet-excesso-velocidade-diario');

select cron.unschedule('sync-bfleet-fora-horario-diario')
where exists (select 1 from cron.job where jobname = 'sync-bfleet-fora-horario-diario');

select cron.schedule(
  'sync-bfleet-excesso-velocidade-diario',
  '0 7 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/sync-bfleet-excesso-velocidade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'source', 'pg_cron',
      'forceRefreshToken', true,
      'preferWebReport', true,
      'rangeTimeVal', 'yesterday'
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'sync-bfleet-fora-horario-diario',
  '0 7 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/sync-bfleet-fora-horario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object(
      'scheduled', true,
      'source', 'pg_cron',
      'preferWebReport', true,
      'rangeTimeVal', 'yesterday'
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
