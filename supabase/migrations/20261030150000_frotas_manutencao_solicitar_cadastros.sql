-- Frotas · Manutenção: pedido enviado pelo Checklist/Veículos vira um cartão em Corretiva > Solicitações.
-- 1) Quem só tem Cadastros (Checklists / Veículos) pode ENVIAR o pedido; antes a RPC exigia o módulo Manutenção ou a
--    supervisão do veículo. O pedido nasce 'solicitada' (aviso no sino/push da equipe, trigger notificar_frotas_manutencao)
--    e a equipe decide cotar, aprovar e quando fazer.
-- 2) A RPC ganha p_motorista_nome (motorista do checklist); sem ele, o trigger usa o motorista atual do veículo.
--    O nome de quem enviou vem do trigger (solicitante_nome em branco = usuário logado).
-- A assinatura de 8 parâmetros é removida (a nova aceita as mesmas chamadas, com o último parâmetro opcional).

drop function if exists public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb, text);

create or replace function public.frotas_manutencao_solicitar(
  p_veiculo_id uuid,
  p_descricao text,
  p_prioridade text default 'normal',
  p_origem text default 'manual',
  p_checklist_id uuid default null,
  p_veiculo_parado boolean default false,
  p_itens jsonb default '[]'::jsonb,
  p_solicitante_nome text default null,
  p_motorista_nome text default null)
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
    -- Cadastros (Checklists, Veículos): só ENVIA o pedido; a equipe de Manutenção decide cotar, aprovar e quando fazer.
    or public.painel_has_module(array['frotas_checklists', 'checklists', 'frotas_veiculos', 'veiculos', 'veículos', 'frota_veiculos'], false)
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

  insert into public.frotas_manutencoes (veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado, solicitante_nome, motorista_nome)
  values (p_veiculo_id, btrim(p_descricao), coalesce(p_prioridade, 'normal'), coalesce(p_origem, 'manual'),
          p_checklist_id, coalesce(p_veiculo_parado, false), nullif(left(btrim(coalesce(p_solicitante_nome, '')), 120), ''),
          nullif(left(btrim(coalesce(p_motorista_nome, '')), 120), ''))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id, componentes, pecas)
    values (v_id,
            (it ->> 'categoria_codigo')::smallint,
            nullif(it ->> 'natureza', ''),
            coalesce(nullif(it ->> 'tipo_item', ''), 'servico'),
            coalesce(nullif(it ->> 'descricao', ''), btrim(p_descricao)),
            nullif(it ->> 'plano_id', '')::uuid,
            case when jsonb_typeof(it -> 'componentes') = 'array'
                 then array(select btrim(c) from jsonb_array_elements_text(it -> 'componentes') c where btrim(c) <> '')
                 else '{}'::text[] end,
            case when jsonb_typeof(it -> 'pecas') = 'object' then it -> 'pecas' else '{}'::jsonb end);
  end loop;

  return v_id;
end;
$$;

grant execute on function public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb, text, text) to authenticated;
