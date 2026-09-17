-- O loop de public.cron_trigger_sync_multas_detran_full() disparava todos os lotes de 25
-- veiculos via net.http_post em sequencia, sem esperar resposta nem intervalo entre eles
-- (fire-and-forget). Em dias com mais lotes isso as vezes estourava o rate limit da API
-- do DETRAN (HTTP 429), perdendo a consulta de multas daquele veiculo no dia.
-- Adiciona um pg_sleep entre os disparos pra espacar as chamadas.
create or replace function public.cron_trigger_sync_multas_detran_full()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_limit integer := 25;
  v_offset integer := 0;
  v_url text;
  v_key text;
  v_delay_seconds numeric := 3;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'cron_trigger_sync_multas_detran_full: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return;
  end if;

  select count(*) into v_total from public.frotas_veiculos where renavam is not null and renavam <> '0';

  while v_offset < v_total loop
    perform net.http_post(
      url := v_url || '/functions/v1/sync-multas-detran',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('mode', 'all', 'offset', v_offset, 'limit', v_limit),
      timeout_milliseconds := 120000
    );
    v_offset := v_offset + v_limit;
    if v_offset < v_total then
      perform pg_sleep(v_delay_seconds);
    end if;
  end loop;
end;
$$;
