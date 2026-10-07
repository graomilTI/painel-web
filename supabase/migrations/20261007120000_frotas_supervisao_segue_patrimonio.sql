-- A supervisão do veículo passa a seguir a leitura mais recente do Patrimônios.
-- Antes só era preenchida quando estava vazia, então a placa que mudava de supervisão
-- no Patrimônios continuava na antiga e sumia da lista de veículos da Programação
-- (RVH2C89: Confresa -> Querência, 07/10/2026). Se o Patrimônios não informar
-- supervisão, mantém a atual. Único ajuste: a ordem do coalesce de supervisao.
CREATE OR REPLACE FUNCTION public.sincronizar_frotas_veiculos_patrimonios()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
  v_total_cadastrados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*) into v_total_snapshot from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object('veiculos_atualizados', 0, 'veiculos_cadastrados', 0, 'patrimonios_processados', 0);
  end if;

  -- Cadastra veÃ­culos de patrimÃ´nio que ainda nÃ£o existem na frota; o update abaixo
  -- preenche coordenaÃ§Ã£o, motorista e demais campos de patrimÃ´nio.
  with candidatos_novos as (
    select
      p.*,
      regexp_replace(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        ),
        '[^A-Z0-9]',
        '',
        'g'
      ) as placa_normalizada
    from public.patrimonios_snapshot p
    where upper(coalesce(p.categoria, '')) like 'VEIC%'
      and p.situacao = 'Ativo'
  ),
  novos as (
    select distinct on (c.placa_normalizada) c.*
    from candidatos_novos c
    where length(c.placa_normalizada) = 7
      and not exists (
        select 1
          from public.frotas_veiculos v
         where public.frotas_chave_placa(v.placa) = public.frotas_chave_placa(c.placa_normalizada)
      )
    order by c.placa_normalizada, c.data_upload desc nulls last, c.ultima_leitura desc nulls last
  ),
  cadastrados as (
    insert into public.frotas_veiculos (
      placa, nome, marca, modelo, status, origem_importacao,
      patrimonio_identificacao, patrimonio_data_upload, patrimonio_importacao_id, patrimonio_sync_em
    )
    select
      n.placa_normalizada, n.identificacao, n.marca, n.modelo, 'ATIVO', 'patrimonio',
      n.identificacao, n.data_upload, n.importacao_id, now()
    from novos n
    on conflict (placa) do nothing
    returning id
  )
  select count(*) into v_total_cadastrados from cadastrados;

  update public.frotas_veiculos
     set patrimonio_codigo = null,
         patrimonio_ultima_leitura = null,
         patrimonio_dias_sem_leitura = null,
         patrimonio_funcionario = null,
         patrimonio_coordenacao = null,
         patrimonio_supervisao = null,
         condutor_divergente = false
   where patrimonio_codigo is not null
      or patrimonio_ultima_leitura is not null
      or patrimonio_dias_sem_leitura is not null
      or patrimonio_funcionario is not null
      or patrimonio_coordenacao is not null
      or patrimonio_supervisao is not null
      or condutor_divergente is true;

  with candidatos as (
    select
      p.*,
      regexp_replace(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        ),
        '[^A-Z0-9]',
        '',
        'g'
      ) as placa_normalizada
    from public.patrimonios_snapshot p
  ),
  patrimonio_mais_recente as (
    select distinct on (placa_normalizada)
      placa_normalizada,
      patrimonio_codigo,
      ultima_leitura,
      dias_sem_leitura,
      funcionario,
      coordenacao,
      supervisao
    from candidatos
    where length(placa_normalizada) = 7
    order by
      placa_normalizada,
      data_upload desc nulls last,
      ultima_leitura desc nulls last
  ),
  atualizados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = p.patrimonio_codigo,
           patrimonio_ultima_leitura = p.ultima_leitura,
           patrimonio_dias_sem_leitura = p.dias_sem_leitura,
           patrimonio_funcionario = nullif(trim(p.funcionario), ''),
           patrimonio_coordenacao = p.coordenacao,
           patrimonio_supervisao = p.supervisao,
           motorista_atual = coalesce(nullif(trim(p.funcionario), ''), v.motorista_atual),
           condutor_patrimonio = nullif(trim(p.funcionario), ''),
           coordenacao = coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(p.supervisao), ''), nullif(trim(v.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*) into v_total_atualizados from atualizados;

  update public.frotas_veiculos
     set condutor_divergente = (
       nullif(trim(patrimonio_funcionario), '') is not null
       and nullif(trim(motorista_atual), '') is not null
       and upper(regexp_replace(unaccent(trim(motorista_atual)), '\s+', ' ', 'g'))
           <> upper(regexp_replace(unaccent(trim(patrimonio_funcionario)), '\s+', ' ', 'g'))
     )
   where patrimonio_codigo is not null
      or patrimonio_funcionario is not null;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'veiculos_cadastrados', v_total_cadastrados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$function$;
