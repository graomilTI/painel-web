-- cc_anexos_read e notas_fiscais_public_select estavam com role "public" (inclui anon),
-- permitindo listagem/leitura sem login. Restringe a authenticated.

DROP POLICY IF EXISTS cc_anexos_read ON storage.objects;
CREATE POLICY cc_anexos_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contato-cliente-anexos');

DROP POLICY IF EXISTS notas_fiscais_public_select ON storage.objects;
CREATE POLICY notas_fiscais_public_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais');
;
