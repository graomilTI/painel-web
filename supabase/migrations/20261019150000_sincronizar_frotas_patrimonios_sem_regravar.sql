-- sincronizar_frotas_veiculos_patrimonios rodava a cada ~4 min e, para TODOS os veiculos com dados de
-- patrimonio, fazia 3 UPDATEs: zerava os campos patrimonio_*, gravava de novo e recalculava
-- condutor_divergente. Cada UPDATE era auditado (app_auditoria) e gerava linha morta/WAL: ~170 mil linhas de
-- auditoria por dia (~230 MB/dia), a maior fonte de crescimento do disco em out/2026.
-- Agora o estado final e o mesmo, mas calculado de uma vez e gravado SO nos veiculos cujo valor mudou.
create or replace function public.sincronizar_frotas_veiculos_patrimonios()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
  v_total_alterados integer := 0;
  v_total_cadastrados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*) into v_total_snapshot from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object('veiculos_atualizados', 0, 'veiculos_cadastrados', 0, 'patrimonios_processados', 0);
  end if;

  -- Cadastra veiculos de patrimonio que ainda nao existem na frota; o update abaixo
  -- preenche coordenacao, motorista e demais campos de patrimonio.
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

  -- Uma unica instrucao: veiculos com patrimonio recebem o valor final (incluindo condutor_divergente);
  -- veiculos sem patrimonio no snapshot voltam ao estado vazio. Em ambos os casos so grava se algo mudou.
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
  alvo as (
    select
      v.id,
      p.patrimonio_codigo as n_codigo,
      p.ultima_leitura as n_ultima_leitura,
      p.dias_sem_leitura as n_dias,
      nullif(trim(p.funcionario), '') as n_funcionario,
      p.coordenacao as n_coord_patrimonio,
      p.supervisao as n_sup_patrimonio,
      coalesce(nullif(trim(p.funcionario), ''), v.motorista_atual) as n_motorista,
      coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao) as n_coordenacao,
      coalesce(nullif(trim(p.supervisao), ''), nullif(trim(v.supervisao), ''), v.supervisao) as n_supervisao
    from public.frotas_veiculos v
    join patrimonio_mais_recente p
      on regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
  ),
  alvo_final as (
    select
      a.*,
      (
        a.n_funcionario is not null
        and nullif(trim(a.n_motorista), '') is not null
        and upper(regexp_replace(unaccent(trim(a.n_motorista)), '\s+', ' ', 'g'))
            <> upper(regexp_replace(unaccent(trim(a.n_funcionario)), '\s+', ' ', 'g'))
      ) as n_divergente
    from alvo a
  ),
  atualizados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = a.n_codigo,
           patrimonio_ultima_leitura = a.n_ultima_leitura,
           patrimonio_dias_sem_leitura = a.n_dias,
           patrimonio_funcionario = a.n_funcionario,
           patrimonio_coordenacao = a.n_coord_patrimonio,
           patrimonio_supervisao = a.n_sup_patrimonio,
           motorista_atual = a.n_motorista,
           condutor_patrimonio = a.n_funcionario,
           coordenacao = a.n_coordenacao,
           supervisao = a.n_supervisao,
           condutor_divergente = a.n_divergente
      from alvo_final a
     where v.id = a.id
       and (
         v.patrimonio_codigo, v.patrimonio_ultima_leitura, v.patrimonio_dias_sem_leitura,
         v.patrimonio_funcionario, v.patrimonio_coordenacao, v.patrimonio_supervisao,
         v.motorista_atual, v.condutor_patrimonio, v.coordenacao, v.supervisao, v.condutor_divergente
       ) is distinct from (
         a.n_codigo, a.n_ultima_leitura, a.n_dias,
         a.n_funcionario, a.n_coord_patrimonio, a.n_sup_patrimonio,
         a.n_motorista, a.n_funcionario, a.n_coordenacao, a.n_supervisao, a.n_divergente
       )
    returning v.id
  ),
  esvaziados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = null,
           patrimonio_ultima_leitura = null,
           patrimonio_dias_sem_leitura = null,
           patrimonio_funcionario = null,
           patrimonio_coordenacao = null,
           patrimonio_supervisao = null,
           condutor_divergente = false
     where (
            v.patrimonio_codigo is not null
         or v.patrimonio_ultima_leitura is not null
         or v.patrimonio_dias_sem_leitura is not null
         or v.patrimonio_funcionario is not null
         or v.patrimonio_coordenacao is not null
         or v.patrimonio_supervisao is not null
         or v.condutor_divergente is true
       )
       and not exists (select 1 from alvo_final a where a.id = v.id)
    returning v.id
  )
  select
    (select count(*) from alvo_final),
    (select count(*) from atualizados) + (select count(*) from esvaziados)
    into v_total_atualizados, v_total_alterados;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'veiculos_alterados', v_total_alterados,
    'veiculos_cadastrados', v_total_cadastrados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$function$;
