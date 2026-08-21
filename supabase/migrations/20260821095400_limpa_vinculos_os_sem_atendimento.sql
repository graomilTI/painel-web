-- Programação: O.S. em AGUARDAR significa sem atendimento ativo.
-- Remove vínculos operacionais antigos que poderiam reaparecer na integração
-- com o Graint. O histórico continua preservado em programacao_equipe.

create or replace function public.operacional_os_limpar_vinculos_sem_atendimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_gestor = 'AGUARDAR' then
    delete from public.operacional_os_colaboradores
    where os_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists operacional_os_limpar_vinculos_sem_atendimento_trg
on public.operacional_os;

create trigger operacional_os_limpar_vinculos_sem_atendimento_trg
after update of status_gestor on public.operacional_os
for each row
execute function public.operacional_os_limpar_vinculos_sem_atendimento();

-- Reconcilia o legado existente: operacional_os_colaboradores representa
-- estado operacional atual, portanto não deve guardar colaboradores de O.S.
-- que o gestor deixou sem atendimento.
delete from public.operacional_os_colaboradores oc
using public.operacional_os os
where oc.os_id = os.id
  and os.status_gestor = 'AGUARDAR';
