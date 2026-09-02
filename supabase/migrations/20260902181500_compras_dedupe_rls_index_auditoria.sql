-- Três limpezas independentes encontradas na Fase 1 de organização de Compras:
--
-- 1) compras_solicitacoes tinha 4 policies granulares (insert/select/update/
--    delete) E uma policy FOR ALL cobrindo o mesmo escopo — redundante.
--    compras_itens já seguia o padrão limpo (só a policy FOR ALL); replicamos
--    aqui.
-- 2) idx_compras_itens_solicitacao e idx_compras_itens_solicitacao_id indexam
--    a mesma coluna (solicitacao_id) — mantemos só o de nome mais claro.
-- 3) trg_auditoria em compras_itens estava rotulado 'notas-fiscais' em vez de
--    'compras'. Efeito real: o filtro "Compras" em Logs de Usuários
--    (auditoria-central.js/logs-usuarios.js, que já lista 'compras' como
--    opção) nunca mostrava as mudanças de compras_itens — elas apareciam sob
--    o filtro "Notas Fiscais" por engano.

drop policy if exists "authenticated delete compras_solicitacoes" on public.compras_solicitacoes;
drop policy if exists "authenticated insert compras_solicitacoes" on public.compras_solicitacoes;
drop policy if exists "authenticated read compras_solicitacoes" on public.compras_solicitacoes;
drop policy if exists "authenticated update compras_solicitacoes" on public.compras_solicitacoes;

drop index if exists public.idx_compras_itens_solicitacao;

drop trigger if exists trg_auditoria on public.compras_itens;
create trigger trg_auditoria after insert or delete or update on public.compras_itens
  for each row execute function fn_registrar_auditoria('compras');
