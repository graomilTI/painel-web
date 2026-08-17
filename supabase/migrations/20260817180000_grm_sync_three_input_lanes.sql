-- Terceira fila de entrada para separar importacoes por dominio.
-- As filas de saida permanecem isoladas e continuam estritamente seriais.

alter table public.grm_sync_agent_settings
  drop constraint if exists grm_sync_agent_settings_queue_lane_check;

alter table public.grm_sync_agent_settings
  add constraint grm_sync_agent_settings_queue_lane_check
  check (queue_lane in (
    'fixed_a', 'fixed_b', 'fixed_c', 'alteracoes', 'despesas_distribuicao'
  ));

update public.grm_sync_agent_settings set queue_lane = 'fixed_a', updated_at = now()
where agent_id in ('sync-colaboradores','sync-lista-os','sync-operacional-os','sync-distribuicao-os','sync-producao-diaria','sync-resultado-diario','sync-nhe','sync-btg-relatorios');

update public.grm_sync_agent_settings set queue_lane = 'fixed_b', updated_at = now()
where agent_id in ('botconversa-sync','sync-patrimonios','sync-locais-embarque','sync-mapa-embarque','sync-cargas-geofence','sync-auditorias');

update public.grm_sync_agent_settings set queue_lane = 'fixed_c', updated_at = now()
where agent_id in ('sync-notas-fiscais','sync-adiantamentos','sync-contas-pagar','sync-contas-receber','sync-despesas');

-- Jobs em execucao terminam normalmente; somente os pendentes mudam de fila.
update public.grm_sync_jobs job set lane = settings.queue_lane
from public.grm_sync_agent_settings settings
where job.agente_id = settings.agent_id and job.status = 'pendente';

create or replace function public.update_grm_sync_agent_setting(
  p_agent_id text, p_queue_lane text, p_interval_minutes integer
) returns public.grm_sync_agent_settings
language plpgsql security invoker set search_path = public
as $$
declare v_row public.grm_sync_agent_settings;
begin
  if not public.painel_has_module(array['TI_AGENTES','TI'], true) then
    raise exception 'Você não tem permissão para editar agentes.' using errcode = '42501';
  end if;
  if p_queue_lane not in ('fixed_a','fixed_b','fixed_c','alteracoes','despesas_distribuicao') then raise exception 'Fila inválida.'; end if;
  if p_interval_minutes < 0 or p_interval_minutes > 10080 then raise exception 'Intervalo deve ficar entre 0 e 10080 minutos.'; end if;
  update public.grm_sync_agent_settings set queue_lane=p_queue_lane,interval_minutes=p_interval_minutes,updated_at=now(),updated_by=(select auth.uid())
  where agent_id=p_agent_id returning * into v_row;
  if v_row.agent_id is null then raise exception 'Agente não configurado: %',p_agent_id; end if;
  update public.grm_sync_jobs set lane=p_queue_lane where agente_id=p_agent_id and status='pendente';
  return v_row;
end;
$$;

create or replace function public.enqueue_next_grm_fixed_job()
returns public.grm_sync_jobs language plpgsql security definer set search_path = public
as $$
declare v_job public.grm_sync_jobs;
begin
  perform public.ensure_grm_scheduled_agents();
  select * into v_job from public.grm_sync_jobs
  where status='pendente' and lane in ('fixed_a','fixed_b','fixed_c') order by pipeline_seq limit 1;
  return v_job;
end;
$$;

create or replace function public.claim_next_grm_sync_job(p_lane text,p_worker_id text)
returns public.grm_sync_jobs language plpgsql security definer set search_path = public
as $$
declare v_job public.grm_sync_jobs;
begin
  if p_lane not in ('fixed_a','fixed_b','fixed_c','alteracoes','despesas_distribuicao') then raise exception 'Lane inválida: %',p_lane; end if;
  perform pg_advisory_xact_lock(872634503);
  update public.grm_sync_jobs set status='erro',finalizado_em=now(),erro='Lease do worker expirou sem heartbeat; job liberado automaticamente.'
  where status='rodando' and lane=p_lane and coalesce(lease_expires_at,iniciado_em+interval '20 minutes')<now();
  if exists(select 1 from public.grm_sync_jobs where status='rodando' and lane=p_lane) then return null; end if;
  select * into v_job from public.grm_sync_jobs where status='pendente' and lane=p_lane
  order by case when agente_id='sync-login-alimentacao' then 0 else 1 end,pipeline_seq nulls first,created_at
  for update skip locked limit 1;
  if v_job.id is null then return null; end if;
  update public.grm_sync_jobs set status='rodando',iniciado_em=now(),erro=null,worker_id=p_worker_id,
    heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',tentativas=tentativas+1
  where id=v_job.id returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.claim_next_grm_sync_job(text,text) from public,anon,authenticated;
grant execute on function public.claim_next_grm_sync_job(text,text) to service_role;
