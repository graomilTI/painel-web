-- O linter de segurança do Supabase acusou a policy de SELECT que acabamos de
-- criar: bucket público não precisa de SELECT em storage.objects pra servir
-- arquivo individual (isso já funciona via URL pública sem RLS); a policy só
-- serve pra permitir LISTAR todos os arquivos do bucket pra qualquer usuário
-- autenticado, o que é mais acesso do que o necessário pra notas fiscais
-- (documentos financeiros de vários setores). Nenhum código atual precisa
-- listar o bucket inteiro. Mantém insert/update, remove só o select.
drop policy if exists "notas_fiscais_select_authenticated" on storage.objects;
;
