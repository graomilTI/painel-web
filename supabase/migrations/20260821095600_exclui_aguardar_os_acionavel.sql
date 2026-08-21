-- Programação: AGUARDAR representa O.S. sem atendimento e não pode ser
-- considerada acionável por rotinas de distribuição automática.

create or replace function public.programacao_supervisoes_com_os_acionavel(p_supervisoes text[])
returns table(supervisao text)
language sql
stable
set search_path = public
as $$
  select distinct os.supervisao
  from public.operacional_os os
  where os.supervisao = any(p_supervisoes)
    and (
      os.status_gestor is null
      or os.status_gestor in ('PENDENTE', 'ATENDER')
    );
$$;
