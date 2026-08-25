-- Uber Conferência: correspondência automática com a O.S. via GPS + laudo.
--
-- grm_cargas_importacoes é a classificação de carga (laudo) do GRM: só existe
-- linha ali quando a carga foi classificada (laudo emitido), com colaborador,
-- O.S. e coordenadas de lançamento. Portanto "colaborador tem laudo na O.S."
-- equivale a existir uma linha dessa tabela pro mesmo colaborador/data dentro
-- do raio de 2km do endereço de partida da corrida Uber (já geocodificado
-- pelo botão GPS / "Converter GPS pendentes" em assets/js/uber.js).
create or replace function public.uber_validar_por_os_laudo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row conferencia_uber_corridas%rowtype;
  v_match record;
  v_raio_m constant numeric := 2000;
begin
  select * into v_row from conferencia_uber_corridas where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Corrida não encontrada.');
  end if;

  if v_row.partida_latitude is null or v_row.partida_longitude is null then
    return jsonb_build_object('ok', false, 'error', 'Corrida sem coordenadas de partida.');
  end if;

  if v_row.status_validacao not in ('PENDENTE', 'ATENCAO', 'ATENÇÃO') then
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'ja_classificada');
  end if;

  select
    g.os,
    g.colaborador,
    g.laudo,
    2 * 6371000 * asin(sqrt(
      power(sin(radians(g.lat_lancamento - v_row.partida_latitude) / 2), 2) +
      cos(radians(v_row.partida_latitude)) * cos(radians(g.lat_lancamento)) *
      power(sin(radians(g.lng_lancamento - v_row.partida_longitude) / 2), 2)
    )) as distancia_m
  into v_match
  from grm_cargas_importacoes g
  where g.data_classificacao = v_row.data_solicitacao_local
    and g.lat_lancamento is not null
    and g.lng_lancamento is not null
    and coalesce(g.laudo, '') <> ''
    and (
      lower(g.colaborador) like '%' || lower(coalesce(v_row.nome_colaborador, v_row.nome, '')) || '%'
      or lower(coalesce(v_row.nome_colaborador, v_row.nome, '')) like '%' || lower(g.colaborador) || '%'
    )
  order by distancia_m asc
  limit 1;

  if v_match.os is null then
    update conferencia_uber_corridas
    set observacao_validacao = 'Nenhuma O.S. com laudo do colaborador encontrada na data da corrida.',
        updated_at = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'sem_correspondencia');
  end if;

  if v_match.distancia_m > v_raio_m then
    update conferencia_uber_corridas
    set observacao_validacao = format(
          'O.S. %s tem laudo do colaborador na data, mas a %s km da partida (fora do raio de 2km).',
          v_match.os, round((v_match.distancia_m / 1000)::numeric, 1)
        ),
        updated_at = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'fora_do_raio', 'os', v_match.os, 'distancia_m', v_match.distancia_m);
  end if;

  update conferencia_uber_corridas
  set status_validacao = 'VALIDADO',
      classificacao_manual = 'VALIDADA',
      motivo_validacao = format('Validação automática: O.S. %s com laudo do colaborador a %s m da partida.', v_match.os, round(v_match.distancia_m)),
      observacao_validacao = null,
      validado_em = now(),
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'validado', true, 'os', v_match.os, 'distancia_m', v_match.distancia_m);
end;
$$;

grant execute on function public.uber_validar_por_os_laudo(uuid) to authenticated, service_role;
