-- NF "1" colide entre 2 empresas diferentes no mesmo período — dedup só por
-- N.F. juntava as duas. Chave composta (Empresa, N.F.) evita a colisão.
create or replace function public.resumo_faturamento_notas_periodo(p_inicio date, p_fim date)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(valor_nota_real), 0)
  from (
    select distinct on (dados_json->>'Empresa', dados_json->>'N.F.') valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim
    order by dados_json->>'Empresa', dados_json->>'N.F.', created_at desc
  ) unicas;
$function$;

select resumo_faturamento_notas_periodo('2026-06-01', '2026-07-01') as faturamento_junho_v2;;
