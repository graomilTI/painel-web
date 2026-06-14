-- Server-side financial permissions. UI routing is not an authorization boundary.

do $$
declare
  cfg record;
  policy_row record;
  qualified_name text;
begin
  for cfg in
    select * from (values
      ('financeiro_contas_receber', array['financeiro_fluxo_caixa','financeiro']::text[], array['financeiro_fluxo_caixa','financeiro']::text[], false),
      ('financeiro_contas_pagar', array['financeiro_fluxo_caixa','financeiro']::text[], array['financeiro_fluxo_caixa','financeiro']::text[], false),
      ('financeiro_saldos_dia', array['financeiro_fluxo_caixa','financeiro']::text[], array['financeiro_fluxo_caixa','financeiro']::text[], false),
      ('financeiro_provisoes', array['financeiro_fluxo_caixa','financeiro']::text[], array['financeiro_fluxo_caixa','financeiro']::text[], false),
      ('financeiro_pagamentos', array['financeiro_pagamentos','pagamentos']::text[], array['financeiro_pagamentos','pagamentos']::text[], true),
      ('financeiro_pagamentos_execucoes', array['financeiro_despesas','financeiro_adiantamentos','financeiro_alimentacao']::text[], array['financeiro_despesas','financeiro_adiantamentos','financeiro_alimentacao']::text[], false),
      ('financeiro_pagamentos_linhas', array['financeiro_despesas','financeiro_adiantamentos','financeiro_alimentacao']::text[], array['financeiro_despesas','financeiro_adiantamentos','financeiro_alimentacao']::text[], false),
      ('financeiro_notas_fiscais_resumo', array['notas_fiscais','financeiro_despesas']::text[], array['notas_fiscais','financeiro_despesas']::text[], false)
    ) as permissions(table_name, read_codes, write_codes, allow_authenticated_insert)
  loop
    qualified_name := format('public.%I', cfg.table_name);
    if to_regclass(qualified_name) is null then
      continue;
    end if;

    execute format('alter table %s enable row level security', qualified_name);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = cfg.table_name
    loop
      execute format('drop policy if exists %I on %s', policy_row.policyname, qualified_name);
    end loop;

    execute format(
      'create policy %I on %s for select to authenticated using (public.painel_has_module(%L::text[], false))',
      cfg.table_name || '_select_authorized', qualified_name, cfg.read_codes
    );
    execute format(
      'create policy %I on %s for update to authenticated using (public.painel_has_module(%L::text[], true)) with check (public.painel_has_module(%L::text[], true))',
      cfg.table_name || '_update_authorized', qualified_name, cfg.write_codes, cfg.write_codes
    );
    execute format(
      'create policy %I on %s for delete to authenticated using (public.painel_has_module(%L::text[], true))',
      cfg.table_name || '_delete_authorized', qualified_name, cfg.write_codes
    );

    if cfg.allow_authenticated_insert then
      execute format(
        'create policy %I on %s for insert to authenticated with check (auth.uid() is not null)',
        cfg.table_name || '_insert_requests', qualified_name
      );
    else
      execute format(
        'create policy %I on %s for insert to authenticated with check (public.painel_has_module(%L::text[], true))',
        cfg.table_name || '_insert_authorized', qualified_name, cfg.write_codes
      );
    end if;
  end loop;
end $$;
