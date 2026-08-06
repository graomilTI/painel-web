create policy "relatorios_uploads_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'relatorios-uploads');;
