do $$
declare t text; p record;
begin
  foreach t in array array[
    'hospedagem_alojamentos','hospedagem_anexos','hospedagem_historico_colaboradores',
    'hospedagem_notas','hospedagem_producao_diarias'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false))',
      t||'_select_authorized',t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.hospedagem_pode_operar(true)) with check (public.hospedagem_pode_operar(true))',
      t||'_write_authorized',t
    );
  end loop;
end $$;
