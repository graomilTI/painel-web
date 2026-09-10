-- Ajuste de acoplamento: o Adiantamento de desconto de auditoria não deve mais
-- disparar seu próprio job assim que a planilha é importada. Ele só deve rodar
-- quando o admin aciona o lançamento do Bônus no Caixa (botão "Lançar no Caixa",
-- RPC bonus_solicitar_lancamento_caixa). A fila (bonus_desconto_caixa_lancamentos)
-- continua sendo alimentada normalmente pela importação; só o enfileiramento do
-- job em grm_sync_jobs muda de lugar.

-- 1) bonus_substituir_auditoria: continua importando e enfileirando os itens na
--    fila de desconto, mas não cria mais o job 'sync-bonus-desconto-caixa'.
create or replace function public.bonus_substituir_auditoria(
  p_competencia date,
  p_itens jsonb,
  p_arquivo_nome text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_competencia date;
  v_total_inaptos integer := 0;
  v_teto constant numeric := 500.00;
  v_item record;
  v_ja_comprometido numeric;
  v_restante numeric;
  v_valor_a_lancar numeric;
  v_status_atual text;
  v_enfileirados integer := 0;
  v_valor_enfileirado numeric := 0;
  v_bloqueados integer := 0;
  v_bloqueios jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para administrar o Bônus';
  end if;

  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  delete from public.bonus_auditoria_inaptos
  where competencia = v_competencia;

  with itens as (
    select
      trim(x.item ->> 'nome') as nome,
      public.bonus_normalizar_nome(x.item ->> 'nome') as nome_key,
      coalesce((x.item ->> 'valor')::numeric, 0) as valor,
      nullif(trim(x.item ->> 'descricao'), '') as descricao
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as x(item)
    where nullif(trim(x.item ->> 'nome'), '') is not null
      and public.bonus_normalizar_nome(x.item ->> 'nome') <> ''
  ),
  agrupado as (
    select
      nome_key,
      min(nome) as nome,
      sum(coalesce(valor, 0)) as valor_desconto,
      nullif(string_agg(distinct descricao, '; ' order by descricao), '') as descricao_desconto
    from itens
    group by nome_key
  )
  insert into public.bonus_auditoria_inaptos (
    competencia,
    colaborador_nome,
    nome_normalizado,
    arquivo_nome,
    importado_por,
    valor_desconto,
    descricao_desconto
  )
  select
    v_competencia,
    a.nome,
    a.nome_key,
    nullif(trim(p_arquivo_nome), ''),
    v_uid,
    a.valor_desconto,
    a.descricao_desconto
  from agrupado a
  on conflict (competencia, nome_normalizado)
  do update set
    colaborador_nome = excluded.colaborador_nome,
    arquivo_nome = excluded.arquivo_nome,
    importado_por = excluded.importado_por,
    importado_em = now(),
    valor_desconto = excluded.valor_desconto,
    descricao_desconto = excluded.descricao_desconto;

  get diagnostics v_total_inaptos = row_count;

  -- Enfileira na fila de Adiantamento (respeitando o teto de R$500 comprometidos),
  -- mas NÃO cria job em grm_sync_jobs: o lançamento só roda quando o admin aciona
  -- "Lançar no Caixa" do Bônus (bonus_solicitar_lancamento_caixa).
  for v_item in
    select colaborador_nome, nome_normalizado, valor_desconto, descricao_desconto
    from public.bonus_auditoria_inaptos
    where competencia = v_competencia
      and coalesce(valor_desconto, 0) > 0
  loop
    select coalesce(sum(valor), 0) into v_ja_comprometido
    from public.bonus_desconto_caixa_lancamentos
    where nome_normalizado = v_item.nome_normalizado
      and competencia <> v_competencia
      and upper(status) in ('PENDENTE', 'PROCESSANDO', 'LANCADO');

    v_restante := greatest(v_teto - v_ja_comprometido, 0);
    v_valor_a_lancar := least(v_item.valor_desconto, v_restante);

    select upper(status) into v_status_atual
    from public.bonus_desconto_caixa_lancamentos
    where competencia = v_competencia
      and nome_normalizado = v_item.nome_normalizado;

    if v_status_atual = 'LANCADO' then
      continue;
    end if;

    if v_valor_a_lancar <= 0 then
      v_bloqueados := v_bloqueados + 1;
      v_bloqueios := v_bloqueios || jsonb_build_array(
        jsonb_build_object(
          'colaborador', v_item.colaborador_nome,
          'motivo', format('Teto de R$%s já comprometido no Caixa', to_char(v_teto, 'FM999999990.00'))
        )
      );
      update public.bonus_desconto_caixa_lancamentos
      set status = 'CANCELADO', updated_at = now()
      where competencia = v_competencia
        and nome_normalizado = v_item.nome_normalizado
        and upper(status) in ('PENDENTE', 'PROCESSANDO', 'ERRO');
      continue;
    end if;

    insert into public.bonus_desconto_caixa_lancamentos (
      competencia,
      colaborador_nome,
      nome_normalizado,
      valor,
      valor_original,
      descricao,
      status,
      tentativas,
      ultimo_erro,
      grm_retorno,
      solicitado_por,
      solicitado_em,
      iniciado_em,
      processado_em,
      updated_at
    ) values (
      v_competencia,
      v_item.colaborador_nome,
      v_item.nome_normalizado,
      v_valor_a_lancar,
      v_item.valor_desconto,
      coalesce(v_item.descricao_desconto, 'Desconto de auditoria'),
      'PENDENTE',
      0,
      null,
      null,
      v_uid,
      now(),
      null,
      null,
      now()
    )
    on conflict (competencia, nome_normalizado) do update set
      colaborador_nome = excluded.colaborador_nome,
      valor = excluded.valor,
      valor_original = excluded.valor_original,
      descricao = excluded.descricao,
      status = 'PENDENTE',
      tentativas = 0,
      ultimo_erro = null,
      grm_retorno = null,
      solicitado_por = excluded.solicitado_por,
      solicitado_em = now(),
      iniciado_em = null,
      processado_em = null,
      updated_at = now()
    where upper(public.bonus_desconto_caixa_lancamentos.status) not in ('LANCADO', 'PROCESSANDO');

    if found then
      v_enfileirados := v_enfileirados + 1;
      v_valor_enfileirado := v_valor_enfileirado + v_valor_a_lancar;

      if v_valor_a_lancar < v_item.valor_desconto then
        v_bloqueios := v_bloqueios || jsonb_build_array(
          jsonb_build_object(
            'colaborador', v_item.colaborador_nome,
            'motivo', format(
              'Valor reduzido de R$%s para R$%s pelo teto de R$%s no Caixa',
              to_char(v_item.valor_desconto, 'FM999999990.00'),
              to_char(v_valor_a_lancar, 'FM999999990.00'),
              to_char(v_teto, 'FM999999990.00')
            )
          )
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'competencia', v_competencia,
    'importados', v_total_inaptos,
    'enfileirados_caixa', v_enfileirados,
    'valor_enfileirado_caixa', v_valor_enfileirado,
    'bloqueados_teto', v_bloqueados,
    'bloqueios', v_bloqueios
  );
end;
$$;

revoke all on function public.bonus_substituir_auditoria(date, jsonb, text) from public;
grant execute on function public.bonus_substituir_auditoria(date, jsonb, text) to authenticated;

-- 2) bonus_solicitar_lancamento_caixa (o "Lançar no Caixa" do Bônus): ao acionar,
--    também garante um job pendente de 'sync-bonus-desconto-caixa' se houver
--    itens PENDENTE na fila de desconto (qualquer competência, não só a atual).
create or replace function public.bonus_solicitar_lancamento_caixa(p_competencia date, p_colaboradores text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_enfileirados integer := 0;
  v_ja_lancados integer := 0;
  v_ja_pendentes integer := 0;
  v_rejeitados integer := 0;
  v_rejeicoes jsonb := '[]'::jsonb;
  v_job_id uuid;
  v_desconto_job_id uuid;
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

  -- Em competência fechada, a fila histórica é a autorização financeira.
  -- Só ERRO pode ser reaberto e sempre com os mesmos tons/valor já aprovados.
  -- CANCELADO não é reaberto e nomes sem histórico jamais viram nova obrigação.
  if public.bonus_competencia_fechada(v_comp) then
    drop table if exists pg_temp.bonus_lote_fechado_tmp;
    create temporary table bonus_lote_fechado_tmp on commit drop as
    with solicitados as (
      select distinct on (public.bonus_normalizar_nome(btrim(x)))
        btrim(x) as input_nome,
        public.bonus_normalizar_nome(btrim(x)) as nome_key
      from unnest(p_colaboradores) as u(x)
      where btrim(coalesce(x, '')) <> ''
        and public.bonus_normalizar_nome(btrim(x)) <> ''
      order by public.bonus_normalizar_nome(btrim(x)), btrim(x)
    )
    select
      s.input_nome,
      s.nome_key,
      f.colaborador,
      f.tons as snapshot_tons,
      f.valor as snapshot_valor,
      f.status as snapshot_status,
      f.motivo,
      l.id as lancamento_id,
      upper(l.status) as lancamento_status,
      l.tons as lancamento_tons,
      l.valor as lancamento_valor
    from solicitados s
    left join public.bonus_producao_fechada f
      on f.competencia=v_comp and f.nome_normalizado=s.nome_key
    left join public.bonus_caixa_lancamentos l
      on l.competencia=v_comp and l.nome_normalizado=s.nome_key;

    select
      count(*) filter (
        where colaborador is not null
          and snapshot_status='Apto'
          and coalesce(snapshot_valor,0)>0
          and lancamento_status='LANCADO'
      )::integer,
      count(*) filter (
        where colaborador is not null
          and snapshot_status='Apto'
          and coalesce(snapshot_valor,0)>0
          and lancamento_status in ('PENDENTE','PROCESSANDO')
      )::integer,
      count(*) filter (
        where colaborador is null
           or snapshot_status is distinct from 'Apto'
           or coalesce(snapshot_valor,0)<=0
           or lancamento_id is null
           or lancamento_status='CANCELADO'
           or lancamento_status not in ('LANCADO','PENDENTE','PROCESSANDO','ERRO','CANCELADO')
           or (
             lancamento_status='ERRO' and (
               abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
               or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
             )
           )
      )::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'colaborador', coalesce(colaborador,input_nome),
            'motivo', case
              when colaborador is null then 'Colaborador não consta na fotografia fechada'
              when snapshot_status is distinct from 'Apto' then coalesce(nullif(motivo,''),'Colaborador inapto na fotografia fechada')
              when coalesce(snapshot_valor,0)<=0 then 'Bônus R$ 0,00 - sem lançamento financeiro'
              when lancamento_id is null then 'Competência fechada: colaborador não fazia parte do lote aprovado para o Caixa'
              when lancamento_status='CANCELADO' then 'Lançamento cancelado na competência fechada; reabertura exige revisão administrativa'
              when lancamento_status='ERRO' and (
                abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
                or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
              ) then 'Divergência entre fila histórica e fotografia fechada; revisão manual obrigatória'
              else 'Não elegível para lançamento em competência fechada'
            end
          )
        ) filter (
          where colaborador is null
             or snapshot_status is distinct from 'Apto'
             or coalesce(snapshot_valor,0)<=0
             or lancamento_id is null
             or lancamento_status='CANCELADO'
             or lancamento_status not in ('LANCADO','PENDENTE','PROCESSANDO','ERRO','CANCELADO')
             or (
               lancamento_status='ERRO' and (
                 abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
                 or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
               )
             )
        ),
        '[]'::jsonb
      )
    into v_ja_lancados, v_ja_pendentes, v_rejeitados, v_rejeicoes
    from bonus_lote_fechado_tmp;

    update public.bonus_caixa_lancamentos l
       set status='PENDENTE',
           tentativas=0,
           ultimo_erro=null,
           grm_retorno=null,
           solicitado_por=v_uid,
           solicitado_em=now(),
           iniciado_em=null,
           processado_em=null,
           updated_at=now()
      from bonus_lote_fechado_tmp t
     where l.id=t.lancamento_id
       and t.lancamento_status='ERRO'
       and t.snapshot_status='Apto'
       and coalesce(t.snapshot_valor,0)>0
       and abs(coalesce(t.lancamento_tons,0)-coalesce(t.snapshot_tons,0))<=0.001
       and abs(coalesce(t.lancamento_valor,0)-coalesce(t.snapshot_valor,0))<=0.001;

    get diagnostics v_enfileirados = row_count;

    if v_enfileirados > 0 and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id='sync-bonus-caixa'
        and status in ('pendente','rodando','processando')
    ) then
      insert into public.grm_sync_jobs (agente_id,status,solicitado_por,payload)
      values (
        'sync-bonus-caixa','pendente',v_uid::text,
        jsonb_build_object('competencia',v_comp,'origem','conferencia_bonus_fechado_retry','quantidade',v_enfileirados)
      ) returning id into v_job_id;
    end if;

    if exists (
      select 1 from public.bonus_desconto_caixa_lancamentos where status = 'PENDENTE'
    ) and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'sync-bonus-desconto-caixa'
        and status in ('pendente', 'rodando', 'processando')
    ) then
      insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
      values (
        'sync-bonus-desconto-caixa',
        'pendente',
        v_uid::text,
        jsonb_build_object('origem', 'bonus_solicitar_lancamento_caixa_fechado')
      ) returning id into v_desconto_job_id;
    end if;

    return jsonb_build_object(
      'competencia',v_comp,
      'competencia_fechada',true,
      'enfileirados',v_enfileirados,
      'ja_lancados',v_ja_lancados,
      'ja_pendentes',v_ja_pendentes,
      'rejeitados',v_rejeitados,
      'rejeicoes',v_rejeicoes,
      'job_id',v_job_id,
      'desconto_job_id',v_desconto_job_id
    );
  end if;

  drop table if exists pg_temp.bonus_lote_tmp;
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
      where colaborador is null
         or producao_status is distinct from 'Apto'
         or coalesce(valor, 0) <= 0
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and coalesce(valor,0) > 0
        and lancamento_status = 'LANCADO'
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and coalesce(valor,0) > 0
        and lancamento_status in ('PENDENTE', 'PROCESSANDO')
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'colaborador', coalesce(colaborador, input_nome),
          'motivo', case
            when colaborador is null then 'Sem produção na competência'
            when producao_status is distinct from 'Apto' then coalesce(nullif(motivo,''), 'Colaborador inapto')
            when coalesce(valor,0) <= 0 then 'Bônus R$ 0,00 - sem lançamento financeiro'
            else 'Não elegível para lançamento'
          end
        )
      ) filter (
        where colaborador is null
           or producao_status is distinct from 'Apto'
           or coalesce(valor,0) <= 0
      ),
      '[]'::jsonb
    )
  into v_rejeitados, v_ja_lancados, v_ja_pendentes, v_rejeicoes
  from bonus_lote_tmp;

  insert into public.bonus_caixa_lancamentos (
    competencia, colaborador_nome, nome_normalizado, tons, valor, status,
    tentativas, ultimo_erro, grm_retorno, solicitado_por, solicitado_em,
    iniciado_em, processado_em, updated_at
  )
  select
    v_comp, t.colaborador, t.nome_key, t.tons, t.valor, 'PENDENTE',
    0, null, null, v_uid, now(), null, null, now()
  from bonus_lote_tmp t
  where t.colaborador is not null
    and t.producao_status = 'Apto'
    and coalesce(t.valor,0) > 0
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
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values (
      'sync-bonus-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object('competencia', v_comp, 'origem', 'conferencia_bonus', 'quantidade', v_enfileirados)
    ) returning id into v_job_id;
  end if;

  if exists (
    select 1 from public.bonus_desconto_caixa_lancamentos where status = 'PENDENTE'
  ) and not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-bonus-desconto-caixa'
      and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values (
      'sync-bonus-desconto-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object('origem', 'bonus_solicitar_lancamento_caixa')
    ) returning id into v_desconto_job_id;
  end if;

  return jsonb_build_object(
    'competencia', v_comp,
    'competencia_fechada',false,
    'enfileirados', v_enfileirados,
    'ja_lancados', v_ja_lancados,
    'ja_pendentes', v_ja_pendentes,
    'rejeitados', v_rejeitados,
    'rejeicoes', v_rejeicoes,
    'job_id', v_job_id,
    'desconto_job_id', v_desconto_job_id
  );
end;
$function$
;

revoke all on function public.bonus_solicitar_lancamento_caixa(date, text[]) from public;
grant execute on function public.bonus_solicitar_lancamento_caixa(date, text[]) to authenticated;
