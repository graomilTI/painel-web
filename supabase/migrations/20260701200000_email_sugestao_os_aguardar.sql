-- Guarda a sugestão de marcar uma OS como AGUARDAR quando o worker detecta, numa tabela de
-- programação de embarques anexada/embutida no e-mail, uma linha com status "Suspenso".
-- Fica só como sugestão pendente de aprovação manual na Central de E-mails; o worker não
-- altera public.operacional_os sozinho.
alter table public.email_messages
  add column if not exists os_sugestao_aguardar jsonb;
