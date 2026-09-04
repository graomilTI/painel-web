-- A migration 20260831183742_gestor_email_privado.sql revogou EXECUTE das funções
-- private.email_* de authenticated/anon/public, mas essas funções são chamadas
-- dentro das próprias políticas de RLS das tabelas de e-mail e do bucket
-- email-anexos. SECURITY DEFINER não dispensa o chamador de ter EXECUTE — sem
-- isso toda query nessas tabelas falha com "permission denied for function".
grant usage on schema private to authenticated;
grant execute on function private.email_admin_access() to authenticated;
grant execute on function private.email_account_owned(uuid) to authenticated;
grant execute on function private.email_message_owned(uuid) to authenticated;
grant execute on function private.email_storage_owned(text) to authenticated;
