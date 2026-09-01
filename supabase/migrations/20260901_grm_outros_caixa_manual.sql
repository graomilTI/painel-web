-- Reconhece despesas descritas em OUTROS na Programação e apenas abre
-- a categoria correspondente no Caixa Operacional.
-- Nenhuma dessas regras pode sair com AUTO=true; a conferência/aprovação
-- continua manual no GRM.

insert into public.grm_despesas_tipos_config (
  chave, origem, tipo_grm, valor_padrao, exibir, auto,
  carga_nhe, max_mov_dia, ativo, observacao
) values
  (
    'EXTRA_PEDAGIO', 'EXTRA', 'Pedágio', 0, true, false,
    true, 1, true,
    'OUTROS com descrição inequívoca de pedágio. Apenas abre Pedágio no Caixa Operacional; AUTO sempre falso e conferência/aprovação manual.'
  ),
  (
    'EXTRA_PASSAGEM', 'EXTRA', 'Passagem', 0, true, false,
    true, 1, true,
    'OUTROS com descrição inequívoca de passagem. Apenas abre Passagem no Caixa Operacional; AUTO sempre falso e conferência/aprovação manual.'
  ),
  (
    'EXTRA_MANUTENCAO_VEICULO', 'EXTRA', 'Manut. Veículo', 0, true, false,
    true, 1, true,
    'OUTROS com descrição inequívoca de manutenção de veículo/troca de pneu. Apenas abre Manut. Veículo no Caixa Operacional; AUTO sempre falso e conferência/aprovação manual.'
  )
on conflict (chave) do update set
  origem = excluded.origem,
  tipo_grm = excluded.tipo_grm,
  valor_padrao = excluded.valor_padrao,
  exibir = excluded.exibir,
  auto = false,
  carga_nhe = excluded.carga_nhe,
  max_mov_dia = excluded.max_mov_dia,
  ativo = excluded.ativo,
  observacao = excluded.observacao,
  updated_at = now();

-- Trava adicional de configuração: extras/deslocamentos manuais nunca
-- devem ser aprovados automaticamente pelo agente.
update public.grm_despesas_tipos_config
set auto = false,
    updated_at = now()
where chave in (
  'EXTRA_PEDAGIO',
  'EXTRA_PASSAGEM',
  'EXTRA_MANUTENCAO_VEICULO',
  'EXTRA_BONUS',
  'EXTRA_COMBUSTIVEL',
  'EXTRA_RECARGA',
  'EXTRA_LAVANDERIA',
  'EXTRA_LAVAGEM_VEICULO',
  'DESLOCAMENTO_UBER_TAXI',
  'DESLOCAMENTO_REEMBOLSO_KM'
);

