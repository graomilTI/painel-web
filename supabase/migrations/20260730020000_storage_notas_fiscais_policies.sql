-- O bucket "notas-fiscais" já existe (público) e o código já sobe arquivos nele
-- (assets/js/adm-compras.js, assets/js/comprovante-mobile.js, e agora
-- assets/js/upload-notas-fiscais.js), mas nunca teve nenhuma policy de RLS em
-- storage.objects pra ele — mesma lacuna já vista em relatorios-uploads
-- (20260710142000) e os-laudos (20260716190000), aqui nunca corrigida.
-- Sem isso, todo upload autenticado pra esse bucket falha silenciosamente
-- com "new row violates row-level security policy".
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
