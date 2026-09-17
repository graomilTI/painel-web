-- Central de E-mails: faltava policy de INSERT no bucket email-anexos, então o worker
-- nunca conseguia subir os anexos (upload() retornava erro silencioso e storage_path
-- ficava nulo). Segue o mesmo padrão usado em contato-cliente-anexos/notas-fiscais.

create policy email_anexos_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-anexos');
