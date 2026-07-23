-- Advisor de segurança apontou que a função de trigger
-- operacional_laudos_calcular_suspeita() (SECURITY DEFINER) ficava exposta
-- como RPC chamável por anon/authenticated. Funções com retorno `trigger`
-- só podem rodar em contexto de trigger (Postgres recusa chamada direta),
-- mas revoga o EXECUTE mesmo assim por higiene/consistência com o restante
-- do projeto (ver revoke em registrar_localizacao_diaria_colaboradores).
revoke execute on function public.operacional_laudos_calcular_suspeita() from public, anon, authenticated;
