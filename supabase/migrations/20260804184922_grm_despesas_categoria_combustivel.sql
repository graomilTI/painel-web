-- "Outros" continua sendo um campo livre e não vira regra por aproximação.
-- A única exceção segura é quando a descrição informa explicitamente
-- Combustível, categoria já observada no dropdown do GRM.
insert into public.grm_despesas_tipos_config (
  chave,
  origem,
  tipo_grm,
  valor_padrao,
  exibir,
  auto,
  carga_nhe,
  max_mov_dia,
  ativo,
  observacao
)
values (
  'EXTRA_COMBUSTIVEL',
  'EXTRA',
  'Combustivel',
  null,
  true,
  false,
  true,
  1,
  true,
  'Mapeado somente quando OUTROS possui descrição explícita de combustível; o valor vem do lançamento.'
)
on conflict (chave) do update
set tipo_grm = excluded.tipo_grm,
    ativo = excluded.ativo,
    observacao = excluded.observacao,
    updated_at = now();
