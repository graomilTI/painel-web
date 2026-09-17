-- Habilita Realtime (postgres_changes) nas tabelas que notificacoes-engine.js
-- já assina desde antes, mas que nunca estiveram na publicação supabase_realtime
-- (confirmado: pg_publication_tables retornava vazio). Sem isso, o painel
-- dependia 100% do polling de 5min como fallback silencioso.
-- RLS já está ativo nas 5 tabelas, então o Realtime respeita as políticas
-- de acesso por cliente normalmente.

alter publication supabase_realtime add table public.painel_notificacoes;
alter publication supabase_realtime add table public.operacional_os;
alter publication supabase_realtime add table public.programacao_dia;
alter publication supabase_realtime add table public.hospedagem_solicitacoes;
alter publication supabase_realtime add table public.patrimonios_historico_leituras;
