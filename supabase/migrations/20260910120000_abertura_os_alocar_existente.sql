-- Logística > O.S > Abertura: evitar abrir O.S. duplicada. Quando já existe
-- uma O.S. no GRM para o mesmo cliente/contrato e ela ainda não foi
-- faturada, o ADM deve apenas localizar essa O.S. e alocar o número aqui
-- em vez de mandar o agente abrir uma O.S. nova.

create or replace function public.alocar_os_existente_abertura_os(
  p_id uuid,
  p_numero_os text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status_atual text;
  v_numero text := nullif(trim(coalesce(p_numero_os, '')), '');
  v_financeiro text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_numero is null then
    raise exception 'Informe o número da O.S. existente.';
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
    raise exception 'A solicitação não pode ser vinculada a uma O.S. existente no status atual: %', v_status_atual;
  end if;

  select financeiro
    into v_financeiro
    from public.operacional_os
   where numero_os = v_numero;

  if not found then
    raise exception 'O.S. % não encontrada.', v_numero;
  end if;

  if upper(coalesce(v_financeiro, '')) = 'FATURADA' then
    raise exception 'A O.S. % já está faturada e não pode receber um novo vínculo.', v_numero;
  end if;

  update public.logistica_abertura_os
     set status = 'CADASTRADO',
         numero_os_cadastrada = v_numero,
         observacao_adm = 'O.S. existente localizada e alocada pelo ADM (mesmo cliente/filial/contrato) em vez de abrir uma nova.',
         campos_corrigir = '[]'::jsonb,
         cadastrado_por = v_uid,
         cadastrado_em = now(),
         decidido_por = v_uid,
         decidido_em = now(),
         aprovado_por = v_uid,
         aprovado_em = now(),
         agente_job_id = null,
         processamento_iniciado_em = null,
         processamento_finalizado_em = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'CADASTRADO',
    'numero_os', v_numero,
    'abertura_os_id', p_id
  );
end;
$$;

revoke all on function public.alocar_os_existente_abertura_os(uuid, text) from public;
grant execute on function public.alocar_os_existente_abertura_os(uuid, text) to authenticated;

comment on function public.alocar_os_existente_abertura_os(uuid, text) is
  'ADM aloca uma O.S. já existente (não faturada) a uma solicitação de abertura, evitando abrir O.S. duplicada no GRM. Marca CADASTRADO direto, sem passar pelo agente sync-abrir-os.';
