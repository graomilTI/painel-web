create or replace function public.frotas_placa_chave_mercosul(p_placa text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with normalizada as (
    select regexp_replace(upper(p_placa), '[^A-Z0-9]', '', 'g') as placa
  )
  select case
    when placa ~ '^[A-Z]{3}[0-9][A-J][0-9]{2}$' then
      substring(placa from 1 for 4)
      || (ascii(substring(placa from 5 for 1)) - ascii('A'))::text
      || substring(placa from 6 for 2)
    else placa
  end
  from normalizada;
$$;

comment on function public.frotas_placa_chave_mercosul(text) is
  'Converte a placa Mercosul para a chave equivalente no padrao antigo: A-J na quinta posicao equivalem a 0-9.';

create index if not exists idx_frotas_veiculos_placa_mercosul
  on public.frotas_veiculos (public.frotas_placa_chave_mercosul(placa));

drop function if exists public.sincronizar_frotas_veiculos_patrimonios();

create function public.sincronizar_frotas_veiculos_patrimonios()
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
      public.frotas_placa_chave_mercosul(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        )
      ) as placa_chave
    from public.patrimonios_snapshot p
  ),
  patrimonio_mais_recente as (
    select distinct on (placa_chave)
      placa_chave,
      patrimonio_codigo,
      ultima_leitura,
      dias_sem_leitura,
      funcionario,
      coordenacao,
      supervisao
    from candidatos
    where length(placa_chave) = 7
    order by
      placa_chave,
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
     where public.frotas_placa_chave_mercosul(v.placa) = p.placa_chave
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
grant execute on function public.frotas_placa_chave_mercosul(text) to authenticated;
