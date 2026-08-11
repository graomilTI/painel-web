-- Refina o fix anterior (20260811180000): quando um grupo de estadias HOTEL
-- duplicadas mistura gente que já tem reserva ativa (deveria virar Estender)
-- com gente sem reserva nenhuma (deveria virar Reservar), a função criava
-- UMA solicitação só pra cidade/checkin/checkout inteiros — o card ficava
-- ambíguo pro usuário de Hotéis (extensionReservation() do front, ao achar
-- QUALQUER pessoa do grupo batendo com uma reserva, tratava o card inteiro
-- como extensão, escondendo Reservar até pra quem precisava dele).
--
-- Agora cada pessoa é classificada individualmente antes de agrupar: quem
-- bate com uma reserva ativa (mesma cidade, status em Reservados, checkout
-- encostando no novo checkin) vira uma solicitação separada por reserva-alvo;
-- quem não bate vira outra solicitação (nova). A solicitação SEMPRE é
-- criada (nunca é pulada) — quem decide estender de fato é o usuário de
-- Hotéis, clicando no botão Estender que já existe na tela.

create or replace function public.duplicar_programacao_dia(
  p_programacao_id uuid,
  p_datas date[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_origem public.programacao_dia%rowtype;
  v_data date;
  v_destino_id uuid;
  v_copiadas date[] := '{}';
  v_ignoradas date[] := '{}';
  v_datas date[];
  v_delta integer;
  v_tem_conteudo boolean;
  v_grupo record;
  v_nova_solicitacao_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'É necessário estar autenticado para duplicar uma programação.' using errcode = '42501';
  end if;

  select * into v_origem
  from public.programacao_dia
  where id = p_programacao_id;

  if not found then
    raise exception 'Programação de origem não encontrada.' using errcode = 'P0002';
  end if;

  if v_origem.supervisao is null or not exists (
    select 1
    from public.programacao_listar_supervisoes() permitida
    where upper(trim(permitida.nome)) = upper(trim(v_origem.supervisao))
  ) then
    raise exception 'Você não tem acesso à supervisão desta programação.' using errcode = '42501';
  end if;

  select coalesce(array_agg(data order by data), '{}') into v_datas
  from (select distinct unnest(coalesce(p_datas, '{}')) as data) escolhidas
  where data is not null and data <> v_origem.data_referencia;

  if coalesce(array_length(v_datas, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma data diferente da data de origem.';
  end if;
  if array_length(v_datas, 1) > 5 then
    raise exception 'Selecione no máximo 5 datas.';
  end if;

  foreach v_data in array v_datas loop
    perform pg_advisory_xact_lock(hashtextextended(coalesce(v_origem.supervisao, '') || '|' || v_data::text, 0));

    select id into v_destino_id
    from public.programacao_dia
    where data_referencia = v_data
      and supervisao is not distinct from v_origem.supervisao
    order by created_at desc
    limit 1;

    if v_destino_id is not null then
      select exists(select 1 from public.programacao_colaboradores where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_equipe where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_estadia where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_alimentacao where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_deslocamento where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_extras where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_frota_vinculos where programacao_id = v_destino_id)
      into v_tem_conteudo;

      if v_tem_conteudo then
        v_ignoradas := array_append(v_ignoradas, v_data);
        continue;
      end if;
    else
      insert into public.programacao_dia (
        data_referencia, coordenacao, supervisao, regional, status, criado_por
      ) values (
        v_data, v_origem.coordenacao, v_origem.supervisao, v_origem.regional, 'rascunho', (select auth.uid())
      ) returning id into v_destino_id;
    end if;

    v_delta := v_data - v_origem.data_referencia;

    insert into public.programacao_colaboradores (
      programacao_id, data_referencia, colaborador_id, nome_colaborador, cargo,
      coordenacao, supervisao, disponibilidade, observacao, placa_veiculo
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador, cargo,
      coordenacao, supervisao, disponibilidade, observacao, placa_veiculo
    from public.programacao_colaboradores
    where programacao_id = p_programacao_id;

    insert into public.programacao_equipe (
      programacao_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, rota_geometria, rota_calculada_em
    )
    select v_destino_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, null, null
    from public.programacao_equipe
    where programacao_id = p_programacao_id;

    insert into public.programacao_estadia (
      programacao_id, data_referencia, colaborador_id, nome_colaborador, tem_estadia,
      tipo_estadia, cidade, uf, diarias, checkin, checkout, observacao,
      alojamento_id, alojamento_nome
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador, tem_estadia,
      tipo_estadia, cidade, uf, diarias,
      case when checkin is null then null else checkin + v_delta end,
      case when checkout is null then null else checkout + v_delta end,
      observacao, alojamento_id, alojamento_nome
    from public.programacao_estadia
    where programacao_id = p_programacao_id;

    -- Cria a solicitação de hospedagem para as estadias HOTEL recém-copiadas.
    -- Cada pessoa é classificada antes de agrupar: quem bate com uma reserva
    -- ativa (Reservados, mesma cidade — UF só desempata quando as duas
    -- estiverem preenchidas — checkout encostando no novo checkin) entra
    -- numa solicitação separada por reserva-alvo; quem não bate entra numa
    -- solicitação "nova". Isso mantém cada card com uma ação só (Estender OU
    -- Reservar), nunca as duas misturadas no mesmo card.
    for v_grupo in (
      with candidatos as (
        select pe.nome_colaborador, trim(pe.cidade) as cidade, pe.uf, pe.checkin, pe.checkout
        from public.programacao_estadia pe
        where pe.programacao_id = v_destino_id
          and pe.tipo_estadia = 'HOTEL'
          and pe.checkin is not null
          and pe.checkout is not null
      ),
      matches as (
        select distinct on (c.nome_colaborador, c.checkin)
          c.nome_colaborador, c.checkin, hr.solicitacao_id as reserva_solicitacao_id
        from candidatos c
        join public.hospedagem_solicitacao_colaboradores hc on hc.nome_colaborador = c.nome_colaborador
        join public.hospedagem_reservas hr on hr.solicitacao_id = hc.solicitacao_id
        where hr.status_hospedagem in ('CHECKIN_PREVISTO', 'HOSPEDADO')
          and upper(trim(hr.cidade_hotel)) = upper(c.cidade)
          and (nullif(trim(hr.uf_hotel),'') is null or nullif(trim(c.uf),'') is null or upper(trim(hr.uf_hotel)) = upper(trim(c.uf)))
          and hr.data_checkout between c.checkin - 1 and c.checkin
        order by c.nome_colaborador, c.checkin, hr.data_checkout desc
      )
      select c.cidade, c.uf, c.checkin, c.checkout, m.reserva_solicitacao_id,
        min(c.nome_colaborador) as primeiro_colaborador
      from candidatos c
      left join matches m on m.nome_colaborador = c.nome_colaborador and m.checkin = c.checkin
      group by c.cidade, c.uf, c.checkin, c.checkout, m.reserva_solicitacao_id
    ) loop
      insert into public.hospedagem_solicitacoes (
        programacao_id, data_solicitacao, solicitante_id, solicitante_nome, solicitante_email,
        coordenacao, supervisao, regional, cidade, uf,
        data_checkin_prevista, data_checkout_prevista, quantidade_diarias_prevista,
        observacao_gestor, status_solicitacao
      ) values (
        v_destino_id, v_grupo.checkin, (select auth.uid()),
        (select nome from public.app_usuarios where auth_user_id = (select auth.uid()) limit 1),
        (select email from public.app_usuarios where auth_user_id = (select auth.uid()) limit 1),
        v_origem.coordenacao, v_origem.supervisao, v_origem.regional, v_grupo.cidade, v_grupo.uf,
        v_grupo.checkin, v_grupo.checkout, (v_grupo.checkout - v_grupo.checkin),
        'Solicitação automática via Programação — ' || v_grupo.primeiro_colaborador
          || '. (Duplicada automaticamente a partir da programação de ' || to_char(v_origem.data_referencia, 'DD/MM/YYYY') || '.)',
        'SOLICITADA'
      ) returning id into v_nova_solicitacao_id;

      insert into public.hospedagem_solicitacao_colaboradores (solicitacao_id, nome_colaborador, supervisao, status_colaborador)
      select v_nova_solicitacao_id, pe.nome_colaborador, v_origem.supervisao, 'ATIVO'
      from public.programacao_estadia pe
      left join (
        select distinct on (hc.nome_colaborador, pe2.checkin)
          hc.nome_colaborador, pe2.checkin, hr.solicitacao_id as reserva_solicitacao_id
        from public.programacao_estadia pe2
        join public.hospedagem_solicitacao_colaboradores hc on hc.nome_colaborador = pe2.nome_colaborador
        join public.hospedagem_reservas hr on hr.solicitacao_id = hc.solicitacao_id
        where pe2.programacao_id = v_destino_id
          and pe2.tipo_estadia = 'HOTEL'
          and hr.status_hospedagem in ('CHECKIN_PREVISTO', 'HOSPEDADO')
          and upper(trim(hr.cidade_hotel)) = upper(trim(pe2.cidade))
          and (nullif(trim(hr.uf_hotel),'') is null or nullif(trim(pe2.uf),'') is null or upper(trim(hr.uf_hotel)) = upper(trim(pe2.uf)))
          and hr.data_checkout between pe2.checkin - 1 and pe2.checkin
        order by hc.nome_colaborador, pe2.checkin, hr.data_checkout desc
      ) pm on pm.nome_colaborador = pe.nome_colaborador and pm.checkin = pe.checkin
      where pe.programacao_id = v_destino_id
        and pe.tipo_estadia = 'HOTEL'
        and trim(pe.cidade) = v_grupo.cidade
        and pe.checkin = v_grupo.checkin
        and pe.checkout = v_grupo.checkout
        and pm.reserva_solicitacao_id is not distinct from v_grupo.reserva_solicitacao_id;
    end loop;

    insert into public.programacao_alimentacao (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      cafe, almoco, janta, observacao
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      cafe, almoco, janta, observacao
    from public.programacao_alimentacao
    where programacao_id = p_programacao_id;

    insert into public.programacao_deslocamento (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      tipo_deslocamento, origem, destino, km, valor, observacao, placa_veiculo
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      tipo_deslocamento, origem, destino, km, valor, observacao, placa_veiculo
    from public.programacao_deslocamento
    where programacao_id = p_programacao_id;

    insert into public.programacao_extras (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      tipo_despesa, descricao, valor, observacao
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      tipo_despesa, descricao, valor, observacao
    from public.programacao_extras
    where programacao_id = p_programacao_id;

    insert into public.programacao_frota_vinculos (
      chave_vinculo, programacao_id, data_referencia, frota_colaborador_id,
      frota_nome, placa_veiculo, tipo_atuacao, alvo_tipo, os_id,
      alvo_colaborador_id, alvo_colaborador_nome
    )
    select v_destino_id::text || ':' || id::text, v_destino_id, v_data,
      frota_colaborador_id, frota_nome, placa_veiculo, tipo_atuacao, alvo_tipo,
      os_id, alvo_colaborador_id, alvo_colaborador_nome
    from public.programacao_frota_vinculos
    where programacao_id = p_programacao_id;

    v_copiadas := array_append(v_copiadas, v_data);
  end loop;

  return jsonb_build_object('copiadas', to_jsonb(v_copiadas), 'ignoradas', to_jsonb(v_ignoradas));
end;
$$;

comment on function public.duplicar_programacao_dia(uuid, date[]) is
  'Duplica atomicamente uma programação e seus vínculos para até cinco datas; estadias HOTEL sempre geram solicitação (nunca são puladas), separadas por reserva-alvo pra nunca misturar Estender com Reservar no mesmo card; destinos com conteúdo são preservados e ignorados.';
