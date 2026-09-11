-- Processa mensagens duraveis, lembretes de checkout e cobrancas de NFS-e.
-- O worker usa America/Sao_Paulo internamente para respeitar 20h e 07h.
select cron.unschedule('hospedagem-fluxo-v3-10min')
where exists(select 1 from cron.job where jobname='hospedagem-fluxo-v3-10min');

select cron.schedule(
  'hospedagem-fluxo-v3-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' limit 1) || '/functions/v1/hospedagem-fluxo-v3',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key' limit 1),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='service_role_key' limit 1)
    ),
    body := '{"scheduled":true,"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
