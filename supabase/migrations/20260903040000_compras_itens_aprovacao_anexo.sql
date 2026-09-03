-- Espaço pra anexar o print/comprovante de quem aprovou o item em Aprovação,
-- opcional, junto do nome de quem aprovou. Coluna própria — não reaproveita
-- comprovante_url (que é do comprovante de pagamento do Financeiro, usado
-- pelo filtro de Notas Fiscais mais adiante no fluxo).
alter table public.compras_itens add column aprovacao_anexo_url text;
