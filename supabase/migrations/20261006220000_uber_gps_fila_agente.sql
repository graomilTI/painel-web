-- Conversão de endereço do Uber em GPS passa a rodar no servidor cPanel (agente
-- sync-uber-geocodificar), em vez da Edge Function.
--
-- Motivo: em 06/10/2026 o OpenStreetMap (Nominatim) passou a responder HTTP 403 ao IP
-- das Edge Functions do Supabase; só o Photon respondia (77% de acerto contra 83% com
-- o Nominatim). O servidor cPanel tem IP liberado no Nominatim e roda a mesma cadeia
-- (Nominatim -> Photon) sem depender do token diário do GRM.
--
-- Fluxo: o painel chama uber_gps_solicitar() -> entram linhas em uber_gps_fila e um job
-- do agente é criado -> o agente converte uma a uma, grava as coordenadas em
-- conferencia_uber_corridas, chama uber_validar_por_os_laudo() e marca cada linha da
-- fila com o resultado -> o painel acompanha a fila e recarrega as corridas afetadas.

-- ---------------------------------------------------------------------------
create table if not exists public.uber_gps_fila (
  id uuid primary key default gen_random_uuid(),
  corrida_id uuid not null references public.conferencia_uber_corridas(id) on delete cascade,
  status text not null default 'PENDENTE',
  incluir_destino boolean not null default false,
  motivo text,
  detalhe text,
  provedor text,
  precisao text,
  resultado jsonb,
  tentativas integer not null default 0,
  solicitado_por uuid,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  processado_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint uber_gps_fila_status_check
    check (status in ('PENDENTE', 'PROCESSANDO', 'OK', 'NAO_LOCALIZADO', 'ERRO')),
  constraint uber_gps_fila_corrida_unica unique (corrida_id)
);

comment on table public.uber_gps_fila is
  'Fila de corridas Uber a converter de endereço em GPS pelo agente sync-uber-geocodificar (uma linha por corrida; reenfileirar reaproveita a linha).';

create index if not exists uber_gps_fila_status_idx on public.uber_gps_fila (status, solicitado_em);

alter table public.uber_gps_fila enable row level security;

drop policy if exists authenticated_read_uber_gps_fila on public.uber_gps_fila;
create policy authenticated_read_uber_gps_fila on public.uber_gps_fila
  as permissive for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Pede um job do agente (se estiver habilitado e não houver outro na fila).
create or replace function public.uber_gps_solicitar_job(p_origem text, p_usuario text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_job uuid;
begin
  if not exists (
    select 1 from public.grm_sync_agent_settings
     where agent_id = 'sync-uber-geocodificar' and enabled is true
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-uber-geocodificar' and status in ('pendente', 'rodando', 'processando')
  ) then
    return null;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  values ('sync-uber-geocodificar', 'pendente', p_usuario,
          jsonb_build_object('origem', coalesce(p_origem, 'uber_gps')))
  returning id into v_job;

  return v_job;
end;
$$;

revoke all on function public.uber_gps_solicitar_job(text, text) from public;

-- ---------------------------------------------------------------------------
-- Botões do painel: "GPS" (uma corrida: p_ids com 1 id, converte partida e destino) e
-- "Converter GPS pendentes" (p_ids nulo: todas as pendentes sem coordenada de partida).
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
  v_unico boolean := coalesce(array_length(p_ids, 1), 0) = 1;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.uber_gorjeta_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para converter GPS do Uber';
  end if;

  insert into public.uber_gps_fila (corrida_id, status, incluir_destino, solicitado_por, solicitado_em)
  select c.id, 'PENDENTE', v_unico, v_uid, v_desde
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

revoke all on function public.uber_gps_solicitar(uuid[]) from public;
grant execute on function public.uber_gps_solicitar(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Agente: lane de entrada financeira B (relatórios horários, nada urgente), sem
-- mutex (não abre o GRM) e prioridade acima dos relatórios pra responder ao clique.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-uber-geocodificar', 'entrada_financeiro_b', 0, true,
  'entrada_financeiro_b', 'entrada', 'light', 70,
  10, '[]'::jsonb, null
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();
