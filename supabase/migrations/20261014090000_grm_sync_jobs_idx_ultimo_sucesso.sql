-- "Atualizado há..." no topo das telas: última execução com sucesso de cada agente.
-- A consulta (agente_id, status='sucesso', ordem por finalizado_em desc, limit 1) não tinha
-- índice próprio: o existente ordena por COALESCE(finalizado_em, created_at), então o banco
-- lia ~7 mil linhas pra devolver 1 (2,3 s no Dashboard, ~2.900 chamadas/dia).
create index concurrently if not exists idx_grm_sync_jobs_agente_sucesso_finalizado
  on public.grm_sync_jobs (agente_id, finalizado_em desc)
  where status = 'sucesso' and finalizado_em is not null;
