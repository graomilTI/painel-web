create or replace function public.grm_sync_lane_for_agent(p_agent_id text)
returns text
language sql
immutable
as $$
  select case
    when p_agent_id in (
      'aplicar-distribuicao-os',
      'sync-liberacao-despesas'
    ) then 'despesas_distribuicao'
    when p_agent_id in (
      'sync-lancar-nhe',
      'sync-finalizar-os',
      'sync-abrir-os',
      'sync-despesas-retroativas',
      'sync-btg-checkin',
      'sync-btg-devolver-classificador'
    ) then 'alteracoes'
    else 'fixed'
  end;
$$;

update public.grm_sync_jobs
set lane = 'despesas_distribuicao'
where agente_id in ('aplicar-distribuicao-os', 'sync-liberacao-despesas')
  and status = 'pendente';

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
  if p_lane not in ('fixed', 'alteracoes', 'despesas_distribuicao') then
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
revoke execute on function public.claim_next_grm_sync_job(text, text) from public, anon, authenticated;
grant execute on function public.grm_sync_lane_for_agent(text) to service_role;
grant execute on function public.claim_next_grm_sync_job(text, text) to service_role;
