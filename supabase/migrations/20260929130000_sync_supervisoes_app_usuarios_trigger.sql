-- Mantém programacao_usuario_supervisoes em sincronia com app_usuarios.supervisao.
-- Nada mais escrevia nessa tabela depois do backfill de 29/06 (última escrita 05/08), então
-- cadastros novos/editados ficavam sem linhas (~60 usuários; caso SARA KELCI RIBAS).
-- Regra: o campo do cadastro (tokens separados por , ; | ou quebra de linha) é a fonte;
-- tokens novos viram linha ativa, tokens removidos viram ativo=false (sem apagar histórico).

create or replace function public.programacao_sync_supervisoes_usuario(p_app_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid;
  v_sup text;
  v_chaves text[];
begin
  select u.auth_user_id, coalesce(u.supervisao, '') into v_auth, v_sup
  from public.app_usuarios u where u.id = p_app_usuario_id;
  if not found then return; end if;
  -- auth_user_id órfão (fora de auth.users) violaria a FK: fica só o vínculo por app_usuario_id
  if v_auth is not null and not exists (select 1 from auth.users a where a.id = v_auth) then
    v_auth := null;
  end if;

  select coalesce(array_agg(distinct upper(trim(t))), '{}') into v_chaves
  from regexp_split_to_table(v_sup, '[,;|\n]+') t
  where trim(t) <> '';

  -- desativa o que saiu do cadastro; reativa/alinha o que continua
  update public.programacao_usuario_supervisoes p
     set ativo = (upper(trim(p.supervisao)) = any (v_chaves)),
         app_usuario_id = p_app_usuario_id,
         auth_user_id = coalesce(v_auth, p.auth_user_id)
   where (p.app_usuario_id = p_app_usuario_id or (v_auth is not null and p.auth_user_id = v_auth))
     and (p.ativo is distinct from (upper(trim(p.supervisao)) = any (v_chaves))
          or p.app_usuario_id is distinct from p_app_usuario_id
          or p.auth_user_id is distinct from coalesce(v_auth, p.auth_user_id));

  insert into public.programacao_usuario_supervisoes (app_usuario_id, auth_user_id, supervisao, ativo)
  select p_app_usuario_id, v_auth, n.nome, true
  from (
    select distinct on (upper(trim(t))) trim(t) as nome, upper(trim(t)) as chave
    from regexp_split_to_table(v_sup, '[,;|\n]+') t
    where trim(t) <> ''
  ) n
  where not exists (
    select 1 from public.programacao_usuario_supervisoes p
    where (p.app_usuario_id = p_app_usuario_id or (v_auth is not null and p.auth_user_id = v_auth))
      and upper(trim(p.supervisao)) = n.chave
  )
  on conflict do nothing;
end;
$$;

create or replace function public.trg_app_usuarios_sync_supervisoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- nunca derruba o salvamento do cadastro por causa da sincronização
  begin
    perform public.programacao_sync_supervisoes_usuario(new.id);
  exception when others then
    raise warning 'sync programacao_usuario_supervisoes falhou para %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_app_usuarios_sync_supervisoes on public.app_usuarios;
create trigger trg_app_usuarios_sync_supervisoes
after insert or update of supervisao, auth_user_id on public.app_usuarios
for each row execute function public.trg_app_usuarios_sync_supervisoes();

-- Backfill só de quem não tem nenhuma linha (resultado idêntico ao fallback atual).
-- Usuários com linhas divergentes do cadastro só se alinham na próxima edição do cadastro.
do $$
declare r record;
begin
  for r in
    select u.id from public.app_usuarios u
    where coalesce(trim(u.supervisao), '') <> ''
      and not exists (
        select 1 from public.programacao_usuario_supervisoes p
        where p.app_usuario_id = u.id or (u.auth_user_id is not null and p.auth_user_id = u.auth_user_id)
      )
  loop
    begin
      perform public.programacao_sync_supervisoes_usuario(r.id);
    exception when others then
      raise warning 'backfill supervisoes falhou para %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;
