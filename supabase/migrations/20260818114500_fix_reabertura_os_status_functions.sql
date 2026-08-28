-- Alinha as funções do agente de reabertura ao CHECK já existente na fila.
-- Status persistidos: PENDENTE_REABERTURA, EM_REABERTURA, REABERTA,
-- IGNORADA, ERRO e RESOLVIDA_SEM_REABERTURA.

create or replace function public.claim_next_grm_reabertura_os(
  p_os text default null,
  p_prioridade_max smallint default 1
)
returns public.grm_reabertura_os_fila
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_enabled boolean;
begin
  select enabled into v_enabled
  from public.grm_sync_agent_settings
  where agent_id='sync-reabrir-os';

  if coalesce(v_enabled,false) is not true then
    raise exception 'sync-reabrir-os está desativado.' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(872634504);

  select * into v_row
  from public.grm_reabertura_os_fila f
  where f.status='PENDENTE_REABERTURA'
    and (p_os is null or f.os = regexp_replace(coalesce(p_os,''),'[^0-9]','','g'))
    and (p_os is not null or f.prioridade <= greatest(1,least(coalesce(p_prioridade_max,1),2)))
  order by f.prioridade asc, abs(coalesce(f.remanescente,0)) desc, f.fechamento_em asc
  for update skip locked
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  update public.grm_reabertura_os_fila
  set status='EM_REABERTURA',
      tentativas=tentativas+1,
      erro=null,
      updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.finalizar_grm_reabertura_os(
  p_fila_id uuid,
  p_status text,
  p_erro text default null,
  p_observacao text default null
)
returns public.grm_reabertura_os_fila
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_requested text := upper(trim(coalesce(p_status,'')));
  v_status text;
begin
  v_status := case v_requested
    when 'JA_REABERTA' then 'REABERTA'
    when 'ERRO_REABERTURA' then 'ERRO'
    when 'PROCESSANDO' then 'EM_REABERTURA'
    else v_requested
  end;

  if v_status not in ('PENDENTE_REABERTURA','EM_REABERTURA','REABERTA','IGNORADA','ERRO','RESOLVIDA_SEM_REABERTURA') then
    raise exception 'Status inválido para reabertura: %', p_status;
  end if;

  update public.grm_reabertura_os_fila
  set status=v_status,
      erro=nullif(p_erro,''),
      observacao=coalesce(nullif(p_observacao,''),observacao),
      reaberto_em=case when v_status='REABERTA' then coalesce(reaberto_em,now()) else reaberto_em end,
      updated_at=now()
  where id=p_fila_id
  returning * into v_row;

  return v_row;
end;
$function$;
