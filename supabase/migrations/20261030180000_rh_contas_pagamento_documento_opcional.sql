-- Aba "Contas" (Folha e Holerite): o CPF/CNPJ do titular/beneficiário deixa de
-- ser obrigatório. Às vezes só se tem a chave PIX. Quando informado, continua
-- precisando ter 11 (CPF) ou 14 (CNPJ) dígitos.
--
-- O agente de baixa de NF já trata documento ausente: sem documento, casa o
-- comprovante pelo nome do titular/beneficiário.

alter table public.rh_contas_pagamento
  alter column titular_documento drop not null;

alter table public.rh_contas_pagamento
  drop constraint if exists rh_contas_pagamento_titular_documento_check;

alter table public.rh_contas_pagamento
  add constraint rh_contas_pagamento_titular_documento_check
  check (titular_documento is null or titular_documento ~ '^([0-9]{11}|[0-9]{14})$');

comment on column public.rh_contas_pagamento.titular_documento is
  'CPF (11) ou CNPJ (14) do titular da conta, só dígitos. Opcional (às vezes só há a chave PIX).';
