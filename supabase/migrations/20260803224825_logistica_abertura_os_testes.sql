-- Campo "Testes" na Abertura de O.S.: multi-seleção condicional por produto
-- (Milho/Sorgo: Teste Aflatoxina Qualitativo/Quantitativo/Qualitativo e
-- Quantitativo; Soja: Teste Intacta e/ou Teste GMO Free; Trigo: Teste
-- Vomitoxina). Guardado como jsonb {"categoria":"MILHO","opcoes":["..."]}
-- pra não precisar de N colunas booleanas e já vir versionável se a regra
-- de negócio mudar.

alter table public.logistica_abertura_os
  add column if not exists testes jsonb not null default '{}'::jsonb;

comment on column public.logistica_abertura_os.testes is
  'Testes solicitados na abertura, condicionados ao produto. Formato: {"categoria":"MILHO|SORGO|SOJA|TRIGO","opcoes":["AFLATOXINA_QUALITATIVO",...]}';

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
         testes = coalesce(p_payload->'testes', testes),
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

select pg_notify('pgrst', 'reload schema');;
