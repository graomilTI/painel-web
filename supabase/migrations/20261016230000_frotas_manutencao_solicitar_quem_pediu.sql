-- Frotas · Manutenção: "Nova manutenção" registra pedidos que chegam por WhatsApp.
-- Quem registra (usuário do administrativo) informa QUEM PEDIU; o nome vai em solicitante_nome e quem registrou
-- continua no histórico da ficha (primeiro evento da linha do tempo). Sem o campo, vale o nome de quem registra.
-- A assinatura ganha um parâmetro: a antiga é removida para não haver duas versões chamáveis.

drop function if exists public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb);

create or replace function public.frotas_manutencao_solicitar(
  p_veiculo_id uuid,
  p_descricao text,
  p_prioridade text default 'normal',
  p_origem text default 'manual',
  p_checklist_id uuid default null,
  p_veiculo_parado boolean default false,
  p_itens jsonb default '[]'::jsonb,
  p_solicitante_nome text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_id uuid;
  it jsonb;
begin
  select id, placa, supervisao into v from public.frotas_veiculos where id = p_veiculo_id;
  if not found then
    raise exception 'Veículo não encontrado.' using errcode = 'no_data_found';
  end if;

  if not (
    public.painel_has_module(array['frotas_manutencao'], false)
    or (
      public.abertura_os_norm_sup(v.supervisao) <> ''
      and exists (
        select 1 from public.programacao_usuario_supervisoes s
         where s.ativo = true
           and (s.auth_user_id = auth.uid()
                or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid()))
           and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(v.supervisao))
    )
  ) then
    raise exception 'Sem permissão para solicitar manutenção deste veículo.' using errcode = 'insufficient_privilege';
  end if;

  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    raise exception 'Descreva o problema ou o serviço.' using errcode = 'check_violation';
  end if;

  -- Mesma origem não abre duas vezes (checklist já com solicitação aberta).
  if p_checklist_id is not null then
    select m.id into v_id from public.frotas_manutencoes m
     where m.checklist_id = p_checklist_id and m.status not in ('cancelada','reprovada') limit 1;
    if found then
      return v_id;
    end if;
  end if;

  insert into public.frotas_manutencoes (veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado, solicitante_nome)
  values (p_veiculo_id, btrim(p_descricao), coalesce(p_prioridade, 'normal'), coalesce(p_origem, 'manual'),
          p_checklist_id, coalesce(p_veiculo_parado, false), nullif(left(btrim(coalesce(p_solicitante_nome, '')), 120), ''))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id)
    values (v_id,
            (it ->> 'categoria_codigo')::smallint,
            nullif(it ->> 'natureza', ''),
            coalesce(nullif(it ->> 'tipo_item', ''), 'servico'),
            coalesce(nullif(it ->> 'descricao', ''), btrim(p_descricao)),
            nullif(it ->> 'plano_id', '')::uuid);
  end loop;

  return v_id;
end;
$$;

grant execute on function public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb, text) to authenticated;
