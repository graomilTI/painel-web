-- Dispara o agente de finalização quando o gestor sai da Programação ou fica
-- 5 minutos sem atividade. A função é idempotente: não cria job duplicado se
-- já houver sync-finalizar-os pendente ou rodando.

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
  v_job_existente uuid;
  v_novo_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os
  where status_gestor = 'FINALIZAR'
    and coalesce(status_logistica, 'PENDENTE') = 'PENDENTE';

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'pendencias', 0,
      'motivo', coalesce(p_motivo, 'programacao')
    );
  end if;

  select id
    into v_job_existente
  from public.grm_sync_jobs
  where agente_id = 'sync-finalizar-os'
    and status in ('pendente', 'rodando')
  order by created_at desc
  limit 1;

  if v_job_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', true,
      'job_id', v_job_existente,
      'pendencias', v_pendencias,
      'motivo', coalesce(p_motivo, 'programacao')
    );
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('sync-finalizar-os', 'pendente')
  returning id into v_novo_job;

  return jsonb_build_object(
    'ok', true,
    'enfileirado', true,
    'job_existente', false,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'motivo', coalesce(p_motivo, 'programacao')
  );
end;
$$;
revoke all on function public.solicitar_finalizacao_os_gestor(text) from public;
grant execute on function public.solicitar_finalizacao_os_gestor(text) to authenticated;
comment on function public.solicitar_finalizacao_os_gestor(text) is
  'Enfileira sync-finalizar-os quando existem OS marcadas FINALIZAR na Programação, sem duplicar job pendente/rodando.';
