-- Dashboard de Frotas: série mensal de multas e de excessos de velocidade, já agregada no banco.
-- Excesso conta UM por veículo por dia (vários registros do mesmo veículo no mesmo dia valem 1), por isso a agregação
-- não pode ser feita no navegador sem baixar milhares de linhas. A coordenação/supervisão vem do cadastro do veículo
-- (mesma regra do dashboard: Patrimônios primeiro, cadastro como alternativa), ligada pela placa sem pontuação.
create or replace function public.frotas_dashboard_mensal(p_ini date)
returns table (mes text, coordenacao text, supervisao text, multas integer, excessos integer)
language sql
stable
security invoker
set search_path = public
as $$
  with veic as (
    select distinct on (pn) pn, coord, sup
    from (
      select upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) as pn,
             coalesce(nullif(btrim(patrimonio_coordenacao), ''), nullif(btrim(coordenacao), ''), '') as coord,
             coalesce(nullif(btrim(patrimonio_supervisao), ''), nullif(btrim(supervisao), ''), '') as sup,
             id
      from public.frotas_veiculos
      where placa is not null
    ) x
    order by pn, id
  ),
  mensal as (
    select to_char(data_infracao, 'YYYY-MM') as mes,
           upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) as pn,
           count(*)::integer as multas, 0 as excessos
    from public.frotas_multas
    where data_infracao >= p_ini and placa is not null
    group by 1, 2
    union all
    select to_char(d, 'YYYY-MM'), pn, 0, count(*)::integer
    from (
      select distinct data_evento as d, upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) as pn
      from public.frotas_excesso_velocidade
      where data_evento >= p_ini and placa is not null
    ) q
    group by 1, 2
  )
  select m.mes, coalesce(v.coord, '') as coordenacao, coalesce(v.sup, '') as supervisao,
         sum(m.multas)::integer as multas, sum(m.excessos)::integer as excessos
  from mensal m
  left join veic v on v.pn = m.pn
  group by m.mes, coalesce(v.coord, ''), coalesce(v.sup, '')
  order by m.mes;
$$;

grant execute on function public.frotas_dashboard_mensal(date) to authenticated;
