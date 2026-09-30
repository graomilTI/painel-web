-- Sincronização IMAP -> painel (caixa pessoal do Gestor).
-- Depois que uma mensagem muda de pasta no servidor (webmail ou pelo próprio painel), o UID
-- antigo deixa de valer. Estas colunas guardam onde ela está agora (pasta já está em
-- imap_mailbox): UID e UIDVALIDITY nessa pasta. Enquanto forem null, vale o par original
-- (uid + raw.mailbox/raw.uid_validity) gravado quando o e-mail foi importado.
alter table public.email_messages
  add column if not exists imap_uid bigint,
  add column if not exists imap_uid_validity text;
