-- Restaura funções de contexto/permissão que existiam no projeto antigo
-- (definidas em supabase/migrations/20260614_security_hardening.sql) e que
-- não foram recriadas na migração para o projeto Supabase BR. Várias
-- migrations recentes (equipe_gestores_administracao, equipe_plantao_setor_permissoes)
-- dependem delas para as políticas de RLS.

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
