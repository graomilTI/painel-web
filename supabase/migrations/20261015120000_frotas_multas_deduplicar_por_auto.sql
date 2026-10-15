-- Frotas > Ocorrências > Multas: remove as multas duplicadas.
--
-- Causa: a multa_key do sync-multas-detran incluía a hora da infração (HI) e o DETRAN devolve
-- horas diferentes para o mesmo auto a cada consulta; cada variação gerava uma linha nova.
-- A função passou a montar a chave só com renavam + órgão + código + número do auto (e a achar as
-- linhas antigas pelo veículo + número do auto). Aqui:
--   1. cada grupo (renavam + número do auto) vira UMA linha: fica a que tem mais ação/arquivamento
--      do painel (empate: a mais antiga) e herda de uma das outras os blocos que ela não tem
--      (ação, arquivamento/OK, motorista definido, grupo, notificação/termo);
--   2. histórico, anexos e logs das removidas passam para a que ficou;
--   3. a multa_key das linhas restantes perde "|DI:...|HI:..." e passa a casar com a chave nova.

do $$
declare
  g record;
  v_ids uuid[];
  v_keep uuid;
  v_outros uuid[];
  v_s public.frotas_multas;
  v_d public.frotas_multas;
  v_grupos int := 0;
  v_removidas int := 0;
  v_chaves int := 0;
