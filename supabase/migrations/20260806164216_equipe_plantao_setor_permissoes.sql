-- Configuração central dos horários e editores do Plantão por setor.

create table public.rh_plantao_setor_config (
  setor text primary key,
  hora_inicio time not null default '08:00',
  hora_fim time not null default '12:00',
  hora_inicio_2 time,
  hora_fim_2 time,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rh_plantao_setor_config_setor_not_blank check (btrim(setor) <> ''),
  constraint rh_plantao_setor_config_intervalo_1 check (hora_inicio < hora_fim),
  constraint rh_plantao_setor_config_intervalo_2 check (
    (hora_inicio_2 is null and hora_fim_2 is null)
    or (hora_inicio_2 is not null and hora_fim_2 is not null and hora_inicio_2 < hora_fim_2)
  )
);

create table public.rh_plantao_setor_editores (
  id uuid primary key default gen_random_uuid(),
  setor text not null references public.rh_plantao_setor_config(setor) on update cascade on delete cascade,
  app_usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint rh_plantao_setor_editores_unique unique (setor, app_usuario_id)
);

create index rh_plantao_setor_editores_usuario_idx
  on public.rh_plantao_setor_editores (app_usuario_id, setor);

insert into public.rh_plantao_setor_config
  (setor, hora_inicio, hora_fim, hora_inicio_2, hora_fim_2)
values
  ('RH', '08:00', '12:00', '13:30', '18:00'),
  ('Caixas', '08:00', '12:00', '13:30', '18:00'),
  ('Frotas', '08:00', '12:00', '13:30', '18:00'),
  ('Logística', '07:30', '12:00', '13:00', '19:30'),
  ('Troca de notas', '08:00', '12:00', '13:30', '18:00')
on conflict (setor) do nothing;

create or replace function public.rh_plantao_pode_editar_setor(p_setor text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.painel_is_master()
    or exists (
      select 1
      from public.rh_plantao_setor_editores e
      join public.app_usuarios u on u.id = e.app_usuario_id
      where u.auth_user_id = auth.uid()
        and lower(btrim(e.setor)) = lower(btrim(p_setor))
        and lower(coalesce(u.status, 'ativo')) = 'ativo'
    )
  );
$$;

revoke all on function public.rh_plantao_pode_editar_setor(text) from public;
grant execute on function public.rh_plantao_pode_editar_setor(text) to authenticated;

alter table public.rh_plantao_setor_config enable row level security;
alter table public.rh_plantao_setor_editores enable row level security;

create policy rh_plantao_setor_config_select
  on public.rh_plantao_setor_config for select to authenticated
  using (public.painel_has_module(array['equipe', 'rh_plantao'], false));
create policy rh_plantao_setor_config_insert_master
  on public.rh_plantao_setor_config for insert to authenticated
  with check (public.painel_is_master());
create policy rh_plantao_setor_config_update_editor
  on public.rh_plantao_setor_config for update to authenticated
  using (public.rh_plantao_pode_editar_setor(setor))
  with check (public.rh_plantao_pode_editar_setor(setor));
create policy rh_plantao_setor_config_delete_master
  on public.rh_plantao_setor_config for delete to authenticated
  using (public.painel_is_master());

create policy rh_plantao_setor_editores_select
  on public.rh_plantao_setor_editores for select to authenticated
  using (public.painel_has_module(array['equipe', 'rh_plantao'], false));
create policy rh_plantao_setor_editores_insert_master
  on public.rh_plantao_setor_editores for insert to authenticated
  with check (public.painel_is_master());
create policy rh_plantao_setor_editores_delete_master
  on public.rh_plantao_setor_editores for delete to authenticated
  using (public.painel_is_master());

grant select, insert, update, delete on public.rh_plantao_setor_config to authenticated;
grant select, insert, delete on public.rh_plantao_setor_editores to authenticated;

create or replace function public.rh_plantao_setores_acesso()
returns table (
  setor text,
  hora_inicio time,
  hora_fim time,
  hora_inicio_2 time,
  hora_fim_2 time,
  pode_editar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.setor, c.hora_inicio, c.hora_fim, c.hora_inicio_2, c.hora_fim_2,
         public.rh_plantao_pode_editar_setor(c.setor)
  from public.rh_plantao_setor_config c
  where auth.uid() is not null
    and c.ativo
    and public.painel_has_module(array['equipe', 'rh_plantao'], false)
  order by c.setor;
$$;

revoke all on function public.rh_plantao_setores_acesso() from public;
grant execute on function public.rh_plantao_setores_acesso() to authenticated;

-- Proteção final das escalas: mesmo que outra tela tente gravar diretamente,
-- o banco só aceita alterações no setor autorizado para aquele usuário.
create or replace function public.rh_plantao_validar_editor_setor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setor text := case when tg_op = 'DELETE' then old.setor else new.setor end;
begin
  -- Processos internos/serviço não possuem auth.uid() e mantêm compatibilidade.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not public.rh_plantao_pode_editar_setor(v_setor) then
    raise exception 'Você não possui permissão para editar o plantão do setor %.', v_setor
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.rh_plantao_escalas') is not null then
    drop trigger if exists rh_plantao_escalas_validar_editor on public.rh_plantao_escalas;
    create trigger rh_plantao_escalas_validar_editor
      before insert or update or delete on public.rh_plantao_escalas
      for each row execute function public.rh_plantao_validar_editor_setor();
  end if;
  if to_regclass('public.rh_plantao_modelos') is not null then
    drop trigger if exists rh_plantao_modelos_validar_editor on public.rh_plantao_modelos;
    create trigger rh_plantao_modelos_validar_editor
      before insert or update or delete on public.rh_plantao_modelos
      for each row execute function public.rh_plantao_validar_editor_setor();
  end if;
end $$;

comment on table public.rh_plantao_setor_config is
  'Horários padrão do plantão configurados individualmente por setor.';
comment on table public.rh_plantao_setor_editores is
  'Usuários explicitamente autorizados a editar o plantão de cada setor.';
;
