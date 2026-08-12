alter table public.grm_sync_jobs
  add column if not exists memory_peak_mb numeric(10,2);

comment on column public.grm_sync_jobs.memory_peak_mb is
  'Pico de memória RSS, em MB, do processo do agente e seus filhos durante a execução.';

-- A primeira versão limitava a reorganização à lane fixa. O quadro novo
-- permite ordenar também as duas filas de saída, sempre uma lane por operação.
create or replace function public.reorder_grm_sync_queue(p_job_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job_id uuid;
  v_lane text;
begin
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then return; end if;
  if not public.painel_has_module(array['TI_AGENTES', 'TI'], true) then
    raise exception 'Você não tem permissão para reorganizar a fila.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(872634503);
  select min(job.lane) into v_lane
  from unnest(p_job_ids) requested(id)
  join public.grm_sync_jobs job on job.id = requested.id;

  if v_lane is null or exists (
    select 1 from unnest(p_job_ids) requested(id)
    left join public.grm_sync_jobs job on job.id = requested.id
    where job.id is null or job.status <> 'pendente' or job.lane is distinct from v_lane
  ) then
    raise exception 'A fila mudou enquanto era reorganizada. Atualize a tela e tente novamente.';
  end if;

  foreach v_job_id in array p_job_ids loop
    update public.grm_sync_jobs
       set pipeline_seq = nextval('public.grm_fixed_pipeline_seq')
     where id = v_job_id and status = 'pendente' and lane = v_lane;
  end loop;
end;
$$;
