
create or replace function public.app_usuarios_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select codigo into v_role from public.app_perfis where id = new.perfil_id;

  insert into public.profiles (id, full_name, email, role, active)
  values (
    coalesce(new.auth_user_id, new.id),
    new.nome,
    new.email,
    coalesce(v_role, 'user'),
    lower(coalesce(new.status, '')) = 'ativo'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_app_usuarios_sync_profile on public.app_usuarios;

create trigger trg_app_usuarios_sync_profile
after insert or update on public.app_usuarios
for each row
execute function public.app_usuarios_sync_profile();
;
