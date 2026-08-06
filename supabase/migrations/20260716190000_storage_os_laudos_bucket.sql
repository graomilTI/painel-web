-- O bucket "os-laudos" (anexo de laudo/relatório na Etapa 1 da Programação,
-- ver assets/js/programacao-equipe.js) nunca existiu no Storage — todo
-- upload falhava com "Bucket not found" ("Erro de Bucket" reportado pelo
-- usuário). Criado público (mesmo padrão de notas-fiscais/propostas-pdf,
-- já que o código usa getPublicUrl() e não createSignedUrl()) + policies de
-- INSERT/UPDATE/SELECT pra authenticated (mesma lacuna de RLS já vista antes
-- em relatorios-uploads, ver migration 20260710142000).
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
using (bucket_id = 'os-laudos');
