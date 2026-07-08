-- Usado pela opção "Todas" em Supervisão (Programação/Gestor): reduz o
-- fan-out de "todas as supervisões permitidas ao gestor" (hoje até 43 de 46)
-- para só as que têm alguma O.S. acionável, no mesmo critério de
-- status_gestor já usado por loadOsRelevantes() em programacao-equipe.js
-- (null/PENDENTE/AGUARDAR/ATENDER — FINALIZAR já saiu do fluxo do dia).
create or replace function public.programacao_supervisoes_com_os_acionavel(p_supervisoes text[])
returns table(supervisao text)
language sql
stable
as $$
  select distinct supervisao
  from public.operacional_os
  where supervisao = any(p_supervisoes)
    and (status_gestor is null or status_gestor in ('PENDENTE', 'AGUARDAR', 'ATENDER'));
$$;
