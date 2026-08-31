-- EPIs comprados via Gestor > Compras (Solicitação) agora geram a ficha em
-- Recursos Humanos > Segurança do Trabalho > EPIs, aba "Comprados", em vez de
-- passar por uma aprovação do Gestor em Compras (aba removida). Este campo
-- marca quando a ficha desse item já foi gerada pelo RH, para separar o card
-- da aba "Comprados" (pendente) da "Concluídas" (já fichado) sem depender de
-- compras_itens.status, que continua pertencendo ao fluxo normal de Compras.
ALTER TABLE public.compras_itens
  ADD COLUMN IF NOT EXISTS epi_ficha_gerada_em timestamp with time zone;
