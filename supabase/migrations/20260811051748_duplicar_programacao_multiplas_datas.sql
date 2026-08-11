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

revoke all on function public.duplicar_programacao_dia(uuid, date[]) from public, anon;
grant execute on function public.duplicar_programacao_dia(uuid, date[]) to authenticated;

comment on function public.duplicar_programacao_dia(uuid, date[]) is
  'Duplica atomicamente uma programação e seus vínculos para até cinco datas; destinos com conteúdo são preservados e ignorados.';
