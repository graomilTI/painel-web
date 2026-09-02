-- compras_grupos: criada em 20260727090000_reestruturacao_completa.sql para um
-- recurso de agrupamento por fornecedor (plano 7.2) que nunca foi ligado ao
-- frontend — zero referências em assets/js e zero linhas em produção
-- (confirmado antes de aplicar esta migration). O "Ver grupo" que existe hoje
-- em adm-compras.js agrupa compras_itens por lista de ids em memória, não usa
-- essa tabela.
drop table if exists public.compras_grupos;

-- Colunas mortas em compras_itens: chave_pix e link_pagamento, sem nenhuma
-- referência em assets/js e 100% NULL em produção (confirmado antes de
-- aplicar esta migration).
alter table public.compras_itens drop column if exists chave_pix;
alter table public.compras_itens drop column if exists link_pagamento;

-- Colunas legadas em compras_solicitacoes (modelo antigo "solicitação = 1
-- item", hoje tudo passa por compras_itens): item e quantidade 100% NULL em
-- produção (confirmado antes de aplicar esta migration).
alter table public.compras_solicitacoes drop column if exists item;
alter table public.compras_solicitacoes drop column if exists quantidade;
