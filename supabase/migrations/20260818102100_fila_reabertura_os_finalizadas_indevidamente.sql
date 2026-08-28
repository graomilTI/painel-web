create table if not exists public.grm_reabertura_os_fila (
  id uuid primary key default gen_random_uuid(),
  os text not null unique,
  resultado_fechamento_id bigint references public.grm_finalizacao_os_resultados(id) on delete set null,
  fechamento_em timestamptz not null,
  fechamento_data date not null,
  criterio_fechamento text,
  servico text,
  remanescente numeric,
  data_os date,
  ultimo_embarque date,
  ultimo_fob date,
  dias_sem_embarque integer,
  dias_sem_fob integer,
  motivos text[] not null default '{}'::text[],
  prioridade smallint not null default 2 check (prioridade between 1 and 3),
  status text not null default 'PENDENTE_REABERTURA'
    check (status in ('PENDENTE_REABERTURA','EM_REABERTURA','REABERTA','IGNORADA','ERRO','RESOLVIDA_SEM_REABERTURA')),
  snapshot_lista_os_em timestamptz,
  regra_snapshot jsonb not null default '{}'::jsonb,
  observacao text,
  tentativas integer not null default 0,
  reaberto_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_grm_reabertura_os_fila_status_prioridade
  on public.grm_reabertura_os_fila (status, prioridade, remanescente desc nulls last);

alter table public.grm_reabertura_os_fila enable row level security;

create or replace function public.refresh_grm_reabertura_os_fila()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inseridas integer := 0;
  v_pendentes integer := 0;
  v_resolvidas integer := 0;
  v_snapshot timestamptz;
begin
  select max(data_sincronizacao) into v_snapshot from public.grm_lista_os_importacoes;

  with bad_seed as (
    select distinct regexp_replace(trim(os),'[^0-9]','','g') as os
    from public.grm_finalizacao_os_resultados
    where status='SUCESSO'
      and detalhes->>'criterio_finalizacao'='SEM_MOVIMENTO_5_DIAS'
      and coalesce(remanescente_tela,remanescente_exportado)>0
  ),
  last_close as (
    select distinct on (regexp_replace(trim(r.os),'[^0-9]','','g'))
      regexp_replace(trim(r.os),'[^0-9]','','g') as os,
      r.id as resultado_id,
      r.criado_em as fechamento_em,
      (r.criado_em at time zone 'America/Sao_Paulo')::date as fechamento_data,
      coalesce(r.remanescente_tela, r.remanescente_exportado) as remanescente,
      r.detalhes->>'criterio_finalizacao' as criterio,
      r.detalhes->>'servico_grm' as servico
    from public.grm_finalizacao_os_resultados r
    join bad_seed b on b.os=regexp_replace(trim(r.os),'[^0-9]','','g')
    where r.status='SUCESSO'
    order by regexp_replace(trim(r.os),'[^0-9]','','g'), r.criado_em desc, r.id desc
  ),
  hist as (
    select distinct on (g.dados_json->>'O.S.')
      g.dados_json->>'O.S.' as os,
      case
        when coalesce(g.dados_json->>'Data','') ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(g.dados_json->>'Data','DD/MM/YYYY')
        when coalesce(g.dados_json->>'Data','') ~ '^\d{4}-\d{2}-\d{2}$' then (g.dados_json->>'Data')::date
        else null
      end as data_os
    from public.grm_lista_os_importacoes g
    join bad_seed b on b.os=g.dados_json->>'O.S.'
    order by g.dados_json->>'O.S.', g.data_sincronizacao desc
  ),
  current_open as (
    select distinct g.dados_json->>'O.S.' as os
    from public.grm_lista_os_importacoes g
    where g.data_sincronizacao=v_snapshot
  ),
  evaluated as (
    select lc.*, h.data_os,
      emb.ultimo_embarque,
      nhe.ultimo_nhe,
      pnhe.prod_nhe_recente,
      case
        when emb.ultimo_embarque is not null then lc.fechamento_data-emb.ultimo_embarque
        when h.data_os is not null then lc.fechamento_data-h.data_os
        else null
      end as dias_sem_embarque,
      case
        when pnhe.prod_nhe_recente is not null then lc.fechamento_data-pnhe.prod_nhe_recente
        when nhe.ultimo_nhe is not null then lc.fechamento_data-nhe.ultimo_nhe
        when h.data_os is not null then lc.fechamento_data-h.data_os
        else null
      end as dias_sem_fob,
      upper(translate(trim(coalesce(lc.servico,'')),'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc'))='CLASSIFICACAO FOB' as servico_ok,
      lc.remanescente between 0 and 30 as saldo_ok,
      case when emb.ultimo_embarque is not null then lc.fechamento_data-emb.ultimo_embarque >= 6
           else h.data_os is not null and lc.fechamento_data-h.data_os >= 6 end as embarque_ok,
      case
        when pnhe.prod_nhe_recente is not null then false
        when nhe.ultimo_nhe is not null then lc.fechamento_data-nhe.ultimo_nhe >= 6
        else h.data_os is not null and lc.fechamento_data-h.data_os >= 6
      end as fob_ok
    from last_close lc
    left join hist h using(os)
    left join lateral (
      select max(c.data_classificacao) as ultimo_embarque
      from public.grm_cargas_importacoes c
      where regexp_replace(regexp_replace(trim(coalesce(c.os,'')), '\.0+$','','g'),'[^0-9]','','g')=lc.os
        and c.data_classificacao<=lc.fechamento_data
    ) emb on true
    left join lateral (
      select max((n.dados_json->>'lnsDate')::date) as ultimo_nhe
      from public.grm_nhe_importacoes n
      where n.dados_json->>'sorCode'=lc.os
        and coalesce(n.dados_json->>'lnsDate','') ~ '^\d{4}-\d{2}-\d{2}$'
        and (n.dados_json->>'lnsDate')::date<=lc.fechamento_data
    ) nhe on true
    left join lateral (
      select max(d)::date as prod_nhe_recente
      from generate_series(lc.fechamento_data-5, lc.fechamento_data, interval '1 day') gs(d)
      where exists (
        select 1
        from public.grm_producao_diaria_importacoes p
        where p.dados_json->>'Data'=to_char(d,'YYYY-MM-DD')
          and p.dados_json->>'O.S.'=lc.os
          and upper(trim(coalesce(p.dados_json->>'Cargas','')))='NHE'
        limit 1
      )
    ) pnhe on true
  ),
  candidates as (
    select e.*,
      greatest(e.ultimo_nhe, e.prod_nhe_recente) as ultimo_fob,
      array_remove(array[
        case when not e.servico_ok then 'SERVICO_NAO_FOB' end,
        case when not e.saldo_ok then 'REMANESCENTE_FORA_0_30' end,
        case when not e.embarque_ok then 'EMBARQUE_MENOS_6_DIAS' end,
        case when not e.fob_ok then 'FOB_MENOS_6_DIAS' end
      ], null) as motivos,
      case
        when not e.servico_ok or abs(coalesce(e.remanescente,0)) > 1000 then 1
        when not e.saldo_ok or not e.embarque_ok or not e.fob_ok then 2
        else 3
      end::smallint as prioridade
    from evaluated e
    left join current_open co using(os)
    where co.os is null
      and e.criterio is distinct from 'APROVADA_LOGISTICA'
      and not (e.servico_ok and e.saldo_ok and e.embarque_ok and e.fob_ok)
  ),
  upserted as (
    insert into public.grm_reabertura_os_fila (
      os, resultado_fechamento_id, fechamento_em, fechamento_data,
      criterio_fechamento, servico, remanescente, data_os,
      ultimo_embarque, ultimo_fob, dias_sem_embarque, dias_sem_fob,
      motivos, prioridade, status, snapshot_lista_os_em, regra_snapshot,
      observacao, updated_at
    )
    select
      c.os, c.resultado_id, c.fechamento_em, c.fechamento_data,
      c.criterio, c.servico, c.remanescente, c.data_os,
      c.ultimo_embarque, c.ultimo_fob, c.dias_sem_embarque, c.dias_sem_fob,
      c.motivos, c.prioridade, 'PENDENTE_REABERTURA', v_snapshot,
      jsonb_build_object(
        'servico','Classificação FOB',
        'dias_sem_embarque_min',6,
        'dias_sem_fob_min',6,
        'remanescente_min',0,
        'remanescente_max',30,
        'fonte_embarque','grm_cargas_importacoes',
        'fonte_fob',jsonb_build_array('grm_nhe_importacoes','grm_producao_diaria_importacoes:Cargas=NHE')
      ),
      'Reabertura preparada por correção de finalização automática indevida.',
      now()
    from candidates c
    on conflict (os) do update set
      resultado_fechamento_id=excluded.resultado_fechamento_id,
      fechamento_em=excluded.fechamento_em,
      fechamento_data=excluded.fechamento_data,
      criterio_fechamento=excluded.criterio_fechamento,
      servico=excluded.servico,
      remanescente=excluded.remanescente,
      data_os=excluded.data_os,
      ultimo_embarque=excluded.ultimo_embarque,
      ultimo_fob=excluded.ultimo_fob,
      dias_sem_embarque=excluded.dias_sem_embarque,
      dias_sem_fob=excluded.dias_sem_fob,
      motivos=excluded.motivos,
      prioridade=excluded.prioridade,
      snapshot_lista_os_em=excluded.snapshot_lista_os_em,
      regra_snapshot=excluded.regra_snapshot,
      status=case
        when public.grm_reabertura_os_fila.status in ('REABERTA','IGNORADA') then public.grm_reabertura_os_fila.status
        else 'PENDENTE_REABERTURA'
      end,
      updated_at=now()
    returning id
  )
  select count(*) into v_inseridas from upserted;

  update public.grm_reabertura_os_fila q
  set status='RESOLVIDA_SEM_REABERTURA',
      observacao=coalesce(q.observacao,'') || E'\nRemovida automaticamente da fila após nova validação/snapshot.',
      updated_at=now()
  where q.status='PENDENTE_REABERTURA'
    and not exists (
      select 1
      from candidates c
      where c.os=q.os
    );
  get diagnostics v_resolvidas = row_count;

  select count(*) into v_pendentes
  from public.grm_reabertura_os_fila
  where status='PENDENTE_REABERTURA';

  return jsonb_build_object(
    'ok',true,
    'snapshot_lista_os_em',v_snapshot,
    'itens_atualizados',v_inseridas,
    'pendentes_reabertura',v_pendentes,
    'resolvidas_sem_reabertura',v_resolvidas
  );
end;
$$;

revoke all on function public.refresh_grm_reabertura_os_fila() from public, anon, authenticated;
grant execute on function public.refresh_grm_reabertura_os_fila() to service_role;

comment on table public.grm_reabertura_os_fila is
  'Fila auditável de correção das OS finalizadas indevidamente pelo agente sync-finalizar-os.';
comment on function public.refresh_grm_reabertura_os_fila() is
  'Recalcula a fila usando a regra oficial: Classificação FOB, >=6 dias sem embarque, >=6 dias sem FOB/NHE e remanescente 0..30.';
