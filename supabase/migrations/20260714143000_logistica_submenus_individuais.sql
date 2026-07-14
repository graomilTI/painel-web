-- Submenus administrativos da Logística em páginas independentes.
-- /painel/logistica permanece exclusivo do fluxo Gestor.

insert into public.app_modulos (codigo, nome, descricao, categoria, rota, ordem, ativo)
values
  ('logistica_adm', 'Painel de Logística', 'O.S. e rotinas administrativas da Logística.', 'LOGÍSTICA', 'logistica-adm-os', 900, true),
  ('logistica_informativos', 'Informativos', 'Informativos operacionais e relatórios periódicos da Logística.', 'LOGÍSTICA', 'logistica-informativos', 905, true),
  ('logistica_finalizacao_os', 'Finalização de O.S.', 'Fila administrativa de finalização de ordens de serviço.', 'LOGÍSTICA', 'logistica-finalizacao', 910, true),
  ('logistica_classificadores', 'Classificadores', 'Monitor de classificadores e alertas de atualização.', 'LOGÍSTICA', 'logistica-classificadores', 920, true),
  ('logistica_conferencias', 'Conferências', 'Conferências operacionais da Logística.', 'LOGÍSTICA', 'logistica-conferencias', 930, true),
  ('logistica_exportacoes', 'Exportações clientes', 'Exportações de dados e cargas por cliente.', 'LOGÍSTICA', 'logistica-exportacoes', 940, true),
  ('logistica_relatorios_cliente', 'Relatórios ao Cliente', 'Geração e envio de relatórios aos clientes.', 'LOGÍSTICA', 'logistica-relatorios', 950, true),
  ('logistica_btg', 'BTG', 'Rotinas e conferências específicas do cliente BTG.', 'LOGÍSTICA', 'btg-logistica', 960, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  categoria = excluded.categoria,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  updated_at = now();
