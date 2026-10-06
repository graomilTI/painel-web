-- Botão "Converter GPS pendentes" passa a converter também o destino (antes só o botão de uma
-- corrida fazia), igual à conversão automática da importação.

create or replace function public.uber_gps_solicitar(p_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_desde timestamptz := clock_timestamp();
  v_enfileiradas integer := 0;
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.uber_gorjeta_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para converter GPS do Uber';
  end if;

  insert into public.uber_gps_fila (corrida_id, status, incluir_destino, solicitado_por, solicitado_em)
  select c.id, 'PENDENTE', true, v_uid, v_desde
    from public.conferencia_uber_corridas c
   where nullif(btrim(coalesce(c.endereco_partida, '')), '') is not null
     and (
       (p_ids is not null and c.id = any(p_ids))
       or (
         p_ids is null
         and c.partida_latitude is null
         and c.status_validacao in ('PENDENTE', 'ATENCAO', 'ATENÇÃO')
       )
     )
  on conflict (corrida_id) do update
     set status = 'PENDENTE',
         incluir_destino = excluded.incluir_destino,
         motivo = null, detalhe = null, provedor = null, precisao = null, resultado = null,
         tentativas = 0, solicitado_por = excluded.solicitado_por,
         solicitado_em = excluded.solicitado_em,
         iniciado_em = null, processado_em = null, updated_at = now()
   where public.uber_gps_fila.status <> 'PROCESSANDO';
  get diagnostics v_enfileiradas = row_count;

  if v_enfileiradas > 0 then
    v_job := public.uber_gps_solicitar_job('uber_gps_painel', v_uid::text);
  end if;

  return jsonb_build_object(
    'desde', v_desde,
    'enfileiradas', v_enfileiradas,
    'job_id', v_job,
    'agente_ativo', exists (
      select 1 from public.grm_sync_agent_settings where agent_id = 'sync-uber-geocodificar' and enabled is true
    )
  );
end;
$$;

