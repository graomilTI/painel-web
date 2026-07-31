-- PostgREST precisa de SELECT em email_accounts para resolver os embeds
-- "email_accounts(nome,email)" usados em email_messages e email_outbox.
-- Concede apenas as colunas necessárias (id para o join, nome/email exibidas),
-- sem expor password_cipher/username/hosts.
grant select (id, nome, email) on public.email_accounts to authenticated;
;
