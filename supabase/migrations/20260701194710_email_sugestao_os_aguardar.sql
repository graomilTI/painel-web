alter table public.email_messages
  add column if not exists os_sugestao_aguardar jsonb;
;
