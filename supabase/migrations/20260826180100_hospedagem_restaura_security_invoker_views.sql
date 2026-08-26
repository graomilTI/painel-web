-- O CREATE OR REPLACE VIEW da migration anterior (hospedagem_preferencia_gestor) resetou
-- o security_invoker=true aplicado em 20260820191932_hospedagem_views_security_invoker.sql,
-- fazendo as views voltarem a rodar com o dono (bypassa RLS por usuário). Restaura agora.
alter view public.hospedagem_painel_geral set (security_invoker = true);
alter view public.hospedagem_minhas_solicitacoes set (security_invoker = true);
