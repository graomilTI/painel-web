-- Suporta baixa PARCIAL "confiável" quando o comprovante não bate com o
-- valor cheio de nenhuma parcela (nem isolado, nem somado com outro
-- comprovante já na fila), mas existe exatamente 1 parcela em aberto pro
-- mesmo favorecido+empresa e o valor pago não excede a parcela — ex.: um
-- adiantamento ou pagamento em 2 partes onde o segundo comprovante só chega
-- depois. Descoberto ao vivo em 09/09/2026 (caso MAURICIO ALENCAR DE SOUZA)
-- que o GRM fecha a parcela (pinStatus='P') já na PRIMEIRA chamada de
-- payInvoice/payment, não importa o valor enviado — não existe pagamento
-- parcial "de verdade" acumulando no GRM. Por isso o controle do saldo que
-- falta fica só no nosso lado: quando um novo comprovante do mesmo
-- favorecido+empresa bate exatamente com o saldo_pendente, ele NÃO manda
-- outra chamada de payInvoice/payment pro GRM (o GRM recusa com
-- "payInvoiceAlreadyPaid") — só anexa o comprovante no pinCode já fechado
-- (payInvoice/uploadFiles, que não mexe no status) e zera o saldo aqui.
alter table public.grm_nf_baixas
  add column if not exists parcela_valor_total numeric(18,2),
  add column if not exists saldo_pendente numeric(18,2) not null default 0;

comment on column public.grm_nf_baixas.parcela_valor_total is
  'Valor cheio (pinInstallmentValue) da parcela do GRM casada com esta baixa, capturado no momento do match.';
comment on column public.grm_nf_baixas.saldo_pendente is
  'Quanto ainda falta pra completar parcela_valor_total depois desta baixa. >0 só em BAIXADO_PARCIAL; zerado quando um comprovante seguinte completa o valor.';

alter table public.grm_nf_baixas drop constraint if exists grm_nf_baixas_status_check;
alter table public.grm_nf_baixas add constraint grm_nf_baixas_status_check check (status in (
  'NOVO', 'PROCESSANDO', 'AGUARDANDO_REVISAO', 'VALIDADO',
  'BAIXADO', 'BAIXADO_PARCIAL', 'DRY_RUN_OK', 'DIVIDIDO', 'DUPLICADO', 'ERRO', 'CANCELADO'
));
