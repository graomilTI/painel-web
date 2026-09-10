-- Registra 'sync-bonus-desconto-caixa' em grm_sync_agent_settings para que
-- grm_sync_lane_for_agent() o coloque na MESMA lane e MESMO mutex_group de
-- 'sync-bonus-caixa' (ambos manipulam a mesma tela de Staff/Caixa no GRM via
-- Puppeteer — sem isso, o agente cairia no fallback 'entrada_cadastros_operacao'
-- e poderia rodar em paralelo com o Bônus, abrindo a mesma página duas vezes).
-- interval_minutes=0 e enabled=true: sem agendamento automático, só roda pelo
-- job criado manualmente em bonus_solicitar_lancamento_caixa.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-bonus-desconto-caixa', 'saida_financeiro', 0, true,
  'saida_financeiro', 'saida', 'heavy', 85,
  5, '[]'::jsonb, 'staff_grm'
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();
