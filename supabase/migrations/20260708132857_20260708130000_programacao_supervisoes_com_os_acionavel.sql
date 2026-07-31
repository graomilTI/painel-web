create or replace function public.programacao_supervisoes_com_os_acionavel(p_supervisoes text[])
returns table(supervisao text)
language sql
stable
as $$
  select distinct supervisao
  from public.operacional_os
  where supervisao = any(p_supervisoes)
    and (status_gestor is null or status_gestor in ('PENDENTE', 'AGUARDAR', 'ATENDER'));
$$;;
