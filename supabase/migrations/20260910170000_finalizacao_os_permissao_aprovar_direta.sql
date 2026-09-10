-- Bug: usuários com módulo liberado DIRETAMENTE (app_usuario_modulos), sem
-- vínculo por perfil, nunca conseguiam aprovar/editar nada — rpc_get_user_context()
-- fixava pode_criar/pode_editar/pode_excluir/pode_aprovar = false pra esse caminho,
-- e ainda por cima o CTE de módulos por perfil só entra em jogo quando o usuário
-- NÃO tem nenhum módulo direto (exists check é global, não por módulo). Resultado:
-- o botão ✓/× de "Logística > O.S. > Finalização" (decidir_finalizacao_os_logistica,
-- que exige can_edit/can_create/can_approve) retornava 403 pra TODA a equipe que
-- tem esse módulo liberado direto (10 usuários, incl. Bruna), e só "funcionava"
-- quando por acaso um usuário master processava a fila.
--
-- Fix: app_usuario_modulos ganha colunas de permissão granular (default false,
-- não muda nada pra ninguém que já usava só pode_ver); rpc_get_user_context() passa
-- a ler essas colunas em vez de fixar false; e os usuários que hoje trabalham a
-- fila de Finalização de O.S. ganham pode_aprovar=true nesse módulo específico.

alter table public.app_usuario_modulos
  add column if not exists pode_criar boolean not null default false,
  add column if not exists pode_editar boolean not null default false,
  add column if not exists pode_excluir boolean not null default false,
  add column if not exists pode_aprovar boolean not null default false;

create or replace function public.rpc_get_user_context()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
with usuario as (
  select
    u.id,
    u.auth_user_id,
    u.nome,
    u.email,
    u.status,
    u.setor,
    u.empresa,
    u.coordenacao,
    u.supervisao,
    u.perfil_id,
    p.codigo as perfil_codigo,
    p.nome as perfil_nome
  from public.app_usuarios u
  left join public.app_perfis p on p.id = u.perfil_id
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.email(), ''))
  limit 1
),
modulos_usuario as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    true as pode_ver,
    um.pode_criar,
    um.pode_editar,
    um.pode_excluir,
    um.pode_aprovar
  from usuario u
  join public.app_usuario_modulos um on um.usuario_id = u.id
  join public.app_modulos m on m.id = um.modulo_id
  where m.ativo = true
),
modulos_perfil as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    pm.pode_ver,
    pm.pode_criar,
    pm.pode_editar,
    pm.pode_excluir,
    pm.pode_aprovar
  from usuario u
  join public.app_perfil_modulo pm on pm.perfil_id = u.perfil_id
  join public.app_modulos m on m.id = pm.modulo_id
  where m.ativo = true
    and pm.pode_ver = true
),
modulos_master as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    true as pode_ver,
    true as pode_criar,
    true as pode_editar,
    true as pode_excluir,
    true as pode_aprovar
  from public.app_modulos m
  where m.ativo = true
),
modulos_base as (
  -- Se houver módulos liberados diretamente no usuário, eles prevalecem.
  -- Se não houver, usa os módulos do perfil.
  select * from modulos_master where exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
  union all
  select * from modulos_usuario where not exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
  union all
  select * from modulos_perfil
  where not exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
    and not exists (select 1 from modulos_usuario)
),
modulos_final as (
  select distinct on (codigo)
    codigo,
    nome,
    rota,
    icone,
    categoria,
    ordem,
    pode_ver,
    pode_criar,
    pode_editar,
    pode_excluir,
    pode_aprovar
  from modulos_base
  order by codigo, ordem
)
select jsonb_build_object(
  'user', jsonb_build_object(
    'id', coalesce(u.auth_user_id, u.id),
    'app_usuario_id', u.id,
    'name', u.nome,
    'email', u.email,
    'role', coalesce(u.perfil_codigo, u.perfil_nome, 'usuario'),
    'status', u.status,
    'active', lower(coalesce(u.status, '')) = 'ativo',
    'is_master', lower(coalesce(u.perfil_codigo, '')) = 'master'
  ),
  'department', jsonb_build_object(
    'name', coalesce(u.setor, u.perfil_nome),
    'code', lower(coalesce(u.setor, u.perfil_codigo, ''))
  ),
  'empresa', u.empresa,
  'coordenacao', u.coordenacao,
  'supervisao', u.supervisao,
  'modules', coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', mf.codigo,
      'name', mf.nome,
      'route', mf.rota,
      'icon', mf.icone,
      'category', mf.categoria,
      'order', mf.ordem,
      'can_view', mf.pode_ver,
      'can_create', mf.pode_criar,
      'can_edit', mf.pode_editar,
      'can_delete', mf.pode_excluir,
      'can_approve', mf.pode_aprovar
    ) order by mf.ordem, mf.nome)
    from modulos_final mf
  ), '[]'::jsonb)
)
from usuario u;
$$;

-- Libera aprovar/recusar pra quem já trabalha a fila de Finalização de O.S. e só
-- tinha o módulo liberado direto (view-only até aqui).
update public.app_usuario_modulos um
   set pode_aprovar = true,
       pode_editar = true,
       updated_at = now()
  from public.app_modulos m
 where um.modulo_id = m.id
   and lower(m.codigo) = 'logistica_finalizacao_os'
   and um.ativo = true;
