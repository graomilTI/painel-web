alter table public.frotas_veiculos
  add column if not exists patrimonio_codigo text,
  add column if not exists patrimonio_ultima_leitura timestamptz,
  add column if not exists patrimonio_dias_sem_leitura integer,
  add column if not exists patrimonio_funcionario text,
  add column if not exists patrimonio_coordenacao text,
  add column if not exists patrimonio_supervisao text;

comment on column public.frotas_veiculos.patrimonio_codigo is
  'Codigo do patrimonio associado pela placa durante a importacao de relatorios.';
comment on column public.frotas_veiculos.patrimonio_ultima_leitura is
  'Data da ultima leitura recebida na planilha de patrimonios.';
comment on column public.frotas_veiculos.patrimonio_dias_sem_leitura is
  'Quantidade de dias sem leitura recebida na planilha de patrimonios.';

create index if not exists idx_frotas_veiculos_patrimonio_codigo
  on public.frotas_veiculos (patrimonio_codigo);

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
  if auth.uid() is null then
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
           supervisao = coalesce(nullif(trim(p.supervisao), ''), v.supervisao),
           updated_at = now()
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
grant execute on function public.sincronizar_frotas_veiculos_patrimonios() to authenticated;
