-- Bucket "relatorios-uploads" é privado (public=false), mas não tinha nenhuma
-- policy de RLS em storage.objects. Sem policy, createSignedUrl() falha pra
-- todo mundo (exceto service role), então o DRE nunca conseguia reler os
-- arquivos de Despesas/Resultado Diário/Notas Fiscais importados manualmente
-- pela tela Relatórios (download silenciosamente falhava, ficando zerado no DRE).
create policy "relatorios_uploads_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'relatorios-uploads');
