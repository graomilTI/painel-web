-- grm_notas_fiscais_importacoes reinsere a MESMA NF repetidamente a cada sync
-- (sem upsert por chave única) — achado ao investigar lentidão do Dashboard do
-- Sócio: 269 mil linhas pra ~poucas centenas de NFs distintas por mês. Este RPC
-- deduplica por número da NF (pega o registro mais recente de cada uma) e soma
-- só isso, direto no banco — evita baixar as linhas todas pro navegador.
create or replace function public.resumo_faturamento_notas_periodo(p_inicio date, p_fim date)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(valor_nota_real), 0)
  from (
    select distinct on (dados_json->>'N.F.') valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim
    order by dados_json->>'N.F.', created_at desc
  ) unicas;
$function$;;
