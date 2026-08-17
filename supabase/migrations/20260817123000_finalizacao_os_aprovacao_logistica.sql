-- Solicitações manuais de finalização passam pela decisão da Logística.
-- O clique do gestor apenas mantém a OS na fila; somente o Check enfileira o agente.

create or replace function public.solicitar_finalizacao_os_gestor(
  p_motivo text default 'programacao'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pendencias integer := 0;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os
  where status_gestor = 'FINALIZAR'
    and coalesce(status_logistica, 'PENDENTE') = 'PENDENTE';

  return jsonb_build_object(
    'ok', true,
    'enfileirado', false,
    'job_existente', false,
    'pendencias', v_pendencias,
    'motivo', coalesce(p_motivo, 'programacao'),
    'destino', 'LOGISTICA_FINALIZACAO'
  );
end;
$$;

revoke all on function public.solicitar_finalizacao_os_gestor(text) from public, anon;
grant execute on function public.solicitar_finalizacao_os_gestor(text) to authenticated;

comment on function public.solicitar_finalizacao_os_gestor(text) is
  'Mantém solicitações FINALIZAR na fila da Logística sem disparar o agente.';

create or replace function public.decidir_finalizacao_os_logistica(
  p_os_id uuid,
  p_aprovar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_os public.operacional_os%rowtype;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.painel_has_module(
    array['LOGISTICA_OS', 'LOGISTICA_FINALIZACAO_OS', 'FINALIZACAO_OS', 'LOGISTICA'],
    true
  ) then
    raise exception 'Sem permissão para decidir finalizações de O.S.' using errcode = '42501';
  end if;

  select *
    into v_os
  from public.operacional_os
  where id = p_os_id
  for update;

  if v_os.id is null then
    raise exception 'O.S. não encontrada';
  end if;
  if coalesce(v_os.status_gestor, '') <> 'FINALIZAR' then
    raise exception 'A O.S. não possui solicitação de finalização pendente';
  end if;

  if not p_aprovar then
    update public.operacional_os
       set status_gestor = null,
           status_logistica = 'RECUSADA',
           updated_at = now()
     where id = p_os_id;
    return jsonb_build_object('ok', true, 'decisao', 'RECUSADA', 'job_id', null);
  end if;

  update public.operacional_os
     set status_logistica = 'APROVADA',
         updated_at = now()
   where id = p_os_id;

  -- Evita jobs duplicados quando duas OS são aprovadas ao mesmo tempo.
  perform pg_advisory_xact_lock(872634503);

  select id
    into v_job_id
  from public.grm_sync_jobs
  where agente_id = 'sync-finalizar-os'
    and status in ('pendente', 'rodando')
  order by created_at desc
  limit 1;

  if v_job_id is null then
    insert into public.grm_sync_jobs (agente_id, status)
    values ('sync-finalizar-os', 'pendente')
    returning id into v_job_id;
  end if;

  return jsonb_build_object('ok', true, 'decisao', 'APROVADA', 'job_id', v_job_id);
end;
$$;

revoke all on function public.decidir_finalizacao_os_logistica(uuid, boolean) from public, anon;
grant execute on function public.decidir_finalizacao_os_logistica(uuid, boolean) to authenticated;

comment on function public.decidir_finalizacao_os_logistica(uuid, boolean) is
  'Registra Check/X da Logística; somente o Check aprova e enfileira a finalização no GRM.';
