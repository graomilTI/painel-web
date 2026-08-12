create table if not exists public.grm_sync_agent_settings (
  agent_id text primary key,
  queue_lane text not null check (queue_lane in ('fixed_a', 'fixed_b', 'alteracoes', 'despesas_distribuicao')),
  interval_minutes integer not null default 60 check (interval_minutes between 0 and 10080),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.grm_sync_agent_settings (agent_id, queue_lane, interval_minutes) values
  ('sync-colaboradores','fixed_a',60),('sync-lista-os','fixed_b',60),
  ('sync-patrimonios','fixed_a',60),('sync-nhe','fixed_b',60),
  ('sync-operacional-os','fixed_a',60),('sync-distribuicao-os','fixed_b',60),
  ('sync-producao-diaria','fixed_a',60),('sync-locais-embarque','fixed_b',60),
  ('sync-resultado-diario','fixed_a',60),('sync-despesas','fixed_b',60),
  ('sync-notas-fiscais','fixed_a',60),('sync-mapa-embarque','fixed_b',60),
  ('sync-contas-pagar','fixed_a',60),('sync-contas-receber','fixed_b',60),
  ('sync-auditorias','fixed_a',60),('sync-cargas-geofence','fixed_b',60),
  ('sync-btg-relatorios','fixed_a',60),('sync-adiantamentos','fixed_b',60),
  ('botconversa-sync','fixed_a',60),('sync-login-alimentacao','fixed_b',0),
  ('sync-btg-checkin','alteracoes',0),('sync-lancar-nhe','alteracoes',1440),
  ('sync-despesas-retroativas','alteracoes',1440),
  ('aplicar-distribuicao-os','despesas_distribuicao',0),
  ('sync-liberacao-despesas','despesas_distribuicao',0)
on conflict (agent_id) do nothing;

alter table public.grm_sync_agent_settings enable row level security;
drop policy if exists grm_sync_agent_settings_select_ti on public.grm_sync_agent_settings;
create policy grm_sync_agent_settings_select_ti on public.grm_sync_agent_settings
for select to authenticated using (public.painel_has_module(array['TI_AGENTES','TI'], false));
drop policy if exists grm_sync_agent_settings_update_ti on public.grm_sync_agent_settings;
create policy grm_sync_agent_settings_update_ti on public.grm_sync_agent_settings
for update to authenticated
using (public.painel_has_module(array['TI_AGENTES','TI'], true))
with check (public.painel_has_module(array['TI_AGENTES','TI'], true));
grant select, update on public.grm_sync_agent_settings to authenticated;

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
  if p_queue_lane not in ('fixed_a','fixed_b','alteracoes','despesas_distribuicao') then
    raise exception 'Fila inválida.';
  end if;
  if p_interval_minutes < 0 or p_interval_minutes > 10080 then
    raise exception 'Intervalo deve ficar entre 0 e 10080 minutos.';
  end if;
  update public.grm_sync_agent_settings set
    queue_lane = p_queue_lane,
    interval_minutes = p_interval_minutes,
    updated_at = now(),
    updated_by = (select auth.uid())
  where agent_id = p_agent_id returning * into v_row;
  if v_row.agent_id is null then raise exception 'Agente não configurado: %', p_agent_id; end if;

  -- Jobs ainda não iniciados acompanham a nova fila; o job em execução termina
  -- no worker atual para evitar interrupção e duplicidade.
  update public.grm_sync_jobs set lane = p_queue_lane
  where agente_id = p_agent_id and status = 'pendente';
  return v_row;
end;
$$;
revoke all on function public.update_grm_sync_agent_setting(text,text,integer) from public, anon;
grant execute on function public.update_grm_sync_agent_setting(text,text,integer) to authenticated;

create or replace function public.grm_sync_lane_for_agent(p_agent_id text)
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select queue_lane from public.grm_sync_agent_settings where agent_id = p_agent_id and enabled),
    case when p_agent_id in ('aplicar-distribuicao-os','sync-liberacao-despesas') then 'despesas_distribuicao'
         when p_agent_id in ('sync-lancar-nhe','sync-finalizar-os','sync-abrir-os','sync-despesas-retroativas','sync-btg-checkin','sync-btg-devolver-classificador') then 'alteracoes'
         else 'fixed_a' end
  );
$$;

update public.grm_sync_jobs job set lane = settings.queue_lane
from public.grm_sync_agent_settings settings
where job.agente_id = settings.agent_id and job.status = 'pendente';

create or replace function public.ensure_grm_scheduled_agents()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_created integer := 0;
begin
  perform pg_advisory_xact_lock(872634504);
  insert into public.grm_sync_jobs (agente_id,status,lane,pipeline_seq)
  select settings.agent_id, 'pendente', settings.queue_lane, nextval('public.grm_fixed_pipeline_seq')
  from public.grm_sync_agent_settings settings
  where settings.enabled and settings.interval_minutes > 0
    and not exists (select 1 from public.grm_sync_jobs open_job where open_job.agente_id=settings.agent_id and open_job.status in ('pendente','rodando'))
    and coalesce((select max(coalesce(done.finalizado_em,done.created_at)) from public.grm_sync_jobs done where done.agente_id=settings.agent_id and done.status in ('sucesso','erro','parcial')), '-infinity'::timestamptz)
        <= now() - make_interval(mins => settings.interval_minutes);
  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create or replace function public.ensure_grm_fixed_pipeline_capacity()
returns integer language plpgsql security definer set search_path = public
as $$ begin return public.ensure_grm_scheduled_agents(); end; $$;

create or replace function public.enqueue_next_grm_fixed_job()
returns public.grm_sync_jobs language plpgsql security definer set search_path = public
as $$
declare v_job public.grm_sync_jobs;
begin
  perform public.ensure_grm_scheduled_agents();
  select * into v_job from public.grm_sync_jobs where status='pendente' and lane in ('fixed_a','fixed_b') order by pipeline_seq limit 1;
  return v_job;
end;
$$;

create or replace function public.claim_next_grm_sync_job(p_lane text,p_worker_id text)
returns public.grm_sync_jobs language plpgsql security definer set search_path = public
as $$
declare v_job public.grm_sync_jobs;
begin
  if p_lane not in ('fixed_a','fixed_b','alteracoes','despesas_distribuicao') then raise exception 'Lane inválida: %',p_lane; end if;
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

revoke all on function public.ensure_grm_scheduled_agents() from public,anon,authenticated;
revoke all on function public.grm_sync_lane_for_agent(text) from public,anon,authenticated;
revoke all on function public.claim_next_grm_sync_job(text,text) from public,anon,authenticated;
grant execute on function public.ensure_grm_scheduled_agents() to service_role;
grant execute on function public.grm_sync_lane_for_agent(text) to service_role;
grant execute on function public.claim_next_grm_sync_job(text,text) to service_role;
