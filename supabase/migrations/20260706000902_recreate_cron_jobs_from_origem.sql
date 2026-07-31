
select cron.schedule('sync-bfleet-excesso-velocidade-diario', '10 11 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/sync-bfleet-excesso-velocidade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'pg_cron', 'forceRefreshToken', true, 'rangeTimeVal', 'yesterday'),
    timeout_milliseconds := 120000
  ) as request_id;
$$);

select cron.schedule('limpar-btg-sb-diario', '59 2 * * *', $$DELETE FROM public.logistica_btg_solicitacoes WHERE tipo_solicitacao = 'SB'$$);

select cron.schedule('botconversa-sync-horario', '23 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/botconversa-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('action','start_sync'),
    timeout_milliseconds := 120000
  ) as request_id;
$$);

select cron.schedule('botconversa-aniversario-diario', '7 11 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/botconversa-aniversario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('action','run_now'),
    timeout_milliseconds := 300000
  ) as request_id;
$$);

select cron.schedule('refresh-colaborador-cruzamento-30min', '*/30 * * * *', $$select public.refresh_colaborador_cruzamento()$$);

select cron.schedule('geocode-colaborador-base-2min', '*/2 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/geocode-colaborador-base',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('limite', 25),
    timeout_milliseconds := 60000
  ) as request_id;
$$);

select cron.schedule('geocode-operacional-os-10min', '*/10 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/geocode-operacional-os',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('limite', 25),
    timeout_milliseconds := 60000
  ) as request_id;
$$);

select cron.schedule('sync-colaboradores-5min', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/sync-colaboradores',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_colaboradores_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$$);

select cron.schedule('update-bfleet-condutores-5min', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/update-bfleet-condutores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'pending', 'limit', 100),
    timeout_milliseconds := 60000
  ) as request_id;
$$);
;
