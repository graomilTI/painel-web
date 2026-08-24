-- O agente GRM passou a sincronizar notas fiscais com um formato de JSON novo
-- que usa a chave "Numero NF" em vez de "N.F." (dados_json->>'N.F.' fica NULL
-- nessas linhas). As duas RPCs abaixo deduplicavam so por 'N.F.', entao o
-- DISTINCT ON colapsava em 1 registro centenas de notas reais de uma mesma
-- empresa quando o campo era NULL - ~372 notas de agosto/2026 sumiam do DRE e
-- do Dashboard do Socio em silencio. Fix ja aplicado em producao via SQL
-- direto em 24/08; esta migration so espelha o estado atual no repo.
create or replace function public.dre_notas_fiscais_deduplicadas()
returns table (
  numero_nf text,
  created_at timestamptz,
  dados_json jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct on (
    dados_json->>'Empresa',
    coalesce(dados_json->>'N.F.', dados_json->>'Número NF', grm_notas_fiscais_importacoes.numero_nf)
  )
    numero_nf, created_at, dados_json
  from public.grm_notas_fiscais_importacoes
  order by
    dados_json->>'Empresa',
    coalesce(dados_json->>'N.F.', dados_json->>'Número NF', grm_notas_fiscais_importacoes.numero_nf),
    created_at desc;
$$;

grant execute on function public.dre_notas_fiscais_deduplicadas() to anon, authenticated, service_role;

create or replace function public.resumo_faturamento_notas_periodo(p_inicio date, p_fim date)
returns numeric
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(valor_nota_real), 0)
  from (
    select distinct on (
      dados_json->>'Empresa',
      coalesce(dados_json->>'N.F.', dados_json->>'Número NF', grm_notas_fiscais_importacoes.numero_nf)
    ) valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim
    order by
      dados_json->>'Empresa',
      coalesce(dados_json->>'N.F.', dados_json->>'Número NF', grm_notas_fiscais_importacoes.numero_nf),
      created_at desc
  ) unicas;
$$;

grant execute on function public.resumo_faturamento_notas_periodo(date, date) to anon, authenticated, service_role;
