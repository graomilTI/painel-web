-- Fecha o buraco entre "colaborador confirmado na Equipe" (programacao_equipe)
-- e "O.S. marcada como Atender" (operacional_os.status_gestor), que hoje são
-- 2 ações manuais separadas do gestor. Sem a 2ª, a O.S. some do Mapa
-- Operacional e aparece como "sem programação" pro usuário master, mesmo
-- com a equipe já confirmada (ver 2026-08-03: 20 colaboradores confirmados
-- em 18 O.S. hoje, todas ainda com status_gestor nulo).
--
-- Não sobrescreve status_gestor já em 'ATENDER' ou 'FINALIZAR' — só promove
-- de PENDENTE/AGUARDAR pra ATENDER quando alguém é confirmado na O.S.

create or replace function public.programacao_equipe_marca_os_atender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  update public.operacional_os
  set status_gestor = 'ATENDER',
      configurada_em = coalesce(configurada_em, now()),
      updated_at = now()
  where id = new.os_id
    and (status_gestor is null or status_gestor = 'AGUARDAR');

  return new;
end;
$$;

drop trigger if exists programacao_equipe_marca_os_atender_trg
  on public.programacao_equipe;

create trigger programacao_equipe_marca_os_atender_trg
after insert or update of confirmado, os_id
on public.programacao_equipe
for each row
execute function public.programacao_equipe_marca_os_atender();
;
