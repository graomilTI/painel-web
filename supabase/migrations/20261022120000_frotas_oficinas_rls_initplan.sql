-- Frotas · Oficinas: a leitura com milhares de linhas estourava o statement_timeout (8 s) do usuário logado.
-- A política de RLS chamava painel_has_module() uma vez POR LINHA (~4 ms cada: 1.000 linhas = 11 s). Embrulhada em
-- (select ...) o Postgres avalia uma vez só (initplan) e a mesma leitura cai para milissegundos.
-- Vale para as tabelas da Manutenção que podem crescer (oficinas, manutenções, itens, cotações, notas, peças).
do $$
declare
  pol record;
  novo_using text;
  novo_check text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename in ('frotas_oficinas','frotas_manutencoes','frotas_manutencao_itens','frotas_manutencao_orcamentos','frotas_manutencao_notas','frotas_manutencao_pecas')
       and (coalesce(qual, '') like '%painel_has_module%' or coalesce(with_check, '') like '%painel_has_module%')
  loop
    -- painel_has_module(ARRAY[...], bool) -> (select painel_has_module(ARRAY[...], bool)), sem embrulhar duas vezes
    novo_using := case when pol.qual is null then null
      else regexp_replace(pol.qual, '(?<!select )(public\.)?painel_has_module\(([^)]*)\)', '(select public.painel_has_module(\2))', 'g') end;
    novo_check := case when pol.with_check is null then null
      else regexp_replace(pol.with_check, '(?<!select )(public\.)?painel_has_module\(([^)]*)\)', '(select public.painel_has_module(\2))', 'g') end;
    execute format('alter policy %I on %I.%I%s%s', pol.policyname, pol.schemaname, pol.tablename,
      case when novo_using is not null then ' using (' || novo_using || ')' else '' end,
      case when novo_check is not null then ' with check (' || novo_check || ')' else '' end);
  end loop;
end $$;
