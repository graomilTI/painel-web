-- Otimização de RLS (auth_rls_initplan) — 46 políticas em 27 tabelas.
--
-- Problema: políticas usavam auth.uid()/auth.role()/auth.jwt() diretamente,
-- fazendo o Postgres RE-AVALIAR a função por linha. Em tabelas grandes
-- (relatorio_resultado_diario: 49k linhas, 44MB) isso multiplica o custo de
-- toda query — gargalo transversal a todo o painel.
--
-- Correção (oficial Supabase): envolver as chamadas em (select auth.x()),
-- que o planner avalia UMA vez como InitPlan. Semântica de segurança idêntica.
--
-- Idempotente: reaplica sem efeito se já corrigido.
do $$
declare
  r record;
  v_qual text;
  v_check text;
  sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.(uid|jwt|role)\(\)' or with_check ~ 'auth\.(uid|jwt|role)\(\)')
  loop
    v_qual  := r.qual;
    v_check := r.with_check;

    if v_qual is not null then
      v_qual := regexp_replace(v_qual,  'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
      v_qual := regexp_replace(v_qual,  '\(select \(select auth\.(uid|jwt|role)\(\)\)\)', '(select auth.\1())', 'g');
    end if;
    if v_check is not null then
      v_check := regexp_replace(v_check, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
      v_check := regexp_replace(v_check, '\(select \(select auth\.(uid|jwt|role)\(\)\)\)', '(select auth.\1())', 'g');
    end if;

    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual  is not null then sql := sql || ' using (' || v_qual || ')'; end if;
    if v_check is not null then sql := sql || ' with check (' || v_check || ')'; end if;

    execute sql;
  end loop;
end $$;
