-- Otimiza o enfileiramento do Bônus para grandes seleções.
-- A produção da competência é materializada uma única vez e cruzada em lote.

CREATE OR REPLACE FUNCTION public.bonus_solicitar_lancamento_caixa(p_competencia date, p_colaboradores text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_enfileirados integer := 0;
  v_ja_lancados integer := 0;
  v_ja_pendentes integer := 0;
  v_rejeitados integer := 0;
  v_rejeicoes jsonb := '[]'::jsonb;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para lançar Bônus';
  end if;

  if p_colaboradores is null or coalesce(array_length(p_colaboradores, 1), 0) = 0 then
    raise exception 'Selecione ao menos um colaborador';
  end if;

  if v_comp is null then
    raise exception 'Competência inválida';
  end if;

  -- Materializa UMA única vez a produção da competência e cruza toda a seleção.
  -- A versão anterior chamava bonus_producao_competencia() uma vez por colaborador,
  -- o que fazia seleções grandes (ex.: ~300 nomes) estourarem statement_timeout.
  create temporary table bonus_lote_tmp on commit drop as
  with solicitados as (
    select distinct on (public.bonus_normalizar_nome(btrim(x)))
      btrim(x) as input_nome,
      public.bonus_normalizar_nome(btrim(x)) as nome_key
    from unnest(p_colaboradores) as u(x)
    where btrim(coalesce(x, '')) <> ''
      and public.bonus_normalizar_nome(btrim(x)) <> ''
    order by public.bonus_normalizar_nome(btrim(x)), btrim(x)
  ),
  producao as materialized (
    select
      b.colaborador,
      public.bonus_normalizar_nome(b.colaborador) as nome_key,
      b.tons,
      b.valor,
      b.status,
      b.motivo
    from public.bonus_producao_competencia(v_comp) b
  )
  select
    s.input_nome,
    s.nome_key,
    p.colaborador,
    p.tons,
    p.valor,
    p.status as producao_status,
    p.motivo,
    upper(l.status) as lancamento_status
  from solicitados s
  left join producao p on p.nome_key = s.nome_key
  left join public.bonus_caixa_lancamentos l
    on l.competencia = v_comp
   and l.nome_normalizado = s.nome_key;

  select
    count(*) filter (
      where colaborador is null or producao_status is distinct from 'Apto'
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and lancamento_status = 'LANCADO'
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and lancamento_status in ('PENDENTE', 'PROCESSANDO')
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'colaborador', coalesce(colaborador, input_nome),
          'motivo', case
            when colaborador is null then 'Sem produção na competência'
            else coalesce(motivo, 'Colaborador inapto')
          end
        )
      ) filter (
        where colaborador is null or producao_status is distinct from 'Apto'
      ),
      '[]'::jsonb
    )
  into v_rejeitados, v_ja_lancados, v_ja_pendentes, v_rejeicoes
  from bonus_lote_tmp;

  insert into public.bonus_caixa_lancamentos (
    competencia,
    colaborador_nome,
    nome_normalizado,
    tons,
    valor,
    status,
    tentativas,
    ultimo_erro,
    grm_retorno,
    solicitado_por,
    solicitado_em,
    iniciado_em,
    processado_em,
    updated_at
  )
  select
    v_comp,
    t.colaborador,
    t.nome_key,
    t.tons,
    t.valor,
    'PENDENTE',
    0,
    null,
    null,
    v_uid,
    now(),
    null,
    null,
    now()
  from bonus_lote_tmp t
  where t.colaborador is not null
    and t.producao_status = 'Apto'
    and coalesce(t.lancamento_status, '') not in ('LANCADO', 'PENDENTE', 'PROCESSANDO')
  on conflict (competencia, nome_normalizado) do update set
    colaborador_nome = excluded.colaborador_nome,
    tons = excluded.tons,
    valor = excluded.valor,
    status = 'PENDENTE',
    tentativas = 0,
    ultimo_erro = null,
    grm_retorno = null,
    solicitado_por = excluded.solicitado_por,
    solicitado_em = now(),
    iniciado_em = null,
    processado_em = null,
    updated_at = now()
  where upper(public.bonus_caixa_lancamentos.status) not in ('LANCADO', 'PENDENTE', 'PROCESSANDO');

  get diagnostics v_enfileirados = row_count;

  if v_enfileirados > 0 and not exists (
    select 1
    from public.grm_sync_jobs
    where agente_id = 'sync-bonus-caixa'
      and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (
      agente_id,
      status,
      solicitado_por,
      payload
    ) values (
      'sync-bonus-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object(
        'competencia', v_comp,
        'origem', 'conferencia_bonus',
        'quantidade', v_enfileirados
      )
    ) returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'competencia', v_comp,
    'enfileirados', v_enfileirados,
    'ja_lancados', v_ja_lancados,
    'ja_pendentes', v_ja_pendentes,
    'rejeitados', v_rejeitados,
    'rejeicoes', v_rejeicoes,
    'job_id', v_job_id
  );
end;
$function$;
