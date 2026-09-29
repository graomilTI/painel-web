-- Registra 'sync-resultado-diario-reconciliacao' em grm_sync_agent_settings.
-- Achado 29/09 comparando o painel com o GRM: o Resultado Diário só é
-- ressincronizado numa janela de 7 dias (sync-resultado-diario), então correções
-- feitas no GRM depois disso nunca chegavam ao banco - jul/ago com ~0,3% de
-- diferença no embarcado e set com -0,4% nas toneladas (jan/abr batiam exato).
-- Esse agente roda 1x/dia (interval_minutes=1440) reprocessando 45 dias em blocos
-- de 7 (o GRM recusa intervalos maiores). Mesma lane do agente rápido
-- (entrada_producao): o worker da lane roda 1 job por vez, então os dois nunca
-- disputam a staging de relatorio_resultado_diario.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-resultado-diario-reconciliacao', 'entrada_producao', 1440, true,
  'entrada_producao', 'entrada', 'heavy', 50,
  15, '[]'::jsonb, null
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  interval_minutes = excluded.interval_minutes,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();
