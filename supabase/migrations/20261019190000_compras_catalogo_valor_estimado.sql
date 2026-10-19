-- Valor estimado de reposição de cada material do catálogo. Usado pela aba
-- Desligados (Relatórios de Patrimônios) para estimar o lançamento em Caixa do
-- material que não foi recolhido. Nulo = sem estimativa cadastrada.
alter table public.compras_catalogo
  add column if not exists valor_estimado numeric(12,2)
  check (valor_estimado is null or valor_estimado >= 0);

comment on column public.compras_catalogo.valor_estimado is
  'Estimativa (R$) para lançar em Caixa quando o material não é devolvido pelo desligado.';
