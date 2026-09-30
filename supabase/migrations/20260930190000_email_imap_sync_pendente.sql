-- Sincronização painel -> IMAP da caixa pessoal do Gestor.
-- O painel só altera o banco (lido, favorito, arquivado, excluído). Ao gravar essas
-- mudanças ele marca imap_pendente = true e o email-worker aplica no servidor de e-mail
-- (flags \Seen/\Flagged e mover para Arquivo/Lixeira), depois limpa a marca.
--   imap_mailbox: pasta IMAP onde o worker deixou a mensagem por último (null = pasta de origem)
--   imap_erro:    motivo quando o worker não conseguiu aplicar (ex.: mensagem sumiu do servidor)
alter table public.email_messages
  add column if not exists imap_pendente boolean not null default false,
  add column if not exists imap_mailbox text,
  add column if not exists imap_erro text;

create index if not exists email_messages_imap_pendente_idx
  on public.email_messages (account_id)
  where imap_pendente;
