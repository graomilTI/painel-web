insert into storage.buckets (id, name, public)
values ('comunicacao-midias', 'comunicacao-midias', true)
on conflict (id) do nothing;

create policy "comunicacao_midias_authenticated_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'comunicacao-midias');

create policy "comunicacao_midias_authenticated_select"
on storage.objects for select
to authenticated
using (bucket_id = 'comunicacao-midias');

create policy "comunicacao_midias_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'comunicacao-midias')
with check (bucket_id = 'comunicacao-midias');;
