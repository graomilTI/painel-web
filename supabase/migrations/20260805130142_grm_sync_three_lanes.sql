alter table public.grm_sync_jobs
  add column if not exists lane text,
  add column if not exists pipeline_seq bigint,
  add column if not exists worker_id text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists tentativas integer not null default 0;

create sequence if not exists public.grm_fixed_pipeline_seq;

create or replace function public.grm_sync_lane_for_agent(p_agent_id text)
returns text
language sql
immutable
as $$
  select case
    when p_agent_id in (
      'aplicar-distribuicao-os',
      'sync-lancar-nhe',
      'sync-finalizar-os',
      'sync-abrir-os',
      'sync-liberacao-despesas',
      'sync-despesas-retroativas',
      'sync-btg-checkin',
      'sync-btg-devolver-classificador'
    ) then 'alteracoes'
    else 'fixed'
  end;
$$;

create or replace function public.grm_sync_assign_lane()
returns trigger
language plpgsql
as $$
begin
  if new.lane is null then
    new.lane := public.grm_sync_lane_for_agent(new.agente_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grm_sync_assign_lane on public.grm_sync_jobs;
create trigger trg_grm_sync_assign_lane
before insert or update of agente_id, lane on public.grm_sync_jobs
for each row execute function public.grm_sync_assign_lane();

update public.grm_sync_jobs
set lane = public.grm_sync_lane_for_agent(agente_id)
where lane is null;

create index if not exists idx_grm_sync_jobs_lane_status_order
  on public.grm_sync_jobs (lane, status, pipeline_seq, created_at);

create index if not exists idx_grm_sync_jobs_running_lease
  on public.grm_sync_jobs (lane, lease_expires_at)
  where status = 'rodando';

create or replace function public.grm_fixed_agent_for_seq(p_seq bigint)
returns text
language sql
immutable
as $$
  select (array[
    'sync-colaboradores',
    'sync-lista-os',
    'sync-patrimonios',
    'sync-nhe',
    'sync-operacional-os',
    'sync-distribuicao-os',
    'sync-producao-diaria',
    'sync-locais-embarque',
    'sync-resultado-diario',
    'sync-despesas',
    'sync-notas-fiscais',
    'sync-mapa-embarque',
    'sync-contas-pagar',
    'sync-contas-receber',
    'sync-auditorias',
    'sync-cargas-geofence',
    'sync-btg-relatorios',
    'sync-adiantamentos',
    'botconversa-sync'
  ])[((p_seq - 1) % 19) + 1];
$$;

create or replace function public.enqueue_next_grm_fixed_job()
returns public.grm_sync_jobs
language plpgsql
as $$
declare
  v_seq bigint;
  v_job public.grm_sync_jobs;
begin
  v_seq := nextval('public.grm_fixed_pipeline_seq');
  insert into public.grm_sync_jobs (agente_id, status, lane, pipeline_seq)
  values (public.grm_fixed_agent_for_seq(v_seq), 'pendente', 'fixed', v_seq)
  returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.ensure_grm_fixed_pipeline_capacity()
returns integer
language plpgsql
as $$
declare
  v_open integer;
  v_created integer := 0;
begin
  perform pg_advisory_xact_lock(872634502);
  select count(*) into v_open
  from public.grm_sync_jobs
  where lane = 'fixed'
    and pipeline_seq is not null
    and status in ('pendente', 'rodando');

  while v_open < 2 loop
    perform public.enqueue_next_grm_fixed_job();
    v_open := v_open + 1;
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

drop function if exists public.claim_next_grm_sync_job();

create or replace function public.claim_next_grm_sync_job(
  p_lane text,
  p_worker_id text
)
returns public.grm_sync_jobs
language plpgsql
as $$
declare
  v_job public.grm_sync_jobs;
  v_capacity integer;
begin
  if p_lane not in ('fixed', 'alteracoes') then
    raise exception 'Lane inválida: %', p_lane;
  end if;

  perform pg_advisory_xact_lock(872634503);

  update public.grm_sync_jobs
  set status = 'erro',
      finalizado_em = now(),
      erro = 'Lease do worker expirou sem heartbeat; job liberado automaticamente.'
  where status = 'rodando'
    and lane = p_lane
    and coalesce(lease_expires_at, iniciado_em + interval '20 minutes') < now();

  v_capacity := case when p_lane = 'fixed' then 2 else 1 end;
  if (select count(*) from public.grm_sync_jobs where status = 'rodando' and lane = p_lane) >= v_capacity then
    return null;
  end if;

  select * into v_job
  from public.grm_sync_jobs
  where status = 'pendente'
    and lane = p_lane
  order by
    case when agente_id = 'sync-login-alimentacao' then 0 else 1 end,
    case when pipeline_seq is null then 0 else 1 end,
    pipeline_seq,
    created_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.grm_sync_jobs
  set status = 'rodando',
      iniciado_em = now(),
      erro = null,
      worker_id = p_worker_id,
      heartbeat_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      tentativas = tentativas + 1
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.grm_sync_lane_for_agent(text) from public, anon, authenticated;
revoke execute on function public.enqueue_next_grm_fixed_job() from public, anon, authenticated;
revoke execute on function public.ensure_grm_fixed_pipeline_capacity() from public, anon, authenticated;
revoke execute on function public.claim_next_grm_sync_job(text, text) from public, anon, authenticated;

grant execute on function public.grm_sync_lane_for_agent(text) to service_role;
grant execute on function public.enqueue_next_grm_fixed_job() to service_role;
grant execute on function public.ensure_grm_fixed_pipeline_capacity() to service_role;
grant execute on function public.claim_next_grm_sync_job(text, text) to service_role;

select public.ensure_grm_fixed_pipeline_capacity();
