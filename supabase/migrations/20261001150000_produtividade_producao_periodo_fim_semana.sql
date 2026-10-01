-- Produtividade > Produção por período: o efetivo tem custo (salário ÷ 30) em todo dia útil, e
-- também nos sábados/domingos em que produziu. Para a aba bater com o relatório diário, a função
-- passa a devolver quantos dias de fim de semana o colaborador produziu no período.
-- Muda o tipo de retorno, então precisa de drop + create.
drop function if exists public.produtividade_producao_periodo(date, date);

create function public.produtividade_producao_periodo(p_inicio date, p_fim date)
returns table (
  funcionario text,
  coordenacao text,
  dias integer,
  dias_fim_semana integer,
  toneladas numeric,
  valor_embarcado numeric
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      upper(btrim(r.funcionario)) as chave,
      btrim(r.funcionario) as nome,
      nullif(btrim(r.coordenacao), '') as coord,
      r.data,
      coalesce(r.toneladas, 0) as ton,
      coalesce(r.valor_embarcado, 0) as valor
    from relatorio_resultado_diario r
    where r.data >= p_inicio
      and r.data <= p_fim
      and nullif(btrim(r.funcionario), '') is not null
      and (coalesce(r.toneladas, 0) > 0 or coalesce(r.valor_embarcado, 0) > 0)
  ),
  por_coord as (
    select chave, coord, sum(ton) as ton_coord
    from base
    where coord is not null
    group by chave, coord
  ),
  coord_principal as (
    select distinct on (chave) chave, coord
    from por_coord
    order by chave, ton_coord desc, coord
  )
  select
    max(b.nome) as funcionario,
    cp.coord as coordenacao,
    count(distinct b.data)::integer as dias,
    count(distinct b.data) filter (where extract(dow from b.data) in (0, 6))::integer as dias_fim_semana,
    sum(b.ton) as toneladas,
    sum(b.valor) as valor_embarcado
  from base b
  left join coord_principal cp on cp.chave = b.chave
  group by b.chave, cp.coord
  order by b.chave;
$$;

revoke all on function public.produtividade_producao_periodo(date, date) from public, anon;
grant execute on function public.produtividade_producao_periodo(date, date) to authenticated;
