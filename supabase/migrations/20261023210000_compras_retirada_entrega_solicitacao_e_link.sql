-- Retirada ou entrega já na solicitação do gestor. O link de cotação só pergunta o frete ao fornecedor quando há entrega.
--   compras_solicitacoes.entrega_tipo / entrega_endereco -> o que o gestor pediu (Compras ainda ajusta ao cotar/comprar)
--   compras_cotacao_links.entrega_tipo                   -> 'entrega' (pergunta o frete) ou 'retirada' (link sem o campo de frete)
-- Links já existentes ficam como 'entrega': continuam perguntando o frete.
alter table public.compras_solicitacoes
  add column if not exists entrega_tipo text check (entrega_tipo in ('retirada', 'entrega')),
  add column if not exists entrega_endereco text;

alter table public.compras_cotacao_links
  add column if not exists entrega_tipo text not null default 'entrega' check (entrega_tipo in ('retirada', 'entrega'));
