-- Frete na resposta do fornecedor: quem paga (empresa = fornecedor, cliente = Grão 1000) e a estimativa quando é do cliente.
alter table public.compras_cotacao_respostas
  add column if not exists frete_pagador text check (frete_pagador in ('empresa', 'cliente')),
  add column if not exists frete_valor numeric check (frete_valor is null or frete_valor >= 0);
