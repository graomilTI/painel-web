-- Despesas nativas do embarque por tipo de contrato. Elas são adicionadas à
-- programação, nunca usadas como substitutas das despesas escolhidas pelo gestor.

alter table public.grm_despesas_tipos_config
  drop constraint if exists grm_despesas_tipos_config_origem_check;

alter table public.grm_despesas_tipos_config
  add constraint grm_despesas_tipos_config_origem_check
  check (origem in ('ALIMENTACAO', 'DESLOCAMENTO', 'EXTRA', 'VINCULO'));

insert into public.grm_despesas_tipos_config
  (chave, origem, tipo_grm, valor_padrao, exibir, auto, carga_nhe, max_mov_dia, ativo, observacao)
values
  ('VINCULO_SALARIO_INTERMITENTE', 'VINCULO', 'Salário de Intermitente', null, true, true, true, 1, true,
   'Despesa nativa adicionada ao embarque de colaborador Intermitente; o limite usa colaborador_cruzamento.salario.'),
  ('VINCULO_SERVICOS_TERCEIRIZADOS', 'VINCULO', 'Serviços Terceirizados', null, true, true, true, 1, true,
   'Despesa nativa adicionada ao embarque de colaborador Diarista; o limite usa colaborador_cruzamento.salario.')
on conflict (chave) do update set
  origem = excluded.origem,
  tipo_grm = excluded.tipo_grm,
  exibir = excluded.exibir,
  auto = excluded.auto,
  carga_nhe = excluded.carga_nhe,
  max_mov_dia = excluded.max_mov_dia,
  ativo = excluded.ativo,
  observacao = excluded.observacao;
