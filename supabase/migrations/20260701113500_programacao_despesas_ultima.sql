-- Programação: camada canônica para despesas sempre pela última programação do dia.
-- Motivo: quando a programação do mesmo dia/supervisão é alterada mais de uma vez,
-- relatórios não devem somar versões antigas e duplicar despesa de colaborador.

create or replace view public.programacao_dia_ultima as
with ranked as (
  select
    pd.id,
    row_number() over (
      partition by pd.data_referencia, upper(trim(coalesce(pd.supervisao, '')))
      order by
        coalesce(pd.updated_at, pd.created_at, timestamp '1970-01-01') desc,
        pd.created_at desc,
        pd.id desc
    ) as rn
  from public.programacao_dia pd
)
select pd.*
from public.programacao_dia pd
join ranked r on r.id = pd.id
where r.rn = 1;
comment on view public.programacao_dia_ultima is
  'Última programação por data e supervisão. Usar como base para despesas consolidadas.';
create or replace view public.programacao_colaboradores_ultima as
select c.*
from public.programacao_colaboradores c
join public.programacao_dia_ultima pd on pd.id = c.programacao_id;
create or replace view public.programacao_equipe_ultima as
select e.*
from public.programacao_equipe e
join public.programacao_dia_ultima pd on pd.id = e.programacao_id;
-- Para relatórios de custo por colaborador/dia, esta é a visão segura:
-- uma única linha por colaborador dentro da última programação vigente.
create or replace view public.programacao_equipe_colaborador_ultima as
with ranked as (
  select
    e.id,
    row_number() over (
      partition by e.programacao_id, e.colaborador_id
      order by e.created_at desc, e.id desc
    ) as rn
  from public.programacao_equipe e
  join public.programacao_dia_ultima pd on pd.id = e.programacao_id
  where e.confirmado is true
)
select e.*
from public.programacao_equipe e
join ranked r on r.id = e.id
where r.rn = 1;
create or replace view public.programacao_estadia_ultima as
select e.*
from public.programacao_estadia e
join public.programacao_dia_ultima pd on pd.id = e.programacao_id;
create or replace view public.programacao_alimentacao_ultima as
select a.*
from public.programacao_alimentacao a
join public.programacao_dia_ultima pd on pd.id = a.programacao_id;
create or replace view public.programacao_deslocamento_ultima as
select d.*
from public.programacao_deslocamento d
join public.programacao_dia_ultima pd on pd.id = d.programacao_id;
create or replace view public.programacao_extras_ultima as
select x.*
from public.programacao_extras x
join public.programacao_dia_ultima pd on pd.id = x.programacao_id;
comment on view public.programacao_equipe_colaborador_ultima is
  'Equipe confirmada deduplicada por colaborador dentro da última programação vigente.';
comment on view public.programacao_estadia_ultima is
  'Estadia filtrada somente pela última programação do dia/supervisão.';
comment on view public.programacao_alimentacao_ultima is
  'Alimentação filtrada somente pela última programação do dia/supervisão.';
comment on view public.programacao_deslocamento_ultima is
  'Deslocamento filtrado somente pela última programação do dia/supervisão.';
comment on view public.programacao_extras_ultima is
  'Extras filtrados somente pela última programação do dia/supervisão.';
