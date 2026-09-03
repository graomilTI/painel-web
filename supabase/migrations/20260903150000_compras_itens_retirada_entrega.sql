-- No ato da compra (envio ao Financeiro), Compras informa se o item é
-- retirado presencialmente ou entregue — se entrega, precisa do endereço.
alter table public.compras_itens add column entrega_tipo text check (entrega_tipo in ('retirada','entrega'));
alter table public.compras_itens add column entrega_endereco text;