create or replace function public.grm_filtrar_regras_programacao(
  p_versao_id uuid,
  p_data date,
  p_colaborador_id text,
  p_nome text,
  p_regras jsonb
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_programacao_ids text[];
  v_nome text := upper(unaccent(trim(coalesce(p_nome, ''))));
  v_na_programacao boolean := false;
  v_em_os boolean := false;
  v_almoco_programado boolean := true;
  v_regras_filtradas jsonb := '[]'::jsonb;
  v_regras_extras jsonb := '[]'::jsonb;
begin
  select array_agg(x.value)
    into v_programacao_ids
  from public.grm_despesas_versoes v
  cross join lateral jsonb_array_elements_text(
    coalesce(v.programacao_ids, '[]'::jsonb)
  ) x(value)
  where v.id = p_versao_id;

  if coalesce(array_length(v_programacao_ids, 1), 0) = 0 then
    return coalesce(p_regras, '[]'::jsonb);
  end if;

  select exists (
    select 1
    from public.programacao_colaboradores pc
    where pc.programacao_id::text = any(v_programacao_ids)
      and pc.data_referencia = p_data
      and (
        (
          nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pc.colaborador_id, '')) = trim(p_colaborador_id)
        )
        or upper(unaccent(trim(coalesce(pc.nome_colaborador, '')))) = v_nome
      )
  ) into v_na_programacao;

  select exists (
    select 1
    from public.programacao_equipe pe
    where pe.programacao_id::text = any(v_programacao_ids)
      and pe.confirmado = true
      and (
        (
          nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pe.colaborador_id, '')) = trim(p_colaborador_id)
        )
        or upper(unaccent(trim(coalesce(pe.nome_colaborador, '')))) = v_nome
      )
  ) into v_em_os;

  select not exists (
    select 1
    from public.programacao_alimentacao pa
    where pa.programacao_id::text = any(v_programacao_ids)
      and pa.data_referencia = p_data
      and pa.almoco = false
      and (
        (
          nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pa.colaborador_id, '')) = trim(p_colaborador_id)
        )
        or upper(unaccent(trim(coalesce(pa.nome_colaborador, '')))) = v_nome
      )
  ) into v_almoco_programado;

  select coalesce(jsonb_agg(t.rule order by t.ord), '[]'::jsonb)
    into v_regras_filtradas
  from jsonb_array_elements(
    coalesce(p_regras, '[]'::jsonb)
  ) with ordinality as t(rule, ord)
  where case
    when upper(unaccent(trim(coalesce(
      t.rule->>'tipo_despesa', ''
    )))) = 'ALMOCO'
      then v_na_programacao and v_almoco_programado

    when upper(unaccent(trim(coalesce(
      t.rule->>'tipo_despesa', ''
    )))) in (
      'SALARIO DE INTERMITENTE',
      'SERVICOS TERCEIRIZADOS'
    )
      then v_em_os

    else true
  end;

  -- OUTROS da Programação:
  -- * somente abre a categoria no Caixa Operacional;
  -- * AUTO fica obrigatoriamente FALSE;
  -- * descrição vazia não gera regra;
  -- * se o texto indicar mais de uma família de despesa, não escolhe
  --   automaticamente e deixa a conferência manual;
  -- * tipos só entram se houver configuração ativa com o nome exato do GRM.
  with extras_base as (
    select
      e.*,
      trim(regexp_replace(
        upper(unaccent(coalesce(e.descricao, '') || ' ' || coalesce(e.observacao, ''))),
        '[^A-Z0-9]+', ' ', 'g'
      )) as texto
    from public.programacao_extras e
    where e.programacao_id::text = any(v_programacao_ids)
      and e.data_referencia = p_data
      and upper(unaccent(trim(coalesce(e.tipo_despesa, '')))) = 'OUTROS'
      and (
        (
          nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(e.colaborador_id, '')) = trim(p_colaborador_id)
        )
        or upper(unaccent(trim(coalesce(e.nome_colaborador, '')))) = v_nome
      )
  ), classificados as (
    select
      e.*,
      array_remove(array[
        case when e.texto ~ '(^| )(BONUS|BONIFICACAO|PREMIACAO)( |$)'
                    or e.texto ~ '(^| )RECEBIMENTO DA LAVOURA( |$)'
             then 'EXTRA_BONUS' end,
        case when e.texto ~ '(^| )(COMBUSTIVEL|GASOLINA|ABASTECIMENTO)( |$)'
             then 'EXTRA_COMBUSTIVEL' end,
        case when e.texto ~ '(^| )PEDAGIO(S)?( |$)'
             then 'EXTRA_PEDAGIO' end,
        case when e.texto ~ '(^| )PASSAGEM(ENS)?( |$)'
             then 'EXTRA_PASSAGEM' end,
        case when e.texto ~ '(^| )MANUTENCAO( |$)'
                    or e.texto ~ '(^| )TROCA DE PNEU(S)?( |$)'
             then 'EXTRA_MANUTENCAO_VEICULO' end,
        case when e.texto ~ '(^| )(UBER|TAXI)( |$)'
             then 'DESLOCAMENTO_UBER_TAXI' end,
        case when e.texto ~ '(^| )RECARGA( DE)? (CELULAR|TELEFONE)( |$)'
             then 'EXTRA_RECARGA' end,
        case when e.texto ~ '(^| )(LAVAGEM|LAVA JATO)( |$)'
             then 'EXTRA_LAVAGEM_VEICULO' end,
        case when e.texto ~ '(^| )(REEMBOLSO KM|ADICIONAR KM)( |$)'
             then 'DESLOCAMENTO_REEMBOLSO_KM' end
      ], null) as chaves
    from extras_base e
    where nullif(e.texto, '') is not null
  ), unicos as (
    select
      c.*,
      c.chaves[1] as chave_config
    from classificados c
    where cardinality(c.chaves) = 1
  ), por_tipo as (
    select
      cfg.chave,
      cfg.tipo_grm,
      cfg.exibir,
      cfg.carga_nhe,
      cfg.max_mov_dia,
      max(greatest(coalesce(u.valor, 0), 0))::numeric as valor_maximo
    from unicos u
    join public.grm_despesas_tipos_config cfg
      on cfg.chave = u.chave_config
     and cfg.ativo = true
     and nullif(trim(coalesce(cfg.tipo_grm, '')), '') is not null
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(v_regras_filtradas, '[]'::jsonb)) r(rule)
      where upper(unaccent(trim(coalesce(r.rule->>'tipo_despesa', ''))))
          = upper(unaccent(trim(cfg.tipo_grm)))
    )
    group by cfg.chave, cfg.tipo_grm, cfg.exibir, cfg.carga_nhe, cfg.max_mov_dia
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tipo_despesa', p.tipo_grm,
      'exibir', coalesce(p.exibir, true),
      'valor_maximo', coalesce(p.valor_maximo, 0),
      'auto', false,
      'carga_nhe', coalesce(p.carga_nhe, true),
      'max_mov_dia', greatest(coalesce(p.max_mov_dia, 1), 0)
    ) order by p.tipo_grm
  ), '[]'::jsonb)
  into v_regras_extras
  from por_tipo p;

  return coalesce(v_regras_filtradas, '[]'::jsonb)
      || coalesce(v_regras_extras, '[]'::jsonb);
end;
$function$;
