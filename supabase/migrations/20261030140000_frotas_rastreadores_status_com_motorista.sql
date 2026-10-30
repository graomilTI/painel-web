-- Novo status "com_motorista": o rastreador já está com o motorista, aguardando agendar a instalação.
-- Diferente de sem_rastreador (veículo sem rastreador nenhum) e de agendado (já tem data).
alter table public.frotas_rastreadores drop constraint if exists frotas_rastreadores_status_check;
alter table public.frotas_rastreadores
  add constraint frotas_rastreadores_status_check
  check (status in ('sem_rastreador','com_motorista','em_andamento','concluido','aguardando_motorista','agendado','manutencao'));
