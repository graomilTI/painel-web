-- Hotfix de segurança para o agente sync-finalizar-os.
--
-- Regra operacional:
--   1) finalização automática somente quando o Remanescente atual = 0,00;
--   2) com Remanescente diferente de zero, somente após aprovação explícita
--      da Logística;
--   3) tempo sem movimento no Relatório de Cargas nunca autoriza finalizar.
--
-- O agente permanece desabilitado até que a implementação Node também seja
-- limpa do critério legado SEM_MOVIMENTO_5_DIAS.

insert into public.grm_sync_agent_settings (
  agent_id,
  queue_lane,
  interval_minutes,
  enabled,
  updated_at
)
values ('sync-finalizar-os', 'alteracoes', 60, false, now())
on conflict (agent_id) do update
set enabled = false,
    queue_lane = excluded.queue_lane,
    updated_at = now();

-- O Gestor não deve conseguir enfileirar o agente enquanto o kill switch
-- estiver desligado.
create or replace function public.solicitar_finalizacao_os_gestor(
  p_motivo text default 'programacao'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pendencias integer := 0;
  v_job_existente uuid;
  v_novo_job uuid;
  v_data_operacional date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agente_habilitado boolean := true;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select coalesce(s.enabled, true)
    into v_agente_habilitado
  from public.grm_sync_agent_settings s
  where s.agent_id = 'sync-finalizar-os';

  if coalesce(v_agente_habilitado, true) = false then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'agente_habilitado', false,
      'pendencias', 0,
      'data_operacional', v_data_operacional,
      'motivo', coalesce(p_motivo, 'programacao'),
      'bloqueio', 'Agente de finalização temporariamente desabilitado por segurança.'
    );
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os
  where status_gestor = 'FINALIZAR'
    and coalesce(status_logistica, 'PENDENTE') = 'PENDENTE'
    and enviado_logistica_em is not null
    and (enviado_logistica_em at time zone 'America/Sao_Paulo')::date = v_data_operacional;

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'agente_habilitado', true,
      'pendencias', 0,
      'data_operacional', v_data_operacional,
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
      'agente_habilitado', true,
      'job_id', v_job_existente,
      'pendencias', v_pendencias,
      'data_operacional', v_data_operacional,
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
    'agente_habilitado', true,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'data_operacional', v_data_operacional,
    'motivo', coalesce(p_motivo, 'programacao')
  );
end;
$function$;

-- Compatibilidade com versões antigas do agente: a branch legada
-- SEM_MOVIMENTO_5_DIAS depende deste RPC. Retornar zero linhas torna esse
-- critério inelegível sem interferir nos dois caminhos válidos acima.
create or replace function public.grm_ultima_movimentacao_os(p_oss text[])
returns table(
  numero_os text,
  ultima_movimentacao timestamptz,
  total_cargas bigint
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select null::text, null::timestamptz, null::bigint
  where false;
$function$;

comment on function public.grm_ultima_movimentacao_os(text[]) is
'Compatibilidade do agente de finalização: inatividade não autoriza finalizar O.S.; automático somente com remanescente zero, ou saldo mediante aprovação da Logística.';
