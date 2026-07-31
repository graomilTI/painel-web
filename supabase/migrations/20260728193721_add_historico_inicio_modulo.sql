-- Novo módulo "Histórico" no grupo INÍCIO (checklist item #4): 4 gráficos
-- (meta, leitura de patrimônios, produção diária, produção por colaborador),
-- visão por regional para Gestor e panorama geral para Master/Admin.
insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
values ('historico', 'Histórico', 'inicio', 'bar-chart', '/painel/historico.html', 15, true)
on conflict (codigo) do nothing;

insert into public.app_perfil_modulo (perfil_id, modulo_id, pode_ver, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select p.id, m.id, true, false, false, false, false
from public.app_perfis p
cross join public.app_modulos m
where m.codigo = 'historico'
  and p.codigo in ('master', 'adm', 'gestor', 'operacional', 'consulta')
on conflict (perfil_id, modulo_id) do update set pode_ver = true;;
