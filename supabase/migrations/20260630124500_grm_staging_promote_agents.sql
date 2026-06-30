-- Staging seguro para agentes GRM.
-- Objetivo: impedir que o painel veja tabelas finais vazias ou parciais durante uma sincronização.
-- Fluxo recomendado nos agentes:
--   1) select public.grm_limpar_staging('nome_tabela_final');
--   2) inserir os dados em public.nome_tabela_final_staging;
--   3) select public.grm_promover_staging('nome_tabela_final', minimo_de_linhas);

create or replace function public.grm_create_staging_table(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para staging GRM', p_table;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    execute format(
      'create table public.%I (like public.%I including defaults including generated including identity)',
      v_staging,
      p_table
    );
  end if;

  execute format('alter table public.%I enable row level security', v_staging);
end;
$$;

select public.grm_create_staging_table('relatorio_resultado_diario')
where to_regclass('public.relatorio_resultado_diario') is not null;

select public.grm_create_staging_table('producao_snapshot')
where to_regclass('public.producao_snapshot') is not null;

select public.grm_create_staging_table('colaborador_cruzamento')
where to_regclass('public.colaborador_cruzamento') is not null;

select public.grm_create_staging_table('logistica_btg_solicitacoes')
where to_regclass('public.logistica_btg_solicitacoes') is not null;

create or replace function public.grm_limpar_staging(p_table text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para staging GRM', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    perform public.grm_create_staging_table(p_table);
  end if;

  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'staging_table', v_staging,
    'action', 'truncate_staging'
  );
end;
$$;

create or replace function public.grm_promover_staging(p_table text, p_min_rows bigint default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
  v_count bigint;
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para promoção GRM', p_table;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    raise exception 'Tabela staging public.% não existe', v_staging;
  end if;

  execute format('select count(*) from public.%I', v_staging) into v_count;

  if v_count < coalesce(p_min_rows, 1) then
    raise exception 'Carga staging de % abortada: % linhas, mínimo exigido %', p_table, v_count, p_min_rows;
  end if;

  execute format('truncate table public.%I', p_table);
  execute format('insert into public.%I select * from public.%I', p_table, v_staging);
  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'promoted_rows', v_count,
    'action', 'promote_staging'
  );
end;
$$;

create or replace function public.grm_staging_status()
returns table (
  tabela text,
  tabela_final_existe boolean,
  tabela_staging_existe boolean,
  linhas_final bigint,
  linhas_staging bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_final_count bigint;
  v_staging_count bigint;
begin
  foreach v_table in array array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ] loop
    v_final_count := null;
    v_staging_count := null;

    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('select count(*) from public.%I', v_table) into v_final_count;
    end if;

    if to_regclass(format('public.%I', v_table || '_staging')) is not null then
      execute format('select count(*) from public.%I', v_table || '_staging') into v_staging_count;
    end if;

    tabela := v_table;
    tabela_final_existe := to_regclass(format('public.%I', v_table)) is not null;
    tabela_staging_existe := to_regclass(format('public.%I', v_table || '_staging')) is not null;
    linhas_final := v_final_count;
    linhas_staging := v_staging_count;
    return next;
  end loop;
end;
$$;

grant execute on function public.grm_create_staging_table(text) to service_role;
grant execute on function public.grm_limpar_staging(text) to service_role;
grant execute on function public.grm_promover_staging(text, bigint) to service_role;
grant execute on function public.grm_staging_status() to service_role;