begin
  for g in
    select renavam, numero_auto_infracao
    from public.frotas_multas
    where coalesce(renavam, '') <> '' and coalesce(numero_auto_infracao, '') <> ''
    group by renavam, numero_auto_infracao
    having count(*) > 1
  loop
    -- Ordem de preferência: mais estado do painel primeiro, depois a mais antiga.
    select array_agg(id order by score desc, criado_em asc, id asc)
      into v_ids
    from (
      select m.id, m.criado_em,
        (m.acao_status is not null)::int + (m.arquivada_em is not null)::int + (m.ok_em is not null)::int
        + (m.motorista_definido_em is not null)::int + (m.grupo_id is not null)::int
        + (m.dobrar_solicitado_em is not null)::int + (m.identificar_solicitado_em is not null)::int
        + (m.multa_dobrada_em is not null)::int + (m.condutor_identificado_em is not null)::int
        + (m.notificado_em is not null)::int + (m.termo_gerado_em is not null)::int
        + exists (select 1 from public.frotas_multas_anexos a where a.multa_id = m.id)::int as score
      from public.frotas_multas m
      where m.renavam = g.renavam and m.numero_auto_infracao = g.numero_auto_infracao
    ) x;

    v_keep := v_ids[1];
    v_outros := v_ids[2:array_length(v_ids, 1)];
    select * into v_s from public.frotas_multas where id = v_keep;

    -- Ação (Identificar/Dobrar). status_multa acompanha acao_status pelo trigger de proteção.
    if v_s.acao_status is null and v_s.dobrar_solicitado_em is null and v_s.identificar_solicitado_em is null
       and v_s.multa_dobrada_em is null and v_s.condutor_identificado_em is null
       and v_s.multa_indicada_em is null and v_s.condutor_notificado_em is null then
      select * into v_d from public.frotas_multas
      where id = any(v_outros)
        and (acao_status is not null or dobrar_solicitado_em is not null or identificar_solicitado_em is not null
             or multa_dobrada_em is not null or condutor_identificado_em is not null
             or multa_indicada_em is not null or condutor_notificado_em is not null)
      order by array_position(v_ids, id) limit 1;
      if found then
        update public.frotas_multas set
          acao_status = v_d.acao_status, dobrar_solicitado_em = v_d.dobrar_solicitado_em,
          identificar_solicitado_em = v_d.identificar_solicitado_em, multa_dobrada_em = v_d.multa_dobrada_em,
          condutor_identificado_em = v_d.condutor_identificado_em, condutor_notificado_em = v_d.condutor_notificado_em,
          multa_indicada_em = v_d.multa_indicada_em,
          identificada_em = v_d.identificada_em, identificada_por = v_d.identificada_por, identificada_obs = v_d.identificada_obs,
          dobrada_em = v_d.dobrada_em, dobrada_por = v_d.dobrada_por, dobrada_obs = v_d.dobrada_obs
        where id = v_keep;
      end if;
    end if;

    -- Arquivamento / OK.
    if v_s.arquivada_em is null and v_s.ok_em is null then
      select * into v_d from public.frotas_multas
      where id = any(v_outros) and (arquivada_em is not null or ok_em is not null)
      order by array_position(v_ids, id) limit 1;
      if found then
        update public.frotas_multas set
          arquivada_em = v_d.arquivada_em, arquivada_por = v_d.arquivada_por, motivo_arquivamento = v_d.motivo_arquivamento,
          ok_em = v_d.ok_em, ok_por = v_d.ok_por, ok_observacao = v_d.ok_observacao
        where id = v_keep;
      end if;
    end if;

    -- Motorista definido à mão.
    if v_s.motorista_definido_em is null then
      select * into v_d from public.frotas_multas
      where id = any(v_outros) and motorista_definido_em is not null
      order by array_position(v_ids, id) limit 1;
      if found then
        update public.frotas_multas set
          motorista = v_d.motorista, motorista_definido_em = v_d.motorista_definido_em,
          motorista_em = v_d.motorista_em, motorista_por = v_d.motorista_por,
          motorista_nome = v_d.motorista_nome, motorista_cpf = v_d.motorista_cpf
        where id = v_keep;
      end if;
    end if;

    -- Agrupamento para o termo de desconto.
    if v_s.grupo_id is null then
      select * into v_d from public.frotas_multas
      where id = any(v_outros) and grupo_id is not null
      order by array_position(v_ids, id) limit 1;
      if found then
        update public.frotas_multas set grupo_id = v_d.grupo_id where id = v_keep;
      end if;
    end if;

    -- Notificação (WhatsApp) e termo gerado.
    if v_s.notificado_em is null and v_s.termo_gerado_em is null and coalesce(v_s.status_notificacao, 'PENDENTE') = 'PENDENTE' then
      select * into v_d from public.frotas_multas
      where id = any(v_outros)
        and (notificado_em is not null or termo_gerado_em is not null or coalesce(status_notificacao, 'PENDENTE') <> 'PENDENTE')
      order by array_position(v_ids, id) limit 1;
      if found then
        update public.frotas_multas set
          status_notificacao = v_d.status_notificacao, mensagem_gerada = v_d.mensagem_gerada,
          notificado_em = v_d.notificado_em, notificado_por = v_d.notificado_por, notificado_por_nome = v_d.notificado_por_nome,
          termo_gerado_em = v_d.termo_gerado_em, termo_gerado_por_nome = v_d.termo_gerado_por_nome
        where id = v_keep;
      end if;
    end if;

    -- Observação operacional livre.
    if coalesce(v_s.observacoes_operacionais, '') = '' then
      update public.frotas_multas k set observacoes_operacionais = (
        select o.observacoes_operacionais from public.frotas_multas o
        where o.id = any(v_outros) and coalesce(o.observacoes_operacionais, '') <> ''
        order by array_position(v_ids, o.id) limit 1)
      where k.id = v_keep;
    end if;

    -- Quem apontava para as removidas passa a apontar para a que ficou.
    update public.frotas_multas_acoes set multa_id = v_keep::text where multa_id = any (select x::text from unnest(v_outros) x);
    update public.frotas_multas_logs set multa_id = v_keep where multa_id = any(v_outros);
    update public.frotas_multas_arquivos set multa_id = v_keep where multa_id = any(v_outros);
    update public.frotas_multas_anexos a set multa_id = v_keep
      where a.multa_id = any(v_outros)
        and (a.tipo <> 'auto_infracao'
             or not exists (select 1 from public.frotas_multas_anexos b where b.multa_id = v_keep and b.tipo = 'auto_infracao'));
    -- Multa avulsa usa o próprio id como dossiê (termo/consolidado).
    update public.frotas_multas_anexos a set dossie_id = v_keep
      where a.dossie_id = any(v_outros)
        and not exists (select 1 from public.frotas_multas_anexos b where b.dossie_id = v_keep and b.tipo = a.tipo);

    delete from public.frotas_multas where id = any(v_outros);
    v_grupos := v_grupos + 1;
    v_removidas := v_removidas + coalesce(array_length(v_outros, 1), 0);
  end loop;

  -- Chave nova: sem "|DI:...|HI:...". Fica como está só quando o auto não tem código nem número.
  update public.frotas_multas
     set multa_key = split_part(multa_key, '|DI:', 1)
   where multa_key like '%|DI:%'
     and split_part(multa_key, '|DI:', 1) !~ '\|CA:\|NA:$';
  get diagnostics v_chaves = row_count;

  raise notice 'frotas_multas: % grupo(s) deduplicado(s), % linha(s) removida(s), % chave(s) normalizada(s)',
    v_grupos, v_removidas, v_chaves;
  -- @@FIM@@
end $$;
