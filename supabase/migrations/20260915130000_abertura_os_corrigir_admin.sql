-- Logística ADM > Abertura de O.S.: até aqui o ícone ✎ (Corrigir) só deixava
-- o ADM marcar quais campos estão errados e devolvia a solicitação pro
-- Gestor digitar de novo (status CORRIGIR) — sem jeito do próprio ADM editar
-- o valor e reenviar direto pro agente, mesmo quando ele já sabe a correção
-- (ex.: achado ao vivo 15/09, armazém "Arm.Sementes produtiva" não resolvido
-- em operacional_pontos_embarque por falta de cadastro — ver
-- [[painel-web-abertura-os-sementes-produtiva-ponto-embarque]]).
--
-- De quebra, corrige um bug real no reenvio: decidir_abertura_os('OK') nunca
-- zerava tentativas_agente. Uma solicitação que já bateu
-- ABERTURA_OS_MAX_TENTATIVAS (padrão 3) fica travada pra sempre em ERRO —
-- mesmo clicando ✓ "Confirmar (tentar novamente)" de novo, o agente lê
-- tentativas_agente=3 do banco, soma 1, estoura o limite ANTES de tentar, e
-- marca erro de novo na hora (ver processarSolicitacao em
-- agentes-grm-sync/grm-sync-abrir-os.js:1258-1279). Sem esse reset, a própria
-- mensagem "revise manualmente e reenvie" que o agente mostra é enganosa.

create or replace function public.decidir_abertura_os(
  p_id uuid,
  p_acao text,
  p_observacao text default null,
  p_campos_corrigir jsonb default '[]'::jsonb
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
  v_campos jsonb := coalesce(p_campos_corrigir, '[]'::jsonb);
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_acao not in ('OK', 'CORRIGIR', 'RECUSAR') then
    raise exception 'Ação inválida. Use OK, CORRIGIR ou RECUSAR.';
  end if;

  if v_acao in ('CORRIGIR', 'RECUSAR')
     and nullif(trim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Informe o motivo para corrigir ou recusar.';
  end if;

  if v_acao = 'CORRIGIR' and jsonb_typeof(v_campos) = 'array' and jsonb_array_length(v_campos) = 0 then
    raise exception 'Selecione ao menos um campo para solicitar correção.';
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
           campos_corrigir = '[]'::jsonb,
           aprovado_por = v_uid,
           aprovado_em = now(),
           decidido_por = v_uid,
           decidido_em = now(),
           processamento_iniciado_em = null,
           processamento_finalizado_em = null,
           erro_agente = null,
           tentativas_agente = 0,
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
         campos_corrigir = case when v_acao = 'CORRIGIR' then v_campos else '[]'::jsonb end,
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

revoke all on function public.decidir_abertura_os(uuid, text, text, jsonb) from public;
grant execute on function public.decidir_abertura_os(uuid, text, text, jsonb) to authenticated;

comment on function public.decidir_abertura_os(uuid, text, text, jsonb) is
  'Decisão ADM da abertura de O.S. OK enfileira sync-abrir-os e zera tentativas_agente; Corrigir (com campos_corrigir) e Recusar nunca criam job.';

-- Nova: ADM edita os campos da solicitação diretamente (sem devolver pro
-- Gestor) e já reenfileira pro agente tentar de novo no GRM. Mesma janela de
-- status que a aprovação normal (PENDENTE/ERRO) — reusa o payload de
-- reenviar_abertura_os_corrigida (mesmas colunas, incluindo uf_embarque/
-- uf_destino) mas sem exigir status=CORRIGIR nem depender do Gestor reenviar.
create or replace function public.corrigir_e_reenviar_abertura_os(
  p_id uuid,
  p_payload jsonb,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status_atual text;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select status
    into v_status_atual
    from public.logistica_abertura_os
   where id = p_id
   for update;

  if not found then
    raise exception 'Solicitação de abertura não encontrada.';
  end if;

  if v_status_atual not in ('PENDENTE', 'ERRO') then
    raise exception 'A solicitação não pode ser corrigida pelo ADM no status atual: %', v_status_atual;
  end if;

  update public.logistica_abertura_os
     set contratante_cliente = coalesce(nullif(trim(p_payload->>'contratante_cliente'), ''), contratante_cliente),
         filial_pagadora = coalesce(nullif(trim(p_payload->>'filial_pagadora'), ''), filial_pagadora),
         produtor = nullif(trim(p_payload->>'produtor'), ''),
         armazem_embarque = coalesce(nullif(trim(p_payload->>'armazem_embarque'), ''), armazem_embarque),
         uf_embarque = coalesce(nullif(trim(p_payload->>'uf_embarque'), ''), uf_embarque),
         cidade_embarque = coalesce(nullif(trim(p_payload->>'cidade_embarque'), ''), cidade_embarque),
         uf_destino = coalesce(nullif(trim(p_payload->>'uf_destino'), ''), uf_destino),
         cidade_destino = coalesce(nullif(trim(p_payload->>'cidade_destino'), ''), cidade_destino),
         local_destino = coalesce(nullif(trim(p_payload->>'local_destino'), ''), local_destino),
         numero_contrato = coalesce(nullif(trim(p_payload->>'numero_contrato'), ''), numero_contrato),
         produto = coalesce(nullif(trim(p_payload->>'produto'), ''), produto),
         tipo_produto = coalesce(nullif(trim(p_payload->>'tipo_produto'), ''), tipo_produto),
         volume_inicial = coalesce(nullif(p_payload->>'volume_inicial', '')::numeric, volume_inicial),
         regional = coalesce(nullif(trim(p_payload->>'regional'), ''), regional),
         troca_notas = coalesce(nullif(trim(p_payload->>'troca_notas'), ''), troca_notas),
         servico = coalesce(nullif(trim(p_payload->>'servico'), ''), servico),
         status = 'APROVADO',
         observacao_adm = nullif(trim(coalesce(p_observacao, '')), ''),
         campos_corrigir = '[]'::jsonb,
         aprovado_por = v_uid,
         aprovado_em = now(),
         decidido_por = v_uid,
         decidido_em = now(),
         processamento_iniciado_em = null,
         processamento_finalizado_em = null,
         erro_agente = null,
         tentativas_agente = 0,
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
    'status', 'APROVADO',
    'job_id', v_job_id,
    'abertura_os_id', p_id
  );
end;
$$;

revoke all on function public.corrigir_e_reenviar_abertura_os(uuid, jsonb, text) from public;
grant execute on function public.corrigir_e_reenviar_abertura_os(uuid, jsonb, text) to authenticated;

comment on function public.corrigir_e_reenviar_abertura_os(uuid, jsonb, text) is
  'ADM edita os campos da solicitação de abertura de O.S. direto (sem devolver ao Gestor) e reenfileira sync-abrir-os, zerando tentativas_agente.';

select pg_notify('pgrst', 'reload schema');
