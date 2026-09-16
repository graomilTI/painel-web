-- A chave de dedupe (Empresa, Fatura) assume que "Fatura" só é única dentro de
-- cada "Empresa". Não é: a mesma nota (mesma Fatura) aparece no GRM gravada
-- duas vezes com "Empresa" diferente - até agora só visto no par
-- "ELIZEU MOTA" / "GRÃO1000" (repasse/representação da mesma carga) - e as
-- duas sobreviviam ao distinct on (empresa, fatura), duplicando o valor da
-- nota no DRE e no Dashboard do Sócio. Achado 16/09 comparando o Relatório de
-- Notas Fiscais oficial da GRM com o "NOTAS FISCAIS" do DRE Geral: a
-- diferença mensal (0,5-3%, R$30-167mil em mar-jul/2026) caiu pra <0,3%
-- quando deduplicado só por Fatura. "Fatura" já é a chave real (é o número do
-- documento de faturamento no GRM, não algo por empresa), então o dedupe deve
-- ser só por ela. Não mexe no índice único da tabela crua nem no onConflict
-- do agente de sync (empresa,fatura) - ambos continuam guardando as duas
-- linhas cruas, só a leitura agregada do DRE/Dashboard do Sócio passa a
-- colapsar pela Fatura.
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
  select distinct on (fatura)
    numero_nf, created_at, dados_json
  from public.grm_notas_fiscais_importacoes
  where fatura is not null
  order by fatura, created_at desc;
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
    select distinct on (fatura) valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim and fatura is not null
    order by fatura, created_at desc
  ) unicas;
$$;

grant execute on function public.resumo_faturamento_notas_periodo(date, date) to anon, authenticated, service_role;
