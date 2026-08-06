-- Relação fixa de supervisões por usuário para a Programação.
-- Objetivo: evitar buscar/processar todas as supervisões a cada carregamento da tela.

create table if not exists public.programacao_usuario_supervisoes (
  id uuid primary key default gen_random_uuid(),
  app_usuario_id uuid null references public.app_usuarios(id) on delete cascade,
  auth_user_id uuid null references auth.users(id) on delete cascade,
  supervisao text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_usuario_supervisoes_usuario_check check (app_usuario_id is not null or auth_user_id is not null)
);
create unique index if not exists programacao_usuario_supervisoes_auth_sup_uidx
  on public.programacao_usuario_supervisoes(auth_user_id, upper(trim(supervisao)))
  where auth_user_id is not null;
create unique index if not exists programacao_usuario_supervisoes_app_sup_uidx
  on public.programacao_usuario_supervisoes(app_usuario_id, upper(trim(supervisao)))
  where app_usuario_id is not null;
create index if not exists programacao_usuario_supervisoes_auth_idx
  on public.programacao_usuario_supervisoes(auth_user_id)
  where ativo = true;
create index if not exists programacao_usuario_supervisoes_app_idx
  on public.programacao_usuario_supervisoes(app_usuario_id)
  where ativo = true;
create or replace function public.programacao_usuario_supervisoes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_programacao_usuario_supervisoes_touch on public.programacao_usuario_supervisoes;
create trigger trg_programacao_usuario_supervisoes_touch
before update on public.programacao_usuario_supervisoes
for each row execute function public.programacao_usuario_supervisoes_touch();
alter table public.programacao_usuario_supervisoes enable row level security;
drop policy if exists "programacao_usuario_supervisoes_select_self" on public.programacao_usuario_supervisoes;
create policy "programacao_usuario_supervisoes_select_self"
on public.programacao_usuario_supervisoes
for select
to authenticated
using (auth_user_id = auth.uid());
-- Backfill inicial a partir do campo legado app_usuarios.supervisao.
insert into public.programacao_usuario_supervisoes (app_usuario_id, auth_user_id, supervisao, ativo)
select
  u.id,
  u.auth_user_id,
  trim(sup) as supervisao,
  true
from public.app_usuarios u
cross join lateral regexp_split_to_table(coalesce(u.supervisao, ''), '[,;|\n]+') sup
where u.auth_user_id is not null
  and trim(sup) <> ''
on conflict do nothing;
-- Função usada pelo painel. Retorna a relação do usuário; se for master/admin,
-- retorna a tabela geral public.supervisoes. Fallback mantém compatibilidade com
-- o campo legado app_usuarios.supervisao.
create or replace function public.programacao_listar_supervisoes()
returns table(nome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_app_id uuid;
  v_setor text;
  v_supervisao text;
  v_is_admin boolean := false;
begin
  select u.id, coalesce(u.setor, ''), coalesce(u.supervisao, '')
    into v_app_id, v_setor, v_supervisao
  from public.app_usuarios u
  where u.auth_user_id = v_auth
  limit 1;

  v_is_admin := upper(v_setor) like '%MASTER%'
    or upper(v_setor) like '%ADMIN%'
    or upper(v_setor) like '%DIRETOR%'
    or upper(v_setor) like '%TI%';

  if v_is_admin then
    return query
      select distinct trim(s.nome)::text
      from public.supervisoes s
      where coalesce(s.ativo, true) = true
        and trim(s.nome) <> ''
      order by 1;
    return;
  end if;

  return query
    select distinct trim(r.supervisao)::text
    from public.programacao_usuario_supervisoes r
    where r.ativo = true
      and trim(r.supervisao) <> ''
      and (
        (r.auth_user_id is not null and r.auth_user_id = v_auth)
        or (r.app_usuario_id is not null and r.app_usuario_id = v_app_id)
      )
    order by 1;

  if found then
    return;
  end if;

  return query
    select distinct trim(sup)::text
    from regexp_split_to_table(coalesce(v_supervisao, ''), '[,;|\n]+') sup
    where trim(sup) <> ''
    order by 1;
end;
$$;
grant execute on function public.programacao_listar_supervisoes() to authenticated;
grant select on public.programacao_usuario_supervisoes to authenticated;
