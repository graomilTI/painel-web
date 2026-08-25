-- Troca a chave de dedupe das RPCs de notas fiscais de (Empresa, N.F.) para
-- (Empresa, Fatura) - ver migration grm_notas_fiscais_fatura_e_chave_unica pro
-- contexto completo. Usa as colunas reais empresa/fatura (nao dados_json->>'Empresa'),
-- acompanhando o indice unico criado em grm_notas_fiscais_empresa_coluna_real.
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
  select distinct on (empresa, fatura)
    numero_nf, created_at, dados_json
  from public.grm_notas_fiscais_importacoes
  where fatura is not null
  order by empresa, fatura, created_at desc;
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
    select distinct on (empresa, fatura) valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim and fatura is not null
    order by empresa, fatura, created_at desc
  ) unicas;
$$;

grant execute on function public.resumo_faturamento_notas_periodo(date, date) to anon, authenticated, service_role;
