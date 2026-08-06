-- Permite que o worker de sync de patrimônios (grm-sync-patrimonios.js, roda com a
-- service_role_key, sem sessão de usuário) chame sincronizar_frotas_veiculos_patrimonios()
-- automaticamente logo após cada leitura de patrimônio, sem depender de alguém abrir o
-- painel e clicar em "Associar Patrimônios".
create or replace function public.sincronizar_frotas_veiculos_patrimonios()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*)
    into v_total_snapshot
    from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object(
      'veiculos_atualizados', 0,
      'patrimonios_processados', 0
    );
  end if;

  update public.frotas_veiculos
     set patrimonio_codigo = null,
         patrimonio_ultima_leitura = null,
         patrimonio_dias_sem_leitura = null,
         patrimonio_funcionario = null,
         patrimonio_coordenacao = null,
         patrimonio_supervisao = null
   where patrimonio_codigo is not null
      or patrimonio_ultima_leitura is not null
      or patrimonio_dias_sem_leitura is not null
      or patrimonio_funcionario is not null
      or patrimonio_coordenacao is not null
      or patrimonio_supervisao is not null;

  with candidatos as (
    select
      p.*,
      regexp_replace(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        ),
        '[^A-Z0-9]',
        '',
        'g'
      ) as placa_normalizada
    from public.patrimonios_snapshot p
  ),
  patrimonio_mais_recente as (
    select distinct on (placa_normalizada)
      placa_normalizada,
      patrimonio_codigo,
      ultima_leitura,
      dias_sem_leitura,
      funcionario,
      coordenacao,
      supervisao
    from candidatos
    where length(placa_normalizada) = 7
    order by
      placa_normalizada,
      data_upload desc nulls last,
      ultima_leitura desc nulls last
  ),
  atualizados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = p.patrimonio_codigo,
           patrimonio_ultima_leitura = p.ultima_leitura,
           patrimonio_dias_sem_leitura = p.dias_sem_leitura,
           patrimonio_funcionario = p.funcionario,
           patrimonio_coordenacao = p.coordenacao,
           patrimonio_supervisao = p.supervisao,
           motorista_atual = coalesce(nullif(trim(p.funcionario), ''), v.motorista_atual),
           coordenacao = coalesce(nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(p.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*)
    into v_total_atualizados
    from atualizados;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$$;
revoke all on function public.sincronizar_frotas_veiculos_patrimonios() from public;
grant execute on function public.sincronizar_frotas_veiculos_patrimonios() to authenticated, service_role;
-- Cron de segurança: drena a fila frotas_bfleet_condutores_fila (alimentada pelo trigger
-- trg_enqueue_bfleet_condutor_update sempre que motorista_atual muda) a cada 5 minutos,
-- garantindo que o motorista chegue no BFleet mesmo se o disparo imediato do worker de
-- patrimônios falhar ou a fila acumular por outro motivo (edição manual, DETRAN, etc.).
select cron.unschedule('update-bfleet-condutores-5min')
 where exists (select 1 from cron.job where jobname = 'update-bfleet-condutores-5min');
select cron.schedule(
  'update-bfleet-condutores-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/update-bfleet-condutores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'pending', 'limit', 100),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
