-- Caixa de e-mail pessoal do Gestor.
-- A Central de E-mails (escopo CENTRAL) continua administrativa; contas GESTOR
-- pertencem obrigatoriamente ao usuário autenticado e são isoladas por RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.email_accounts
  add column if not exists escopo text not null default 'CENTRAL',
  add column if not exists owner_auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists conexao_status text not null default 'PENDENTE',
  add column if not exists conectada_em timestamptz,
  add column if not exists ultima_verificacao_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_accounts_escopo_check'
      and conrelid = 'public.email_accounts'::regclass
  ) then
    alter table public.email_accounts add constraint email_accounts_escopo_check
      check (escopo in ('CENTRAL', 'GESTOR'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_accounts_owner_gestor_check'
      and conrelid = 'public.email_accounts'::regclass
  ) then
    alter table public.email_accounts add constraint email_accounts_owner_gestor_check
      check (escopo <> 'GESTOR' or owner_auth_user_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_accounts_conexao_status_check'
      and conrelid = 'public.email_accounts'::regclass
  ) then
    alter table public.email_accounts add constraint email_accounts_conexao_status_check
      check (conexao_status in ('PENDENTE', 'CONECTADA', 'ERRO', 'DESCONECTADA'));
  end if;
end $$;

create unique index if not exists email_accounts_gestor_owner_uidx
  on public.email_accounts (owner_auth_user_id)
  where escopo = 'GESTOR';
create index if not exists email_accounts_owner_idx
  on public.email_accounts (owner_auth_user_id, escopo);

alter table public.email_messages
  add column if not exists mailbox_path text not null default 'INBOX',
  add column if not exists lido boolean not null default false,
  add column if not exists favorito boolean not null default false,
  add column if not exists arquivado_em timestamptz,
  add column if not exists excluido_em timestamptz;

create index if not exists email_messages_account_mailbox_data_idx
  on public.email_messages (account_id, mailbox_path, data_recebimento desc);
create index if not exists email_messages_account_unread_idx
  on public.email_messages (account_id, data_recebimento desc)
  where lido = false and excluido_em is null;

alter table public.email_outbox drop constraint if exists email_outbox_tipo_check;
alter table public.email_outbox add constraint email_outbox_tipo_check
  check (tipo in ('NOVO', 'RESPOSTA', 'ENCAMINHAMENTO'));

insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo, descricao)
values ('gestor_email', 'E-mail', 'GESTOR', 'mail', 'gestor-email', 58, true,
        'Caixa de e-mail pessoal vinculada ao usuário Gestor autenticado.')
on conflict (codigo) do update set
  nome = excluded.nome, categoria = excluded.categoria, icone = excluded.icone,
  rota = excluded.rota, ativo = true, descricao = excluded.descricao, updated_at = now();

create or replace function private.email_admin_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_usuarios u
    left join public.app_perfis p on p.id = u.perfil_id
    where u.auth_user_id = (select auth.uid())
      and lower(coalesce(u.status, case when u.ativo then 'ativo' else 'inativo' end, '')) = 'ativo'
      and (
        lower(coalesce(p.codigo, '')) = 'master'
        or exists (
          select 1 from public.app_usuario_modulos um
          join public.app_modulos m on m.id = um.modulo_id
          where um.usuario_id = u.id and m.codigo = 'emails' and m.ativo = true
            and coalesce(um.ativo, true) = true and lower(coalesce(um.status, 'ativo')) = 'ativo'
        )
        or exists (
          select 1 from public.app_perfil_modulo pm
          join public.app_modulos m on m.id = pm.modulo_id
          where pm.perfil_id = u.perfil_id and m.codigo = 'emails'
            and m.ativo = true and pm.pode_ver = true
        )
      )
  );
$$;

create or replace function private.email_account_owned(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.email_accounts a
    where a.id = p_account_id and a.escopo = 'GESTOR'
      and a.owner_auth_user_id = (select auth.uid())
  );
$$;

create or replace function private.email_message_owned(p_email_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.email_messages e
    join public.email_accounts a on a.id = e.account_id
    where e.id = p_email_id and a.escopo = 'GESTOR'
      and a.owner_auth_user_id = (select auth.uid())
  );
$$;

create or replace function private.email_storage_owned(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.email_attachments att
    join public.email_messages e on e.id = att.email_id
    join public.email_accounts a on a.id = e.account_id
    where att.storage_path = p_name and a.escopo = 'GESTOR'
      and a.owner_auth_user_id = (select auth.uid())
  );
$$;

