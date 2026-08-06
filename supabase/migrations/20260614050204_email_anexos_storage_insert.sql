create policy email_anexos_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-anexos');;
