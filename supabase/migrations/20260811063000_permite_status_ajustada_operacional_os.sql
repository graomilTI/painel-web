-- A distribuição de O.S. usa PENDENTE enquanto aguarda publicação no Graint
-- e AJUSTADA somente depois que o Graint confirma o salvamento.
alter table public.operacional_os
  drop constraint if exists operacional_os_status_conferencia_check;

alter table public.operacional_os
  add constraint operacional_os_status_conferencia_check
  check (status_conferencia in ('PENDENTE', 'AJUSTADA'))
  not valid;

alter table public.operacional_os
  validate constraint operacional_os_status_conferencia_check;
