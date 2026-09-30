-- operacional_os_colaboradores (vínculo OS<->colaborador, usado por Frotas
-- Roteirização, relatórios, Mapa e pela regra "OK só com O.S. ATENDER") é da
-- O.S. inteira, enquanto programacao_equipe tem uma linha por dia. O front
-- apagava o vínculo ao remover a pessoa de UM dia (mesmo ela seguindo
-- confirmada nos outros) e ao confirmar uma sugestão (apagava o de todos), e
-- O.S. que passava por AGUARDAR e voltava a ATENDER nunca recuperava os
-- vínculos. Achado 30/09: 134 pares colaborador+O.S. ATENDER com equipe
-- confirmada de hoje em diante e sem vínculo.
--
-- Esta migration:
--   1) cria operacional_os_garantir_vinculos_equipe(os_id): recria, sem
--      duplicar, o vínculo de quem está confirmado em programacao_equipe de
--      hoje em diante (papel LOGISTICA preservado como PROGRAMACAO_FROTA_LOGISTICA);
--   2) chama isso ao confirmar alguém (programacao_equipe_marca_os_atender)
--      e quando a O.S. volta a ATENDER;
--   3) reconstrói os vínculos que já estão faltando.

create or replace function public.operacional_os_garantir_vinculos_equipe(p_os_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer := 0;
begin
  if p_os_id is null then
    return 0;
  end if;

  -- Só O.S. ainda ATENDER: AGUARDAR apaga vínculos de propósito e FINALIZAR é histórico.
  if not exists (select 1 from public.operacional_os where id = p_os_id and status_gestor = 'ATENDER') then
    return 0;
  end if;

  insert into public.operacional_os_colaboradores
    (os_id, colaborador_key, colaborador_nome, colaborador_cpf, origem_sugestao)
  select distinct on (pe.colaborador_id)
    pe.os_id,
    pe.colaborador_id,
    pe.nome_colaborador,
    case when pe.colaborador_id ~ '^\d+$' then pe.colaborador_id end,
    case when pc.disponibilidade = 'LOGISTICA'
         then 'PROGRAMACAO_FROTA_LOGISTICA'
         else 'PROGRAMACAO_ETAPA_B_ADICIONAL' end
  from public.programacao_equipe pe
  join public.programacao_dia pd on pd.id = pe.programacao_id
  left join public.programacao_colaboradores pc
    on pc.programacao_id = pe.programacao_id and pc.colaborador_id = pe.colaborador_id
  where pe.os_id = p_os_id
    and pe.confirmado is true
    and pd.data_referencia >= (now() at time zone 'America/Sao_Paulo')::date
    and not exists (
      select 1 from public.operacional_os_colaboradores oc
      where oc.os_id = pe.os_id
        and (oc.colaborador_key = pe.colaborador_id or oc.colaborador_cpf = pe.colaborador_id)
    )
  order by pe.colaborador_id, pd.data_referencia
  on conflict (os_id, colaborador_key) do nothing;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Ao confirmar alguém na equipe: além de promover a O.S. a ATENDER, garante o vínculo.
create or replace function public.programacao_equipe_marca_os_atender()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  perform public.operacional_os_garantir_vinculos_equipe(new.os_id);

  return new;
end;
$function$;

-- O.S. que volta a ATENDER (ex.: AGUARDAR -> ATENDER) recupera os vínculos da equipe confirmada.
create or replace function public.operacional_os_restaurar_vinculos_ao_atender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_gestor = 'ATENDER' and old.status_gestor is distinct from 'ATENDER' then
    perform public.operacional_os_garantir_vinculos_equipe(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists operacional_os_restaurar_vinculos_ao_atender_trg on public.operacional_os;
create trigger operacional_os_restaurar_vinculos_ao_atender_trg
after update of status_gestor on public.operacional_os
for each row
execute function public.operacional_os_restaurar_vinculos_ao_atender();

-- Backfill: O.S. ATENDER com equipe confirmada de hoje em diante e vínculo faltando.
do $$
declare
  v_os record;
  v_total integer := 0;
begin
  for v_os in
    select distinct pe.os_id
    from public.programacao_equipe pe
    join public.programacao_dia pd on pd.id = pe.programacao_id
    join public.operacional_os o on o.id = pe.os_id
    where pe.confirmado is true
      and o.status_gestor = 'ATENDER'
      and pd.data_referencia >= (now() at time zone 'America/Sao_Paulo')::date
  loop
    v_total := v_total + public.operacional_os_garantir_vinculos_equipe(v_os.os_id);
  end loop;
  raise notice 'vínculos restaurados: %', v_total;
end;
$$;
