-- Bucket privado para anexos das telas de RH (atestados, advertências, exames,
-- CAT, holerites, rescisões). Privado (diferente do os-laudos) porque são
-- documentos sensíveis de pessoa física — o front abre via createSignedUrl.
-- Policies restritas ao bucket, padrão authenticated do sistema.
insert into storage.buckets (id, name, public)
values ('rh-anexos', 'rh-anexos', false)
on conflict (id) do nothing;

drop policy if exists "rh_anexos_insert_authenticated" on storage.objects;
create policy "rh_anexos_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'rh-anexos');

drop policy if exists "rh_anexos_select_authenticated" on storage.objects;
create policy "rh_anexos_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'rh-anexos');

drop policy if exists "rh_anexos_update_authenticated" on storage.objects;
create policy "rh_anexos_update_authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'rh-anexos')
with check (bucket_id = 'rh-anexos');

drop policy if exists "rh_anexos_delete_authenticated" on storage.objects;
create policy "rh_anexos_delete_authenticated"
on storage.objects for delete
to authenticated
using (bucket_id = 'rh-anexos');
;
