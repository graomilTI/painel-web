-- Logística > O.S > Abertura: granularidade na correção (ADM marca QUAIS
-- campos estão errados, não só um texto livre) e novo aviso "ponto com
-- problema" (local de embarque/destino com problema físico/logístico,
-- reportado pelo ADM ao Gestor sem mudar o status da solicitação).

alter table if exists public.logistica_abertura_os
  add column if not exists campos_corrigir jsonb not null default '[]'::jsonb,
  add column if not exists pontos_problema jsonb not null default '[]'::jsonb;

comment on column public.logistica_abertura_os.campos_corrigir is
  'Array de {campo,label} marcados pelo ADM ao pedir correção — granularidade além do texto livre em observacao_adm. Limpo ao aprovar/recusar/reenviar.';
comment on column public.logistica_abertura_os.pontos_problema is
  'Histórico de alertas "ponto com problema" reportados pelo ADM (local de embarque/destino). Não muda o status — só some para o Gestor. Array de {descricao,por,em}.';

-- decidir_abertura_os: adiciona p_campos_corrigir (só usado em CORRIGIR;
-- limpo nas demais ações). Muda a assinatura (3 -> 4 parâmetros), então
-- "create or replace" criaria um OVERLOAD novo em vez de substituir — dropa
-- a versão antiga primeiro pra não deixar as duas coexistindo.
drop function if exists public.decidir_abertura_os(uuid, text, text);

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
  'Decisão ADM da abertura de O.S. OK enfileira sync-abrir-os; Corrigir (com campos_corrigir) e Recusar nunca criam job.';

-- reenviar_abertura_os_corrigida: limpa campos_corrigir ao reenviar (o
-- Gestor já tratou os campos apontados).
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

  select status
    into v_status
    from public.logistica_abertura_os
   where id = p_id
   for update;

  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;

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
         campos_corrigir = '[]'::jsonb,
         decidido_por = null,
         decidido_em = null,
         aprovado_por = null,
         aprovado_em = null,
         agente_job_id = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'PENDENTE',
    'abertura_os_id', p_id
  );
end;
$$;

revoke all on function public.reenviar_abertura_os_corrigida(uuid, jsonb) from public;
grant execute on function public.reenviar_abertura_os_corrigida(uuid, jsonb) to authenticated;

-- Novo: "Informar ponto com problema" — alerta paralelo do ADM pro Gestor
-- (ex.: acesso ruim no armazém de embarque), não é uma decisão sobre a
-- solicitação e não muda o status.
create or replace function public.informar_ponto_problema_abertura_os(
  p_id uuid,
  p_descricao text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_descricao text := nullif(trim(coalesce(p_descricao, '')), '');
  v_entry jsonb;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_descricao is null then
    raise exception 'Descreva o ponto com problema.';
  end if;

  perform 1 from public.logistica_abertura_os where id = p_id for update;
  if not found then
    raise exception 'Solicitação de abertura não encontrada.';
  end if;

  v_entry := jsonb_build_object('descricao', v_descricao, 'por', v_uid, 'em', now());

  update public.logistica_abertura_os
     set pontos_problema = pontos_problema || jsonb_build_array(v_entry),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'abertura_os_id', p_id, 'ponto', v_entry);
end;
$$;

revoke all on function public.informar_ponto_problema_abertura_os(uuid, text) from public;
grant execute on function public.informar_ponto_problema_abertura_os(uuid, text) to authenticated;

comment on function public.informar_ponto_problema_abertura_os(uuid, text) is
  'ADM avisa o Gestor de um problema de local (embarque/destino) numa solicitação de abertura de O.S., sem alterar o status.';

-- Atualiza imediatamente o catálogo do PostgREST/Supabase REST.
select pg_notify('pgrst', 'reload schema');
