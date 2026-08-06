select cron.schedule(
  'sync-veiculos-detran-diario',
  '5 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/sync-veiculos-detran',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'all', 'origem', 'cron'),
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'sync-bfleet-veiculos-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/sync-bfleet-veiculos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'sync', 'origem', 'cron'),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);;
