-- Security hardening for privileged panel data.
-- Reuses the same user context RPC consumed by the frontend.

create or replace function public.painel_current_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ctx jsonb;
begin
  select to_jsonb(public.rpc_get_user_context()) into ctx;
  return coalesce(ctx, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end;
$$;

create or replace function public.painel_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(public.painel_current_context() #>> '{user,is_master}', 'false')) in ('true', 't', '1', 'yes', 'sim')
      or lower(coalesce(public.painel_current_context() #>> '{user,role}', '')) = 'master';
$$;

create or replace function public.painel_has_module(module_codes text[], require_edit boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select public.painel_current_context() as value
  ), modules as (
    select module
    from ctx,
    lateral jsonb_array_elements(coalesce(value -> 'modules', '[]'::jsonb)) as module
  )
  select public.painel_is_master() or exists (
    select 1
    from modules
    where lower(coalesce(module ->> 'code', module ->> 'codigo', '')) = any (
      select lower(code) from unnest(module_codes) as code
    )
      and lower(coalesce(module ->> 'can_view', module ->> 'pode_ver', 'true')) in ('true', 't', '1', 'yes', 'sim')
      and (
        not require_edit
        or lower(coalesce(module ->> 'can_edit', module ->> 'pode_editar', 'false')) in ('true', 't', '1', 'yes', 'sim')
        or lower(coalesce(module ->> 'can_create', module ->> 'pode_criar', 'false')) in ('true', 't', '1', 'yes', 'sim')
        or lower(coalesce(module ->> 'can_approve', module ->> 'pode_aprovar', 'false')) in ('true', 't', '1', 'yes', 'sim')
      )
  );
$$;

revoke all on function public.painel_current_context() from public;
revoke all on function public.painel_is_master() from public;
revoke all on function public.painel_has_module(text[], boolean) from public;
grant execute on function public.painel_current_context() to authenticated;
grant execute on function public.painel_is_master() to authenticated;
grant execute on function public.painel_has_module(text[], boolean) to authenticated;

-- User logs: users can only write their own identity; only authorized viewers can read logs.
alter table public.app_logs_usuarios enable row level security;
drop policy if exists logs_insert_auth on public.app_logs_usuarios;
drop policy if exists logs_select_auth on public.app_logs_usuarios;
create policy logs_insert_own on public.app_logs_usuarios
  for insert to authenticated
  with check (usuario_id = auth.uid());
create policy logs_select_authorized on public.app_logs_usuarios
  for select to authenticated
  using (public.painel_has_module(array['logs_usuarios', 'usuarios_acessos'], false));

-- E-mail accounts: password_cipher is never readable or writable from the browser.
alter table public.email_accounts enable row level security;
drop policy if exists email_accounts_select_authorized on public.email_accounts;
create policy email_accounts_select_authorized on public.email_accounts
  for select to authenticated
  using (public.painel_has_module(array['emails'], false));

revoke all on table public.email_accounts from anon, authenticated;
grant select (
  id, nome, email, provider,
  imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure,
  username, pasta_entrada, pasta_processados,
  ativo, auto_responder, limite_por_sync,
  ultima_uid, ultima_sync_em, ultima_sync_status, ultima_sync_erro,
  criado_por, criado_por_nome, created_at, updated_at
) on public.email_accounts to authenticated;

create or replace view public.email_accounts_public
with (security_invoker = true)
as
select
  id, nome, email, provider,
  imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure,
  username, pasta_entrada, pasta_processados,
  ativo, auto_responder, limite_por_sync,
  ultima_uid, ultima_sync_em, ultima_sync_status, ultima_sync_erro,
  criado_por, criado_por_nome, created_at, updated_at
from public.email_accounts;
revoke all on public.email_accounts_public from anon;
grant select on public.email_accounts_public to authenticated;

-- E-mail operational tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['email_messages', 'email_attachments', 'email_outbox', 'email_regras', 'email_historico']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_authorized', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_write_authorized', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.painel_has_module(array[''emails''], false))',
      table_name || '_select_authorized', table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.painel_has_module(array[''emails''], true)) with check (public.painel_has_module(array[''emails''], true))',
      table_name || '_write_authorized', table_name
    );
  end loop;
end $$;

-- Private email attachments are available only to authorized e-mail users.
drop policy if exists email_attachments_storage_select on storage.objects;
create policy email_attachments_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'email-anexos' and public.painel_has_module(array['emails'], false));

-- Fleet data follows module permissions instead of granting every authenticated user full access.
alter table public.frotas_veiculos enable row level security;
drop policy if exists frotas_veiculos_select_authorized on public.frotas_veiculos;
drop policy if exists frotas_veiculos_write_authorized on public.frotas_veiculos;
create policy frotas_veiculos_select_authorized on public.frotas_veiculos
  for select to authenticated
  using (public.painel_has_module(array['frotas_veiculos', 'frotas_multas', 'frotas_roteirizacao'], false));
create policy frotas_veiculos_write_authorized on public.frotas_veiculos
  for all to authenticated
  using (public.painel_has_module(array['frotas_veiculos'], true))
  with check (public.painel_has_module(array['frotas_veiculos'], true));

drop policy if exists frotas_posicoes_auth_all on public.frotas_posicoes;
create policy frotas_posicoes_authorized on public.frotas_posicoes
  for all to authenticated
  using (public.painel_has_module(array['frotas_roteirizacao', 'frotas_rastreadores'], false))
  with check (public.painel_has_module(array['frotas_roteirizacao', 'frotas_rastreadores'], true));

drop policy if exists frotas_rotas_auth_all on public.frotas_rotas;
create policy frotas_rotas_authorized on public.frotas_rotas
  for all to authenticated
  using (public.painel_has_module(array['frotas_roteirizacao'], false))
  with check (public.painel_has_module(array['frotas_roteirizacao'], true));

drop policy if exists frotas_rotas_paradas_auth_all on public.frotas_rotas_paradas;
create policy frotas_rotas_paradas_authorized on public.frotas_rotas_paradas
  for all to authenticated
  using (public.painel_has_module(array['frotas_roteirizacao'], false))
  with check (public.painel_has_module(array['frotas_roteirizacao'], true));

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
      select policyname from pg_policies
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
