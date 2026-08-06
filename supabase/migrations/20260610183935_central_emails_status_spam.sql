alter table public.email_messages drop constraint email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check
  check (status in ('NOVO','PENDENTE','RESPONDER','RESPONDIDO','RESOLVIDO','ARQUIVADO','IGNORADO','ERRO','SPAM'));
;
