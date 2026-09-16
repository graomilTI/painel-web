-- solicitar_aplicar_distribuicao_os tratava um job 'rodando' igual a um
-- 'pendente' pra decidir se enfileira um novo: um job em execução já leu o
-- snapshot do banco no início e não vê confirmações feitas depois que ele
-- começou. Bloquear o enfileiramento nesse caso deixava a confirmação sem
-- NENHUM job de acompanhamento agendado, à espera de qualquer outra ação (em
-- qualquer OS/gestor) disparar o próximo ciclo — gap de minutos observado em
-- produção (achado ao vivo 16/09, OS 92871: confirmação às 16:14:28 só foi
-- refletida no Graint às 16:30). Corrigido no mesmo padrão já aplicado em
-- enfileirarDistribuicaoOs (assets/js/programacao-equipe.js): só evita
-- duplicar quando já existe um job 'pendente' (ainda não iniciado); com
-- 'rodando', enfileira um novo 'pendente' que a lock de
-- claim_next_grm_sync_job já serializa pra rodar só depois do atual.
CREATE OR REPLACE FUNCTION public.solicitar_aplicar_distribuicao_os(p_motivo text DEFAULT 'distribuir_os'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and status = 'pendente'
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
$function$
;
