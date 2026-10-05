-- Registra 'sync-aprovar-pendencias', auxiliar do sync-despesas-retroativas: aprova as pendências de
-- Café, Almoço, Janta e Pernoite do Caixa Operacional que cumprem as regras decididas em 01/10/2026
-- (movimento no dia; Janta laudo >=19h; Café laudo <07h; Pernoite sem refeição no dia).
--
-- O retroativas só aprova o que está na Programação do Painel e só olha D-1; as regras de 01/10
-- rodaram apenas em scripts pontuais. Auditoria de 05/10: 42 Almoços, 5 Jantas e 1 Café pendentes
-- cumpriam as regras e ficavam parados.
--
-- Mesma lane e MESMO mutex_group (staff_grm) do retroativas/duplicadas/bônus/liberação: todos mexem
-- no Caixa/Staff do GRM e não podem rodar ao mesmo tempo. Intervalo de 60 min (já validado em dry-run
-- e com o represado aprovado manualmente em 05/10). Auditoria: grm_despesas_retroativas_auditoria
-- (acao APPROVE, diagnostico.agente = 'sync-aprovar-pendencias'), sem mudar o CHECK de acao.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-aprovar-pendencias', 'saida_financeiro', 60, true,
  'saida_financeiro', 'saida', 'heavy', 65,
  10, '[]'::jsonb, 'staff_grm'
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
