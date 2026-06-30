-- Promoção segura por período para agentes GRM.
-- Mantém histórico fora do intervalo sincronizado e substitui apenas as datas carregadas na staging.

create or replace function public.grm_promover_staging_periodo(
  p_table text,
  p_date_column text,
  p_min_rows bigint default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_table text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot'
  ];
  v_allowed_date_column text[] := array[
    'data',
    'data_referencia'
  ];
  v_staging text := p_table || '_staging';
  v_count bigint;
  v_min_date date;
  v_max_date date;
  v_deleted bigint;
begin
  if not p_table = any(v_allowed_table) then
    raise exception 'Tabela % não autorizada para promoção por período GRM', p_table;
  end if;

  if not p_date_column = any(v_allowed_date_column) then
    raise exception 'Coluna de data % não autorizada para promoção por período GRM', p_date_column;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    raise exception 'Tabela staging public.% não existe', v_staging;
  end if;

  execute format(
    'select count(*), min(%I)::date, max(%I)::date from public.%I',
    p_date_column,
    p_date_column,
    v_staging
  ) into v_count, v_min_date, v_max_date;

  if v_count < coalesce(p_min_rows, 1) then
    raise exception 'Carga staging de % abortada: % linhas, mínimo exigido %', p_table, v_count, p_min_rows;
  end if;

  if v_min_date is null or v_max_date is null then
    raise exception 'Carga staging de % abortada: coluna % sem período válido', p_table, p_date_column;
  end if;

  execute format(
    'delete from public.%I where %I::date between $1 and $2',
    p_table,
    p_date_column
  ) using v_min_date, v_max_date;

  get diagnostics v_deleted = row_count;

  execute format('insert into public.%I select * from public.%I', p_table, v_staging);
  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'date_column', p_date_column,
    'period_start', v_min_date,
    'period_end', v_max_date,
    'deleted_rows', v_deleted,
    'promoted_rows', v_count,
    'action', 'promote_staging_by_period'
  );
end;
$$;

grant execute on function public.grm_promover_staging_periodo(text, text, bigint) to service_role;
