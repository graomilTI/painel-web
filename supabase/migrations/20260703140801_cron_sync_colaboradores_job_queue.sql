create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-colaboradores-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://xyzpnuumdqhegxakkyws.functions.supabase.co/sync-colaboradores',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_colaboradores_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);;
