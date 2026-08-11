-- Preparação pra religar o agente aplicar-distribuicao-os com ativação
-- controlada por supervisão: nem todo gestor usa a tela Distribuir O.S do
-- painel ainda, então a automação só deve escrever no Graint pras
-- supervisões marcadas aqui pela TI. Todas nascem desligadas (rollout
-- manual, supervisão por supervisão, em TI > Agentes).
alter table public.supervisoes
  add column if not exists distribuicao_os_automatica boolean not null default false;
