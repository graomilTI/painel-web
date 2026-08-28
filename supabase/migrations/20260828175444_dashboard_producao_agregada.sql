create index if not exists producao_snapshot_data_coordenacao_idx
  on public.producao_snapshot (data, coordenacao)
  include (tons);

create or replace function public.dashboard_producao_agregada(
  p_data_ini date,
  p_data_fim date,
  p_coordenacao text default null
)
returns table (
  data date,
  coordenacao text,
  tons numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    ps.data,
    ps.coordenacao,
    sum(coalesce(ps.tons, 0))::numeric as tons
  from public.producao_snapshot as ps
  where ps.data >= p_data_ini
    and ps.data < p_data_fim
    and (p_coordenacao is null or ps.coordenacao = p_coordenacao)
  group by ps.data, ps.coordenacao
  order by ps.data, ps.coordenacao;
$function$;

revoke execute on function public.dashboard_producao_agregada(date, date, text) from public, anon;
grant execute on function public.dashboard_producao_agregada(date, date, text) to authenticated;

create or replace function public.substituir_producao_snapshot_periodo(
  p_data_ini date,
  p_data_fim date,
  p_linhas jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_total integer;
begin
  if p_data_ini is null or p_data_fim is null or p_data_fim < p_data_ini then
    raise exception 'Período de produção inválido';
  end if;

  if pg_catalog.jsonb_typeof(p_linhas) <> 'array' or pg_catalog.jsonb_array_length(p_linhas) < 1000 then
    raise exception 'Lote de produção inválido ou incompleto';
  end if;

  -- Serializa substituições concorrentes e mantém delete + insert na mesma
  -- transação, impedindo o dashboard de enxergar e armazenar um mês parcial.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('producao_snapshot_periodo'));

  delete from public.producao_snapshot
  where data >= p_data_ini and data <= p_data_fim;

  insert into public.producao_snapshot (
    data_referencia, coordenacao, supervisao, funcionario, tipo, data, os,
    cliente, servico, cidade, local_embarque, checkin, checkout, cargas, tons
  )
  select
    x.data_referencia, x.coordenacao, x.supervisao, x.funcionario, x.tipo,
    x.data, x.os, x.cliente, x.servico, x.cidade, x.local_embarque, x.checkin,
    x.checkout, x.cargas, x.tons
  from pg_catalog.jsonb_to_recordset(p_linhas) as x(
    data_referencia date,
    coordenacao text,
    supervisao text,
    funcionario text,
    tipo text,
    data date,
    os text,
    cliente text,
    servico text,
    cidade text,
    local_embarque text,
    checkin text,
    checkout text,
    cargas numeric,
    tons numeric
  )
  where x.data between p_data_ini and p_data_fim;

  get diagnostics v_total = row_count;
  if v_total < 1000 then
    raise exception 'Substituição de produção resultou em lote incompleto (% linhas)', v_total;
  end if;

  return v_total;
end;
$function$;

revoke execute on function public.substituir_producao_snapshot_periodo(date, date, jsonb) from public, anon;
grant execute on function public.substituir_producao_snapshot_periodo(date, date, jsonb) to authenticated;
