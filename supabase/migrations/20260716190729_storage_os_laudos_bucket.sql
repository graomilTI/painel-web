insert into storage.buckets (id, name, public)
values ('os-laudos', 'os-laudos', true)
on conflict (id) do nothing;

create policy "os_laudos_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'os-laudos');

create policy "os_laudos_update_authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'os-laudos')
with check (bucket_id = 'os-laudos');

create policy "os_laudos_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'os-laudos');;
