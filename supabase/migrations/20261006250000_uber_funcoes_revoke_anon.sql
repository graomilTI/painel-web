-- O Supabase concede EXECUTE a anon/authenticated por padrão em funções novas do schema public;
-- "revoke ... from public" não tira esses grants explícitos. As funções do Uber criadas hoje
-- (gorjeta -> Caixa e conversão de GPS) ficam assim:
--  * ajudantes que criam job e funções de gatilho: só o banco chama (gatilhos e RPCs security
--    definer), ninguém pelo PostgREST — sem isso qualquer chave pública poderia criar jobs;
--  * RPCs dos botões do painel: só usuário logado (elas também checam auth.uid()).

revoke all on function public.uber_gorjeta_solicitar_job(text, text) from public, anon, authenticated;
revoke all on function public.uber_gps_solicitar_job(text, text) from public, anon, authenticated;
revoke all on function public.uber_gorjeta_enfileirar_caixa() from public, anon, authenticated;
revoke all on function public.uber_gps_enfileirar_importacao() from public, anon, authenticated;

revoke all on function public.uber_gorjeta_usuario_tem_acesso() from public, anon;
revoke all on function public.uber_gorjeta_reenviar_caixa(uuid[]) from public, anon;
revoke all on function public.uber_gps_solicitar(uuid[]) from public, anon;

grant execute on function public.uber_gorjeta_usuario_tem_acesso() to authenticated;
grant execute on function public.uber_gorjeta_reenviar_caixa(uuid[]) to authenticated;
grant execute on function public.uber_gps_solicitar(uuid[]) to authenticated;
