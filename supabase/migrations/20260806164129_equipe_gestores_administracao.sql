-- Estrutura organizacional exibida em RH > Equipe.
-- O acesso acompanha o módulo `equipe`, que já é administrado em
-- Diretoria > Usuários e Acessos.

insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values ('equipe', 'Equipe', 'RECURSOS HUMANOS', 'equipe', 600, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  rota = excluded.rota,
  ativo = true;

create table public.equipe_gestores_regionais (
  id uuid primary key default gen_random_uuid(),
  regional text not null,
  supervisor_usuario_id uuid references public.app_usuarios(id) on delete set null,
  suporte_usuario_id uuid references public.app_usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipe_gestores_regionais_regional_not_blank check (btrim(regional) <> ''),
  constraint equipe_gestores_regionais_responsavel_check check (
    supervisor_usuario_id is not null or suporte_usuario_id is not null
  )
);

create unique index equipe_gestores_regionais_regional_uidx
  on public.equipe_gestores_regionais (lower(btrim(regional)));
create index equipe_gestores_regionais_supervisor_idx
  on public.equipe_gestores_regionais (supervisor_usuario_id)
  where supervisor_usuario_id is not null;
create index equipe_gestores_regionais_suporte_idx
  on public.equipe_gestores_regionais (suporte_usuario_id)
  where suporte_usuario_id is not null;

create table public.equipe_administracao_usuarios (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  funcao text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipe_administracao_setor_not_blank check (btrim(setor) <> ''),
  constraint equipe_administracao_funcao_not_blank check (btrim(funcao) <> '')
);

create unique index equipe_administracao_setor_usuario_uidx
  on public.equipe_administracao_usuarios (lower(btrim(setor)), usuario_id);
create index equipe_administracao_usuario_idx
  on public.equipe_administracao_usuarios (usuario_id);

create or replace function public.equipe_estrutura_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger equipe_gestores_regionais_touch
before update on public.equipe_gestores_regionais
for each row execute function public.equipe_estrutura_touch();

create trigger equipe_administracao_usuarios_touch
before update on public.equipe_administracao_usuarios
for each row execute function public.equipe_estrutura_touch();

alter table public.equipe_gestores_regionais enable row level security;
alter table public.equipe_administracao_usuarios enable row level security;

create policy equipe_gestores_regionais_select_authorized
  on public.equipe_gestores_regionais for select to authenticated
  using (public.painel_has_module(array['equipe'], false));
create policy equipe_gestores_regionais_insert_authorized
  on public.equipe_gestores_regionais for insert to authenticated
  with check (public.painel_has_module(array['equipe'], true));
create policy equipe_gestores_regionais_update_authorized
  on public.equipe_gestores_regionais for update to authenticated
  using (public.painel_has_module(array['equipe'], true))
  with check (public.painel_has_module(array['equipe'], true));
create policy equipe_gestores_regionais_delete_authorized
  on public.equipe_gestores_regionais for delete to authenticated
  using (public.painel_has_module(array['equipe'], true));

create policy equipe_administracao_select_authorized
  on public.equipe_administracao_usuarios for select to authenticated
  using (public.painel_has_module(array['equipe'], false));
create policy equipe_administracao_insert_authorized
  on public.equipe_administracao_usuarios for insert to authenticated
  with check (public.painel_has_module(array['equipe'], true));
create policy equipe_administracao_update_authorized
  on public.equipe_administracao_usuarios for update to authenticated
  using (public.painel_has_module(array['equipe'], true))
  with check (public.painel_has_module(array['equipe'], true));
create policy equipe_administracao_delete_authorized
  on public.equipe_administracao_usuarios for delete to authenticated
  using (public.painel_has_module(array['equipe'], true));

grant select, insert, update, delete on public.equipe_gestores_regionais to authenticated;
grant select, insert, update, delete on public.equipe_administracao_usuarios to authenticated;

-- Catálogo mínimo e seguro para os seletores. Não expõe campos internos da
-- conta e só responde a usuários que possuam acesso ao módulo Equipe.
create or replace function public.equipe_listar_usuarios()
returns table (
  id uuid,
  nome text,
  email text,
  setor text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nome, u.email, u.setor
  from public.app_usuarios u
  where auth.uid() is not null
    and public.painel_has_module(array['equipe'], false)
    and lower(coalesce(u.status, 'ativo')) = 'ativo'
  order by u.nome nulls last, u.email;
$$;

revoke all on function public.equipe_listar_usuarios() from public;
grant execute on function public.equipe_listar_usuarios() to authenticated;

comment on table public.equipe_gestores_regionais is
  'Relaciona cada regional aos usuários responsáveis por Supervisão e Suporte.';
comment on table public.equipe_administracao_usuarios is
  'Relaciona setores administrativos, usuários do painel e a função exercida.';
;
