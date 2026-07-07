-- Agenda o sync de Multas (DETRAN) para rodar 1x/dia, paginando por toda a frota.
-- A Edge Function sync-multas-detran processa no máximo 25 veículos por chamada
-- (limite interno), então uma única chamada de cron não cobre a frota inteira
-- (hoje 253 veículos com renavam). Esta função dispara uma página por vez até
-- cobrir o total atual de veículos, recalculado a cada execução.
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
  end loop;
end;
$$;

select cron.unschedule('sync-detran-multas-diario') where exists (select 1 from cron.job where jobname = 'sync-detran-multas-diario');

-- 06h20 Brasília (09h20 UTC) — logo após o sync diário de veículos (sync-veiculos-detran, 06h UTC),
-- pra garantir que placa/renavam já estejam atualizados antes de consultar as multas.
select cron.schedule(
  'sync-detran-multas-diario',
  '20 9 * * *',
  $$select public.cron_trigger_sync_multas_detran_full()$$
);
