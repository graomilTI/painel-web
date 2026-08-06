-- Fluxo de aprovação da abertura de O.S.:
-- PENDENTE -> APROVADO (cria job sync-abrir-os) -> PROCESSANDO -> CADASTRADO
--          -> CORRIGIR (retorna ao Gestor)
--          -> RECUSADO (encerra sem job)

alter table if exists public.logistica_abertura_os
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists decidido_por uuid,
  add column if not exists decidido_em timestamptz,
  add column if not exists agente_job_id uuid,
  add column if not exists processamento_iniciado_em timestamptz,
  add column if not exists processamento_finalizado_em timestamptz,
  add column if not exists erro_agente text,
  add column if not exists tentativas_agente integer not null default 0;
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.logistica_abertura_os'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.logistica_abertura_os drop constraint %I', r.conname);
  end loop;
exception
  when undefined_table then null;
end $$;
alter table if exists public.logistica_abertura_os
  add constraint logistica_abertura_os_status_check
  check (status in ('PENDENTE','APROVADO','PROCESSANDO','CORRIGIR','RECUSADO','CADASTRADO','ERRO'));
create index if not exists idx_logistica_abertura_os_status_created
  on public.logistica_abertura_os (status, created_at);
create table if not exists public.grm_abertura_os_execucoes (
  id uuid primary key default gen_random_uuid(),
  abertura_os_id uuid not null references public.logistica_abertura_os(id) on delete cascade,
  status text not null default 'INICIADA',
  dry_run boolean not null default false,
  numero_os text,
  mensagem text,
  detalhes jsonb not null default '{}'::jsonb,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_grm_abertura_os_execucoes_solicitacao
  on public.grm_abertura_os_execucoes (abertura_os_id, created_at desc);
alter table public.grm_abertura_os_execucoes enable row level security;
drop policy if exists grm_abertura_os_execucoes_select_authenticated on public.grm_abertura_os_execucoes;
create policy grm_abertura_os_execucoes_select_authenticated
  on public.grm_abertura_os_execucoes
  for select
  to authenticated
  using (true);
create or replace function public.decidir_abertura_os(
  p_id uuid,
  p_acao text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_acao text := upper(trim(coalesce(p_acao, '')));
  v_status_atual text;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_acao not in ('OK', 'CORRIGIR', 'RECUSAR') then
    raise exception 'Ação inválida. Use OK, CORRIGIR ou RECUSAR.';
  end if;

  if v_acao in ('CORRIGIR', 'RECUSAR') and nullif(trim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Informe o motivo para corrigir ou recusar.';
  end if;

  select status
    into v_status_atual
  from public.logistica_abertura_os
  where id = p_id
  for update;

  if not found then
    raise exception 'Solicitação de abertura não encontrada.';
  end if;

  if v_acao = 'OK' then
    if v_status_atual not in ('PENDENTE', 'ERRO') then
      raise exception 'A solicitação não pode ser aprovada no status atual: %', v_status_atual;
    end if;

    update public.logistica_abertura_os
       set status = 'APROVADO',
           observacao_adm = nullif(trim(coalesce(p_observacao, '')), ''),
           aprovado_por = v_uid,
           aprovado_em = now(),
           decidido_por = v_uid,
           decidido_em = now(),
           processamento_iniciado_em = null,
           processamento_finalizado_em = null,
           erro_agente = null,
           updated_at = now()
     where id = p_id;

    insert into public.grm_sync_jobs (agente_id, status)
    values ('sync-abrir-os', 'pendente')
    returning id into v_job_id;

    update public.logistica_abertura_os
       set agente_job_id = v_job_id,
           updated_at = now()
     where id = p_id;

    return jsonb_build_object(
      'ok', true,
      'acao', 'OK',
      'status', 'APROVADO',
      'job_id', v_job_id,
      'abertura_os_id', p_id
    );
  end if;

  if v_status_atual not in ('PENDENTE', 'ERRO', 'APROVADO') then
    raise exception 'A solicitação não pode receber esta decisão no status atual: %', v_status_atual;
  end if;

  update public.logistica_abertura_os
     set status = case when v_acao = 'CORRIGIR' then 'CORRIGIR' else 'RECUSADO' end,
         observacao_adm = trim(p_observacao),
         decidido_por = v_uid,
         decidido_em = now(),
         aprovado_por = null,
         aprovado_em = null,
         agente_job_id = null,
         processamento_iniciado_em = null,
         processamento_finalizado_em = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'acao', v_acao,
    'status', case when v_acao = 'CORRIGIR' then 'CORRIGIR' else 'RECUSADO' end,
    'abertura_os_id', p_id
  );
end;
$$;
revoke all on function public.decidir_abertura_os(uuid, text, text) from public;
grant execute on function public.decidir_abertura_os(uuid, text, text) to authenticated;
comment on function public.decidir_abertura_os(uuid, text, text) is
  'Decisão ADM da abertura de O.S. OK enfileira sync-abrir-os; Corrigir e Recusar nunca criam job.';
create or replace function public.reenviar_abertura_os_corrigida(
  p_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select status into v_status
  from public.logistica_abertura_os
  where id = p_id
  for update;

  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_status <> 'CORRIGIR' then
    raise exception 'Somente solicitações em CORRIGIR podem ser reenviadas.';
  end if;

  update public.logistica_abertura_os
     set contratante_cliente = coalesce(nullif(trim(p_payload->>'contratante_cliente'), ''), contratante_cliente),
         filial_pagadora = coalesce(nullif(trim(p_payload->>'filial_pagadora'), ''), filial_pagadora),
         produtor = nullif(trim(p_payload->>'produtor'), ''),
         armazem_embarque = coalesce(nullif(trim(p_payload->>'armazem_embarque'), ''), armazem_embarque),
         cidade_embarque = coalesce(nullif(trim(p_payload->>'cidade_embarque'), ''), cidade_embarque),
         cidade_destino = coalesce(nullif(trim(p_payload->>'cidade_destino'), ''), cidade_destino),
         local_destino = coalesce(nullif(trim(p_payload->>'local_destino'), ''), local_destino),
         numero_contrato = coalesce(nullif(trim(p_payload->>'numero_contrato'), ''), numero_contrato),
         produto = coalesce(nullif(trim(p_payload->>'produto'), ''), produto),
         tipo_produto = coalesce(nullif(trim(p_payload->>'tipo_produto'), ''), tipo_produto),
         volume_inicial = coalesce(nullif(p_payload->>'volume_inicial', '')::numeric, volume_inicial),
         regional = coalesce(nullif(trim(p_payload->>'regional'), ''), regional),
         troca_notas = coalesce(nullif(trim(p_payload->>'troca_notas'), ''), troca_notas),
         servico = coalesce(nullif(trim(p_payload->>'servico'), ''), servico),
         status = 'PENDENTE',
         observacao_adm = null,
         decidido_por = null,
         decidido_em = null,
         aprovado_por = null,
         aprovado_em = null,
         agente_job_id = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'status', 'PENDENTE', 'abertura_os_id', p_id);
end;
$$;
revoke all on function public.reenviar_abertura_os_corrigida(uuid, jsonb) from public;
grant execute on function public.reenviar_abertura_os_corrigida(uuid, jsonb) to authenticated;
