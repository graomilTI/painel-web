-- Produtividade > Produção por período: "Faturado" passa a ser toneladas × R$/Ton (valor_ton) do
-- Resultado Diário, em vez de valor_embarcado (embarcado × R$/Ton). Linha com toneladas = 0 não fatura.
-- A presença do colaborador no dia (dias / dias_fim_semana) segue contando toneladas OU valor embarcado.
-- Renomeia a coluna de retorno (valor_embarcado -> valor_faturado), então precisa de drop + create.
drop function if exists public.produtividade_producao_periodo(date, date);

create function public.produtividade_producao_periodo(p_inicio date, p_fim date)
returns table (
  funcionario text,
  coordenacao text,
  dias integer,
  dias_fim_semana integer,
  toneladas numeric,
  valor_faturado numeric
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
      coalesce(r.toneladas, 0) * coalesce(r.valor_ton, 0) as valor
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
    sum(b.valor) as valor_faturado
  from base b
  left join coord_principal cp on cp.chave = b.chave
  group by b.chave, cp.coord
  order by b.chave;
$$;

revoke all on function public.produtividade_producao_periodo(date, date) from public, anon;
grant execute on function public.produtividade_producao_periodo(date, date) to authenticated;
