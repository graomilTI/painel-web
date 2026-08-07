-- Quando o gestor reaproveita uma programação e troca a data selecionada, os
-- vínculos confirmados já existem e o trigger de programacao_equipe não roda.
-- Mantenha data_os alinhada à data escolhida pelo gestor para que o mapa do
-- dia e o gerador de rotas encontrem as O.S. programadas.

create or replace function public.programacao_dia_sincroniza_os_atender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data_referencia is not distinct from old.data_referencia then
    return new;
  end if;

  update public.operacional_os o
     set status_gestor = 'ATENDER',
         data_os = new.data_referencia,
         configurada_em = coalesce(o.configurada_em, now()),
         updated_at = now()
    from public.programacao_equipe e
   where e.programacao_id = new.id
     and e.confirmado is true
     and e.os_id = o.id
     and coalesce(o.status_gestor, '') <> 'FINALIZAR';

  return new;
end;
$$;

revoke all on function public.programacao_dia_sincroniza_os_atender() from public, anon, authenticated;

drop trigger if exists programacao_dia_sincroniza_os_atender_trg
  on public.programacao_dia;

create trigger programacao_dia_sincroniza_os_atender_trg
after update of data_referencia
on public.programacao_dia
for each row
execute function public.programacao_dia_sincroniza_os_atender();

-- Repara a janela que já estava aberta quando o gatilho foi criado.
update public.operacional_os o
   set status_gestor = 'ATENDER',
       data_os = p.data_referencia,
       configurada_em = coalesce(o.configurada_em, now()),
       updated_at = now()
  from public.programacao_equipe e
  join public.programacao_dia p on p.id = e.programacao_id
 where e.confirmado is true
   and e.os_id = o.id
   and p.data_referencia = (now() at time zone 'America/Sao_Paulo')::date
   and coalesce(o.status_gestor, '') <> 'FINALIZAR';
