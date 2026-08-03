-- data_os deve refletir a data em que a O.S. está sendo atendida, não a data
-- em que foi aberta — uma O.S. pode ser aberta dias atrás e só ser atendida
-- dias à frente, dependendo da necessidade do cliente (esclarecido pelo
-- usuário em 2026-08-03). Sem isso, o trigger anterior
-- (programacao_equipe_marca_os_atender, 2026-08-03 mais cedo) marcava
-- status_gestor='ATENDER' mas deixava data_os intocada — como o Mapa
-- Operacional filtra por data_os = hoje, a O.S. continuava invisível no mapa
-- mesmo já "Atender".
--
-- Não mexe em O.S. já FINALIZAR (trabalho concluído não deve ser reaberto/
-- reagendado por uma nova confirmação de equipe).

create or replace function public.programacao_equipe_marca_os_atender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data_referencia date;
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  select data_referencia into v_data_referencia
  from public.programacao_dia
  where id = new.programacao_id;

  if v_data_referencia is null then
    return new;
  end if;

  update public.operacional_os
  set status_gestor = 'ATENDER',
      data_os = v_data_referencia,
      configurada_em = coalesce(configurada_em, now()),
      updated_at = now()
  where id = new.os_id
    and coalesce(status_gestor, '') <> 'FINALIZAR';

  return new;
end;
$$;
