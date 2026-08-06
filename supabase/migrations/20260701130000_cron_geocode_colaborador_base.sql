-- Agenda a geocodificação automática de operacional_colaborador_base (ver
-- geocode-colaborador-base). Roda a cada 2 min, até 25 chaves novas por
-- execução (respeita o limite de 1 req/s do Nominatim); some sozinho quando
-- não houver mais pendência (função retorna rápido sem custo de rede).
select cron.unschedule('geocode-colaborador-base') where exists (select 1 from cron.job where jobname = 'geocode-colaborador-base');
select cron.schedule(
  'geocode-colaborador-base',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/geocode-colaborador-base',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('limite', 25),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
