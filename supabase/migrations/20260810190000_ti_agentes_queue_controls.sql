-- Controles operacionais da esteira fixa usados em TI > Agentes.
-- Somente jobs ainda pendentes podem ser reordenados; jobs em execução nunca
-- são tocados. As funções rodam como invoker e continuam sujeitas às políticas
-- de acesso já aplicadas em public.grm_sync_jobs.

create or replace function public.reorder_grm_sync_queue(p_job_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then return; end if;
  if not public.painel_has_module(array['TI_AGENTES', 'TI'], true) then
    raise exception 'Você não tem permissão para reorganizar a fila.' using errcode = '42501';
  end if;

  -- Usa a mesma trava do claim do worker: ninguém retira um job enquanto a
  -- sequência inteira recebe seus novos números.
  perform pg_advisory_xact_lock(872634503);

  if exists (
    select 1 from unnest(p_job_ids) requested(id)
    left join public.grm_sync_jobs job on job.id = requested.id
    where job.id is null or job.status <> 'pendente' or job.lane <> 'fixed'
  ) then
    raise exception 'A fila mudou enquanto era reorganizada. Atualize a tela e tente novamente.';
  end if;

  foreach v_job_id in array p_job_ids loop
    update public.grm_sync_jobs
       set pipeline_seq = nextval('public.grm_fixed_pipeline_seq')
     where id = v_job_id and status = 'pendente' and lane = 'fixed';
  end loop;
end;
$$;

create or replace function public.enqueue_grm_sync_queue(p_agent_ids text[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_agent_id text;
  v_created integer := 0;
  v_allowed constant text[] := array[
    'sync-colaboradores','sync-lista-os','sync-patrimonios','sync-nhe',
    'sync-operacional-os','sync-distribuicao-os','sync-producao-diaria',
    'sync-locais-embarque','sync-resultado-diario','sync-despesas',
    'sync-notas-fiscais','sync-mapa-embarque','sync-contas-pagar',
    'sync-contas-receber','sync-auditorias','sync-cargas-geofence',
    'sync-btg-relatorios','sync-adiantamentos','botconversa-sync'
  ];
begin
  if coalesce(array_length(p_agent_ids, 1), 0) = 0 then return 0; end if;
  if not public.painel_has_module(array['TI_AGENTES', 'TI'], true) then
    raise exception 'Você não tem permissão para abrir uma fila.' using errcode = '42501';
  end if;
  if array_length(p_agent_ids, 1) > 50 then
    raise exception 'Uma nova fila pode conter no máximo 50 agentes.';
  end if;

  perform pg_advisory_xact_lock(872634503);

  foreach v_agent_id in array p_agent_ids loop
    if not (v_agent_id = any(v_allowed)) then
      raise exception 'Agente não permitido na esteira fixa: %', v_agent_id;
    end if;
    insert into public.grm_sync_jobs (agente_id, status, lane, pipeline_seq)
    values (v_agent_id, 'pendente', 'fixed', nextval('public.grm_fixed_pipeline_seq'));
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.reorder_grm_sync_queue(uuid[]) from public, anon;
revoke all on function public.enqueue_grm_sync_queue(text[]) from public, anon;
grant execute on function public.reorder_grm_sync_queue(uuid[]) to authenticated;
grant execute on function public.enqueue_grm_sync_queue(text[]) to authenticated;
grant usage, select on sequence public.grm_fixed_pipeline_seq to authenticated;
