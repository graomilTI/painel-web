-- Suporta baixa de um comprovante único que liquida a SOMA de 2+ parcelas em
-- aberto da mesma pessoa/empresa (ex.: MAURICIO ALENCAR DE SOUZA, 09/2026:
-- nenhuma parcela isolada batia com o valor do comprovante, mas duas juntas
-- batiam exatamente). pin_code continua com a lista (comma-separated) pra
-- não quebrar telas antigas; pin_codes_json guarda cada parcela com seu
-- próprio valor, usado pelo agente pra montar o payInvoice/payment com 1
-- entrada por parcela.
alter table public.grm_nf_baixas
  add column if not exists pin_codes_json jsonb not null default '[]'::jsonb;

comment on column public.grm_nf_baixas.pin_codes_json is
  'Parcelas resolvidas pra esta baixa: [{pinCode, patCode, valor, pinDocNumber}, ...]. Mais de 1 item = comprovante único liquidando a soma de várias parcelas em aberto.';
