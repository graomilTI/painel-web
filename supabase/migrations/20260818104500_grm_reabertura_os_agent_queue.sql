insert into public.grm_sync_agent_settings(agent_id, queue_lane, interval_minutes, enabled, updated_at)
values ('sync-reabrir-os','alteracoes',0,false,now())
on conflict (agent_id) do update
set queue_lane=excluded.queue_lane,
    interval_minutes=0,
    enabled=false,
    updated_at=now();

create table if not exists public.grm_reabertura_os_execucoes (
  id uuid primary key default gen_random_uuid(),
  fila_id uuid references public.grm_reabertura_os_fila(id) on delete set null,
  os text not null,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  dry_run boolean not null default true,
  status text not null default 'INICIADO',
  erro text,
  detalhes jsonb not null default '{}'::jsonb
);

create index if not exists idx_grm_reabertura_exec_os
  on public.grm_reabertura_os_execucoes(os, iniciado_em desc);
create index if not exists idx_grm_reabertura_exec_status
  on public.grm_reabertura_os_execucoes(status, iniciado_em desc);

create or replace function public.claim_next_grm_reabertura_os(
  p_os text default null,
  p_prioridade_max smallint default 1
)
returns public.grm_reabertura_os_fila
language plpgsql
security definer
set search_path = 'public'
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
  set status='PROCESSANDO',
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
set search_path='public'
as $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_status text := upper(trim(coalesce(p_status,'')));
begin
  if v_status not in (
    'PENDENTE_REABERTURA',
    'REABERTA',
    'JA_REABERTA',
    'ERRO_REABERTURA',
    'RESOLVIDA_SEM_REABERTURA'
  ) then
    raise exception 'Status inválido para reabertura: %', p_status;
  end if;

  update public.grm_reabertura_os_fila
  set status=v_status,
      erro=nullif(p_erro,''),
      observacao=coalesce(nullif(p_observacao,''),observacao),
      reaberto_em=case
        when v_status in ('REABERTA','JA_REABERTA') then coalesce(reaberto_em,now())
        else reaberto_em
      end,
      updated_at=now()
  where id=p_fila_id
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.enqueue_grm_reabertura_os()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_enabled boolean;
  v_pending integer;
  v_job uuid;
begin
  select enabled into v_enabled
  from public.grm_sync_agent_settings
  where agent_id='sync-reabrir-os';

  if coalesce(v_enabled,false) is not true then
    return jsonb_build_object('ok',false,'motivo','AGENTE_DESATIVADO');
  end if;

  select count(*) into v_pending
  from public.grm_reabertura_os_fila
  where status='PENDENTE_REABERTURA';

  if v_pending=0 then
    return jsonb_build_object('ok',true,'enfileirado',false,'pendentes',0);
  end if;

  if exists(
    select 1
    from public.grm_sync_jobs
    where agente_id='sync-reabrir-os'
      and status in ('pendente','rodando')
  ) then
    return jsonb_build_object(
      'ok',true,
      'enfileirado',false,
      'pendentes',v_pending,
      'motivo','JOB_JA_ABERTO'
    );
  end if;

  insert into public.grm_sync_jobs(agente_id,status)
  values ('sync-reabrir-os','pendente')
  returning id into v_job;

  return jsonb_build_object(
    'ok',true,
    'enfileirado',true,
    'job_id',v_job,
    'pendentes',v_pending
  );
end;
$function$;

revoke all on function public.claim_next_grm_reabertura_os(text,smallint) from public;
revoke all on function public.finalizar_grm_reabertura_os(uuid,text,text,text) from public;
revoke all on function public.enqueue_grm_reabertura_os() from public;

grant execute on function public.claim_next_grm_reabertura_os(text,smallint) to service_role;
grant execute on function public.finalizar_grm_reabertura_os(uuid,text,text,text) to service_role;
grant execute on function public.enqueue_grm_reabertura_os() to service_role;
