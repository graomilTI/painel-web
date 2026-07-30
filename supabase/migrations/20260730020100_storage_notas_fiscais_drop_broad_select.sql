-- O linter de segurança do Supabase acusou a policy de SELECT criada na
-- migration anterior (20260730020000): bucket público não precisa de SELECT
-- em storage.objects pra servir arquivo individual (já funciona via URL
-- pública sem RLS); a policy só permitia LISTAR todos os arquivos do bucket
-- pra qualquer usuário autenticado — mais acesso do que necessário pra notas
-- fiscais (documentos financeiros de vários setores). Mantém insert/update.
drop policy if exists "notas_fiscais_select_authenticated" on storage.objects;
