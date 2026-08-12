-- Dispara o agente aplicar-distribuicao-os quando o gestor fica 5 min sem
-- atividade na tela Distribuir O.S, troca de tela ou fecha a aba — mesmo
-- padrão usado em solicitar_finalizacao_os_gestor (Programação). Substitui o
-- cron fixo de 15 min (ver migration seguinte). Idempotente: não duplica job
-- pendente/rodando, e só enfileira se houver O.S. ATENDER com colaborador
-- indicado numa supervisão com distribuicao_os_automatica = true.

create or replace function public.solicitar_aplicar_distribuicao_os(
  p_motivo text default 'distribuir_os'
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
  from public.operacional_os os
  where os.status_gestor = 'ATENDER'
    and coalesce(os.status_conferencia, '') <> 'AJUSTADA'
    and exists (
      select 1 from public.operacional_os_colaboradores oc where oc.os_id = os.id
    )
    and exists (
      select 1 from public.supervisoes s
      where s.distribuicao_os_automatica = true
        and s.nome = os.supervisao
    );

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'pendencias', 0,
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  select id
    into v_job_existente
  from public.grm_sync_jobs
  where agente_id = 'aplicar-distribuicao-os'
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
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('aplicar-distribuicao-os', 'pendente')
  returning id into v_novo_job;

  return jsonb_build_object(
    'ok', true,
    'enfileirado', true,
    'job_existente', false,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'motivo', coalesce(p_motivo, 'distribuir_os')
  );
end;
$$;

revoke all on function public.solicitar_aplicar_distribuicao_os(text) from public;
grant execute on function public.solicitar_aplicar_distribuicao_os(text) to authenticated;

comment on function public.solicitar_aplicar_distribuicao_os(text) is
  'Enfileira aplicar-distribuicao-os quando existem OS ATENDER com colaborador indicado em supervisão com distribuicao_os_automatica=true, sem duplicar job pendente/rodando.';
