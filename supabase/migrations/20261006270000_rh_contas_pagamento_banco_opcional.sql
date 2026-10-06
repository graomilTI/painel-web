-- Banco deixa de ser obrigatório no cadastro de contas (RH > Folha e Holerite > Contas).
-- O destino continua exigido pela constraint rh_contas_pagamento_destino_check
-- (chave PIX, ou agência + conta).
alter table public.rh_contas_pagamento
  alter column banco drop not null;
