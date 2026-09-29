-- Abertura de O.S.: a RLS de 25/09 só olhava programacao_usuario_supervisoes, que não
-- é mais preenchida para cadastros criados/editados depois do backfill de 29/06 (última
-- escrita em 05/08) — ~60 usuários ativos ficaram sem ver/criar solicitações (caso: SARA
-- KELCI RIBAS). Passa a usar o campo legado app_usuarios.supervisao quando o usuário não
-- tem nenhuma linha ativa na tabela, igual a public.programacao_listar_supervisoes().

create or replace function public.abertura_os_regional_liberada(p_regional text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_has_module(array['logistica_adm'], false)
    or (
      public.abertura_os_norm_sup(p_regional) <> ''
      and (
        exists (
          select 1
          from public.programacao_usuario_supervisoes s
          where s.ativo = true
            and (
              s.auth_user_id = auth.uid()
              or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid())
            )
            and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(p_regional)
        )
        or (
          not exists (
            select 1
            from public.programacao_usuario_supervisoes s
            where s.ativo = true
              and (
                s.auth_user_id = auth.uid()
                or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid())
              )
          )
          and exists (
            select 1
            from public.app_usuarios u
            cross join lateral regexp_split_to_table(coalesce(u.supervisao, ''), '[,;|\n]+') sup
            where u.auth_user_id = auth.uid()
              and public.abertura_os_norm_sup(sup) = public.abertura_os_norm_sup(p_regional)
          )
        )
      )
    );
$$;

grant execute on function public.abertura_os_regional_liberada(text) to authenticated;
