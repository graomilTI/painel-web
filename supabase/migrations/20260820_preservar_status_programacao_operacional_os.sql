-- Mantém o estado visual/operacional da Programação do Gestor quando o
-- sincronizador de O.S. reenviar status_gestor = NULL para uma O.S. que já
-- possui equipe confirmada numa programação de hoje ou futura.
--
-- Sem esta proteção, programacao_equipe e os custos permanecem gravados, mas
-- o drawer interpreta a O.S. como PENDENTE e esconde a programação salva.

create or replace function public.operacional_os_preservar_status_programacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status_gestor is null
     and old.status_gestor in ('ATENDER', 'AGUARDAR')
     and exists (
       select 1
       from public.programacao_equipe e
       join public.programacao_dia p on p.id = e.programacao_id
       where e.os_id = old.id
         and e.confirmado is true
         and p.data_referencia >= current_date
     ) then
    new.status_gestor := old.status_gestor;
    new.configurada_em := coalesce(new.configurada_em, old.configurada_em);
    new.data_os := coalesce(new.data_os, old.data_os);
  end if;

  return new;
end;
$$;

drop trigger if exists operacional_os_preservar_status_programacao_trg
  on public.operacional_os;

create trigger operacional_os_preservar_status_programacao_trg
before update of status_gestor on public.operacional_os
for each row
execute function public.operacional_os_preservar_status_programacao();
