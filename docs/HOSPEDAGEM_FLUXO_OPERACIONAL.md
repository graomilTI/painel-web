# Fluxo operacional de hospedagem

Atualização de 11/08/2026:

- solicitações abertas são agrupadas por cidade para cotação e reserva conjunta, preservando múltiplos colaboradores e composições de quartos;
- solicitações consecutivas do mesmo colaborador e cidade são incorporadas à reserva como extensão;
- checkout pode ser total ou parcial por colaborador e gera lotes financeiros separados, reagrupados por hotel na tela de pagamentos;
- o total é recalculado pelas diárias efetivamente hospedadas, com suporte a vários extras e descontos;
- pagamentos são classificados automaticamente como parcial, total ou adiantamento; créditos ficam disponíveis para débito em reservas futuras;
- a taxa bancária opcional de R$ 2,00 integra o valor do comprovante, sem alterar o valor destinado ao fornecedor;
- comprovante e NFS-e permanecem anexos ao lote, e a continuidade fiscal acontece no módulo de Notas Fiscais.

## Persistência

A migration `20260811135254_hospedagem_checkout_adiantamentos.sql` adiciona o vínculo individual dos hóspedes à reserva, lotes de checkout, histórico de créditos/débitos de adiantamento e os campos de classificação do pagamento.
