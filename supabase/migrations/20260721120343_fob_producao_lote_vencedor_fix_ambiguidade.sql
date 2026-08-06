
-- Fix: o parâmetro de saída "created_at" (declarado em RETURNS TABLE) virava
-- variável PL/pgSQL implícita e colidia com a coluna "created_at" usada
-- dentro do CTE do bloco "select ... into" — renomeadas as colunas internas
-- pra "ca"/evitar qualquer identificador bare "created_at" no corpo da função.
create or replace function public.fob_producao_lote_vencedor(
  p_referencia_ddmmyyyy text,
  p_dias        int default 3,
  p_gap_minutos int default 20
)
returns table(id uuid, dados_json jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lote_inicio timestamptz;
  v_lote_fim    timestamptz;
begin
  p_dias := greatest(1, least(coalesce(p_dias, 3), 14));
  p_gap_minutos := greatest(5, least(coalesce(p_gap_minutos, 20), 180));

  with linhas as (
    select t.created_at as ca, (t.dados_json->>'Data' = p_referencia_ddmmyyyy) as bate
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= now() - make_interval(days => p_dias)
  ),
  marcado as (
    select ca, bate, lag(ca) over (order by ca) as anterior
    from linhas
  ),
  ilhas as (
    select *,
      sum(case when anterior is null or ca - anterior > make_interval(mins => p_gap_minutos) then 1 else 0 end)
        over (order by ca) as lote_id
    from marcado
  )
  select min(ca), max(ca)
  into v_lote_inicio, v_lote_fim
  from ilhas
  group by lote_id
  having count(*) filter (where bate) > 0
  order by count(*) filter (where bate) desc, max(ca) desc
  limit 1;

  if v_lote_inicio is null then
    return;
  end if;

  return query
    select t.id, t.dados_json, t.created_at
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= v_lote_inicio and t.created_at <= v_lote_fim
    order by t.id desc;
end;
$$;

revoke all on function public.fob_producao_lote_vencedor(text, int, int) from public;
revoke all on function public.fob_producao_lote_vencedor(text, int, int) from anon;
grant execute on function public.fob_producao_lote_vencedor(text, int, int) to authenticated;
;
