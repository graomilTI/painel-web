-- Distribuição de OS: quando a mesma OS aparece em mais de uma programação/
-- supervisão no mesmo dia, somente a programação mais recente deve participar.
--
-- A definição continua preservando o histórico na tabela programacao_equipe;
-- apenas a view *_ultima deixa de expor simultaneamente programações antigas
-- da mesma OS/data para consumidores como aplicar-distribuicao-os.

create or replace view public.programacao_equipe_ultima as
with base as (
  select
    e.id,
    e.programacao_id,
    e.os_id,
    e.colaborador_id,
    e.nome_colaborador,
    e.score,
    e.score_contrato,
    e.score_distancia,
    e.score_auditoria,
    e.km_estimado,
    e.confirmado,
    e.ordem_rota,
    e.created_at,
    e.updated_at,
    pd.data_referencia,
    pd.created_at as programacao_created_at,
    pd.updated_at as programacao_updated_at
  from public.programacao_equipe e
  join public.programacao_dia_ultima pd
    on pd.id = e.programacao_id
),
por_programa as (
  select
    b.os_id,
    b.data_referencia,
    b.programacao_id,
    max(coalesce(b.updated_at, b.created_at)) as ultimo_vinculo_em,
    bool_or(b.confirmado is true) as tem_confirmado,
    max(b.programacao_updated_at) as programacao_updated_at,
    max(b.programacao_created_at) as programacao_created_at
  from base b
  where b.os_id is not null
  group by b.os_id, b.data_referencia, b.programacao_id
),
vencedora as (
  select ranked.os_id, ranked.data_referencia, ranked.programacao_id
  from (
    select
      p.*,
      row_number() over (
        partition by p.os_id, p.data_referencia
        order by
          p.ultimo_vinculo_em desc nulls last,
          p.tem_confirmado desc,
          p.programacao_updated_at desc nulls last,
          p.programacao_created_at desc nulls last,
          p.programacao_id desc
      ) as rn
    from por_programa p
  ) ranked
  where ranked.rn = 1
)
select
  b.id,
  b.programacao_id,
  b.os_id,
  b.colaborador_id,
  b.nome_colaborador,
  b.score,
  b.score_contrato,
  b.score_distancia,
  b.score_auditoria,
  b.km_estimado,
  b.confirmado,
  b.ordem_rota,
  b.created_at,
  b.updated_at
from base b
where b.os_id is null
   or exists (
     select 1
     from vencedora v
     where v.os_id = b.os_id
       and v.data_referencia = b.data_referencia
       and v.programacao_id = b.programacao_id
   );

comment on view public.programacao_equipe_ultima is
'Equipe vigente por OS e data. Quando a mesma OS aparece em mais de uma programacao/supervisao no mesmo dia, somente a programacao com o vinculo de equipe mais recente e considerada; em empate, prioriza a que possui vinculo confirmado. Preserva todas as linhas da programacao vencedora e o historico permanece em programacao_equipe.';
