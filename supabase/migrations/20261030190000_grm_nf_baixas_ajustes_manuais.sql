-- Baixas (Painel de Notas Fiscais > Baixas): campos corrigidos à mão na tela
-- (botão ✎ Editar) pra comprovantes em revisão manual ou com erro:
--   { favorecido_nome?, valor?, data_pagamento?, parcelas?: [DOC ou pinCode, ...] }
-- O agente de baixa aplica por cima da leitura do comprovante a cada
-- reprocessamento; `parcelas` indica a(s) parcela(s) em aberto no GRM a baixar.

alter table public.grm_nf_baixas
  add column if not exists ajustes_manuais jsonb;

comment on column public.grm_nf_baixas.ajustes_manuais is
  'Correções digitadas na tela de Baixas (favorecido_nome, valor, data_pagamento, parcelas[DOC/pinCode]); o agente aplica sobre a leitura do comprovante.';
