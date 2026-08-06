create policy "notas_fiscais_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'notas-fiscais');

create policy "notas_fiscais_update_authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'notas-fiscais')
with check (bucket_id = 'notas-fiscais');

create policy "notas_fiscais_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'notas-fiscais');
;
