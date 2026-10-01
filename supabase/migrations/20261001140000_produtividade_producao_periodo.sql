-- Diretoria > Produtividade > aba "Produção por período".
-- Agrega o Resultado Diário por colaborador no banco: um ano inteiro são ~90 mil linhas,
-- paginar isso de 1000 em 1000 no navegador seria lento e pesado. SECURITY INVOKER (padrão):
-- a RLS de relatorio_resultado_diario continua valendo para quem chama.
create or replace function public.produtividade_producao_periodo(p_inicio date, p_fim date)
returns table (
  funcionario text,
  coordenacao text,
  dias integer,
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
    sum(b.ton) as toneladas,
    sum(b.valor) as valor_embarcado
  from base b
  left join coord_principal cp on cp.chave = b.chave
  group by b.chave, cp.coord
  order by b.chave;
$$;

revoke all on function public.produtividade_producao_periodo(date, date) from public, anon;
grant execute on function public.produtividade_producao_periodo(date, date) to authenticated;