revoke execute on function private.email_admin_access() from public, anon, authenticated;
revoke execute on function private.email_account_owned(uuid) from public, anon, authenticated;
revoke execute on function private.email_message_owned(uuid) from public, anon, authenticated;
revoke execute on function private.email_storage_owned(text) from public, anon, authenticated;

-- Remove todas as políticas permissivas anteriores das relações de e-mail.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'email_accounts','email_messages','email_attachments','email_mailbox_states',
      'email_historico','email_outbox','email_regras','email_gestores_regionais'
    )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_attachments enable row level security;
alter table public.email_mailbox_states enable row level security;
alter table public.email_historico enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_regras enable row level security;
alter table public.email_gestores_regionais enable row level security;

create policy email_accounts_admin_all on public.email_accounts for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_accounts_gestor_select on public.email_accounts for select to authenticated
  using (escopo = 'GESTOR' and owner_auth_user_id = (select auth.uid()));

create policy email_messages_admin_all on public.email_messages for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_messages_gestor_select on public.email_messages for select to authenticated
  using ((select private.email_account_owned(account_id)));
create policy email_messages_gestor_update on public.email_messages for update to authenticated
  using ((select private.email_account_owned(account_id)))
  with check ((select private.email_account_owned(account_id)));

create policy email_attachments_admin_all on public.email_attachments for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_attachments_gestor_select on public.email_attachments for select to authenticated
  using ((select private.email_message_owned(email_id)));

create policy email_mailbox_states_admin_all on public.email_mailbox_states for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_mailbox_states_gestor_select on public.email_mailbox_states for select to authenticated
  using ((select private.email_account_owned(account_id)));

create policy email_historico_admin_all on public.email_historico for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_historico_gestor_select on public.email_historico for select to authenticated
  using ((select private.email_message_owned(email_id)));
create policy email_historico_gestor_insert on public.email_historico for insert to authenticated
  with check ((select private.email_message_owned(email_id)) and usuario_id = (select auth.uid()));

create policy email_outbox_admin_all on public.email_outbox for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_outbox_gestor_select on public.email_outbox for select to authenticated
  using ((select private.email_account_owned(account_id)));
create policy email_outbox_gestor_insert on public.email_outbox for insert to authenticated
  with check ((select private.email_account_owned(account_id)) and aprovado_por = (select auth.uid()));
create policy email_outbox_gestor_update on public.email_outbox for update to authenticated
  using ((select private.email_account_owned(account_id)))
  with check ((select private.email_account_owned(account_id)) and aprovado_por = (select auth.uid()));

create policy email_regras_admin_all on public.email_regras for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));
create policy email_gestores_regionais_admin_all on public.email_gestores_regionais for all to authenticated
  using ((select private.email_admin_access())) with check ((select private.email_admin_access()));

create or replace view public.email_accounts_public
with (security_invoker = true)
as select
  id, nome, email, provider, imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure, username, pasta_entrada, pasta_processados,
  ativo, auto_responder, limite_por_sync, ultima_uid, ultima_sync_em,
  ultima_sync_status, ultima_sync_erro, criado_por, criado_por_nome,
  created_at, updated_at, escopo, owner_auth_user_id, conexao_status,
  conectada_em, ultima_verificacao_em
from public.email_accounts;

revoke all on public.email_accounts from anon, authenticated;
grant select (
  id, nome, email, provider, imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure, username, pasta_entrada, pasta_processados,
  ativo, auto_responder, limite_por_sync, ultima_uid, ultima_sync_em,
  ultima_sync_status, ultima_sync_erro, criado_por, criado_por_nome,
  created_at, updated_at, escopo, owner_auth_user_id, conexao_status,
  conectada_em, ultima_verificacao_em
) on public.email_accounts to authenticated;
grant select on public.email_accounts_public to authenticated;
revoke all on public.email_accounts_public from anon;
grant select, insert, update, delete on public.email_messages to authenticated;
grant select, insert, update, delete on public.email_attachments to authenticated;
grant select, insert, update, delete on public.email_mailbox_states to authenticated;
grant select, insert, update, delete on public.email_historico to authenticated;
grant select, insert, update, delete on public.email_outbox to authenticated;
grant select, insert, update, delete on public.email_regras to authenticated;
grant select, insert, update, delete on public.email_gestores_regionais to authenticated;

drop policy if exists email_attachments_storage_select on storage.objects;
drop policy if exists email_anexos_select on storage.objects;
create policy email_attachments_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'email-anexos'
    and ((select private.email_admin_access()) or (select private.email_storage_owned(name)))
  );
