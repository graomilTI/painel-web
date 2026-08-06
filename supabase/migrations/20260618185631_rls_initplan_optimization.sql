-- Otimização RLS: envolve auth.uid()/auth.role()/auth.jwt() em (select ...)
-- para que o Postgres avalie a função UMA vez (InitPlan) em vez de por linha.
-- Semântica de segurança preservada. Correção oficial Supabase (auth_rls_initplan).
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
    raise notice 'corrigida: %.% / %', r.schemaname, r.tablename, r.policyname;
  end loop;
end $$;;
