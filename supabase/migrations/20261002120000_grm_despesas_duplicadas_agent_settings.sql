-- Registra 'sync-despesas-duplicadas', agente auxiliar do sync-despesas-retroativas:
-- recusa pendências duplicadas do Caixa Operacional ("lançamento duplicado" /
-- "Duplicata") e corrige a data quando a observação aponta um dia sem lançamento.
--
-- Mesma lane e MESMO mutex_group (staff_grm) do retroativas, bônus e liberação:
-- todos mexem no Caixa/Staff do GRM e não podem rodar ao mesmo tempo.
-- interval_minutes=0: nasce sem agendamento automático (só roda por job manual) até
-- a primeira execução em --dry-run ser conferida; depois basta ajustar o Intervalo
-- em TI > Agentes (ex.: 60). Auditoria: grm_despesas_retroativas_auditoria
-- (diagnostico.agente = 'sync-despesas-duplicadas'), sem mudar o CHECK de acao.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-despesas-duplicadas', 'saida_financeiro', 0, true,
  'saida_financeiro', 'saida', 'heavy', 60,
  10, '[]'::jsonb, 'staff_grm'
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
