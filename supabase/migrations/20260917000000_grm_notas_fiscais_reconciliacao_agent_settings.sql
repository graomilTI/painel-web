-- Registra 'sync-notas-fiscais-reconciliacao' em grm_sync_agent_settings.
-- Achado 17/09 comparando o DRE com o Relatório de Notas Fiscais oficial da
-- GRM: sobravam 2 a 7 notas por mês (~R$4-33 mil) que nunca chegavam a
-- sincronizar - o agente rápido (sync-notas-fiscais, janela de 30 dias) não
-- pega nota lançada atrasada na GRM (Data N.F. de um dia, cadastrada no
-- sistema semanas depois - já fora da janela rolante quando finalmente passa
-- a existir). Esse novo agente roda 1x/dia (interval_minutes=1440) com janela
-- de 120 dias (grmserver-notas-fiscais-reconciliacao-api.js), dando várias
-- chances de pegar a nota atrasada antes dela sair também dessa janela maior.
-- Mesma lane do agente rápido (entrada_financeiro_a): o worker da lane só
-- roda 1 job por vez, então os dois nunca disputam a mesma requisição em
-- paralelo - só se revezam na fila, igual aos demais agentes da lane.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-notas-fiscais-reconciliacao', 'entrada_financeiro_a', 1440, true,
  'entrada_financeiro_a', 'entrada', 'heavy', 50,
  10, '[]'::jsonb, null
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
