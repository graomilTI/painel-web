-- Reagenda o cron de sync-colaboradores (padrão job-queue: a Edge Function só
-- enfileira em grm_sync_jobs; o worker Node/Puppeteer em agentes-grm-sync processa).
-- Auth via Supabase Vault (secret 'sync_colaboradores_secret'), não mais hardcoded.
-- Requer: secret 'sync_colaboradores_secret' criado no Vault e FUNCTION_SECRET
-- com o mesmo valor configurado nas Edge Function Secrets do projeto.

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
);
