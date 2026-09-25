-- Abertura de O.S.: cada usuário só enxerga/cria/edita solicitações da(s)
-- própria(s) supervisão(ões) (programacao_usuario_supervisoes). Master e quem
-- tem o módulo logistica_adm (Logística ADM, que decide as solicitações) veem tudo.
-- Substitui a policy aberta abertura_os_authenticated_all (using true).

create or replace function public.abertura_os_norm_sup(p text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAAAAAEEEEEEEEIIIIIIIIOOOOOOOOOOUUUUUUUUCCNN')), '\s+', ' ', 'g'));
$$;

create or replace function public.abertura_os_regional_liberada(p_regional text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_has_module(array['logistica_adm'], false)
    or exists (
      select 1
      from public.programacao_usuario_supervisoes s
      where s.ativo = true
        and (
          s.auth_user_id = auth.uid()
          or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid())
        )
        and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(p_regional)
        and public.abertura_os_norm_sup(p_regional) <> ''
    );
$$;

grant execute on function public.abertura_os_regional_liberada(text) to authenticated;

drop policy if exists abertura_os_authenticated_all on public.logistica_abertura_os;
drop policy if exists abertura_os_select_regional on public.logistica_abertura_os;
drop policy if exists abertura_os_insert_regional on public.logistica_abertura_os;
drop policy if exists abertura_os_update_regional on public.logistica_abertura_os;
drop policy if exists abertura_os_delete_adm on public.logistica_abertura_os;

create policy abertura_os_select_regional on public.logistica_abertura_os
  for select to authenticated
  using (public.abertura_os_regional_liberada(regional));

create policy abertura_os_insert_regional on public.logistica_abertura_os
  for insert to authenticated
  with check (public.abertura_os_regional_liberada(regional));

create policy abertura_os_update_regional on public.logistica_abertura_os
  for update to authenticated
  using (public.abertura_os_regional_liberada(regional))
  with check (public.abertura_os_regional_liberada(regional));

create policy abertura_os_delete_adm on public.logistica_abertura_os
  for delete to authenticated
  using (public.painel_has_module(array['logistica_adm'], false));
