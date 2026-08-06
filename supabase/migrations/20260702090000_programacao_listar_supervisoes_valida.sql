-- Corrige programacao_listar_supervisoes: a relação por usuário pode conter
-- rótulos legados que não são coordenações reais (ex.: "Master" herdado do
-- campo livre app_usuarios.supervisao durante o backfill), fazendo esse token
-- aparecer como se fosse uma supervisão selecionável no seletor da Programação.
-- Agora o caminho por usuário só retorna nomes que existem de fato em
-- public.supervisoes (ativas).
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
    join public.supervisoes s
      on upper(trim(s.nome)) = upper(trim(r.supervisao))
      and coalesce(s.ativo, true) = true
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
    join public.supervisoes s
      on upper(trim(s.nome)) = upper(trim(sup))
      and coalesce(s.ativo, true) = true
    where trim(sup) <> ''
    order by 1;
end;
$$;
grant execute on function public.programacao_listar_supervisoes() to authenticated;
