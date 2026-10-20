-- Pendência de NF/pagamento do estoque no fornecedor passa a ser uma solicitação normal do módulo Compras
-- (cotação → pagamento no Financeiro → NF). A baixa guarda o vínculo com a solicitação e o item criados.
-- Depende de 20261020140000_compras_estoque_fornecedor_movimentos.sql.

alter table public.compras_estoque_fornecedor_mov
  add column if not exists compras_solicitacao_id uuid references public.compras_solicitacoes(id) on delete set null,
  add column if not exists compras_item_id uuid references public.compras_itens(id) on delete set null;

create index if not exists idx_compras_estoque_forn_mov_compras_item on public.compras_estoque_fornecedor_mov(compras_item_id) where compras_item_id is not null;
