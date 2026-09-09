-- Módulo de permissão pra liberar Conferência > Deslocamento em Usuários e Acessos
-- (a tela já existia desde 31/08, mas nunca tinha entrado em app_modulos — por
-- isso não aparecia na lista de módulos pra marcar/desmarcar acesso).
insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo, descricao)
values (
  'conferencia_deslocamento',
  'Deslocamento',
  'CONFERÊNCIA',
  'route',
  '/painel/conferencia-deslocamento',
  26,
  true,
  'Conferência de deslocamentos e configuração de tipo/tarifa por colaborador.'
)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  icone = excluded.icone,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  descricao = excluded.descricao,
  updated_at = now();
