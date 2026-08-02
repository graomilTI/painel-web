-- Configura Pernoite sem alterar o CHECK de origem já existente.
-- A Edge Function usa a chave/tipo/valor; a origem fica como EXTRA apenas
-- para manter compatibilidade com o conjunto de origens permitido no banco.

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
  'ESTADIA_PERNOITE',
  'EXTRA',
  'Pernoite',
  30.00,
  true,
  false,
  true,
  1,
  true,
  'Estadia Pernoite: libera R$ 30,00 no Caixa Operacional.'
)
on conflict (chave) do update
set
  tipo_grm = excluded.tipo_grm,
  valor_padrao = excluded.valor_padrao,
  exibir = excluded.exibir,
  auto = excluded.auto,
  carga_nhe = excluded.carga_nhe,
  max_mov_dia = excluded.max_mov_dia,
  ativo = excluded.ativo,
  observacao = excluded.observacao,
  updated_at = now();
