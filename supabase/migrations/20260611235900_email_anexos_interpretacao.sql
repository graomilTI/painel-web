-- Central de E-mails: visualização/download de anexos + dados extraídos (XML NF-e/NFS-e, IA para PDF/imagem)

alter table public.email_attachments
  add column if not exists dados_extraidos jsonb not null default '{}'::jsonb,
  add column if not exists interpretacao_status text,
  add column if not exists interpretado_em timestamptz;

-- Permite gerar signed URLs para visualizar/baixar anexos no painel.
drop policy if exists email_anexos_select on storage.objects;
create policy email_anexos_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'email-anexos');
