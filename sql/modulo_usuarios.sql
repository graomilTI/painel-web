-- Módulo Usuários e Acessos
-- Execute no SQL Editor do Supabase

insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
values ('ADMIN_USUARIOS', 'Usuários e Acessos', 'administracao', 'users', './admin-usuarios.html', 900, true)
on conflict (codigo) do update
set
  nome = excluded.nome,
  categoria = excluded.categoria,
  icone = excluded.icone,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = true,
  updated_at = now();

-- garante permissão só para master
insert into public.app_perfil_modulo (
  perfil_id, modulo_id, pode_ver, pode_criar, pode_editar, pode_excluir, pode_aprovar
)
select
  p.id,
  m.id,
  true, true, true, true, true
from public.app_perfis p
join public.app_modulos m
  on m.codigo = 'ADMIN_USUARIOS'
where p.codigo = 'master'
on conflict (perfil_id, modulo_id) do update
set
  pode_ver = excluded.pode_ver,
  pode_criar = excluded.pode_criar,
  pode_editar = excluded.pode_editar,
  pode_excluir = excluded.pode_excluir,
  pode_aprovar = excluded.pode_aprovar,
  updated_at = now();

-- opcional: remove o módulo dos demais perfis
delete from public.app_perfil_modulo pm
using public.app_perfis p, public.app_modulos m
where pm.perfil_id = p.id
  and pm.modulo_id = m.id
  and m.codigo = 'ADMIN_USUARIOS'
  and p.codigo <> 'master';
