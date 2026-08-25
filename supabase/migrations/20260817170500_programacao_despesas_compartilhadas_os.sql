-- Programação — despesas compartilhadas entre O.S. do mesmo colaborador/dia
--
-- Regra operacional:
--   * Estadia, alimentação e deslocamento possuem UM registro físico por
--     colaborador + data, independentemente de quantas O.S. ele atende.
--   * A associação visual com as O.S. é derivada de programacao_equipe; a
--     mesma despesa pode aparecer em várias O.S. sem ser clonada.
--   * Extras continuam sendo registros independentes, pois o colaborador pode
--     ter mais de um lançamento extra no mesmo dia.
--
-- A migração preserva os registros antigos removidos da tabela ativa em uma
-- tabela de auditoria antes de consolidar duplicidades já existentes.

create table if not exists public.programacao_despesas_dedup_archive (
  source_table text not null,
  source_id uuid not null,
  payload jsonb not null,
  reason text not null default 'DUPLICADO_COLABORADOR_DIA',
  archived_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

comment on table public.programacao_despesas_dedup_archive is
  'Auditoria dos registros removidos ao consolidar despesas da Programação por colaborador/dia.';

alter table public.programacao_despesas_dedup_archive enable row level security;

-- O mapa temporário escolhe:
-- 1. o registro mais recentemente alterado como fonte de verdade dos valores;
-- 2. sempre que possível, um programacao_id cuja data da Programação seja a
--    mesma data_referencia da despesa (corrige cópias antigas apontando para o
--    dia anterior sem trocar o conteúdo mais recente).
create temporary table _programacao_despesas_dedup_map (
  source_table text not null,
  keeper_id uuid not null,
  canonical_programacao_id uuid not null,
  primary key (source_table, keeper_id)
) on commit drop;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'programacao_alimentacao',
    'programacao_estadia',
    'programacao_deslocamento'
  ]
  loop
    execute format($sql$
      insert into _programacao_despesas_dedup_map (
        source_table,
        keeper_id,
        canonical_programacao_id
      )
      with ranked as (
        select
          d.id,
          first_value(d.id) over (
            partition by d.data_referencia, d.colaborador_id
            order by d.updated_at desc nulls last,
                     d.created_at desc nulls last,
                     d.id
          ) as keeper_id,
          first_value(d.programacao_id) over (
            partition by d.data_referencia, d.colaborador_id
            order by coalesce(pd.data_referencia = d.data_referencia, false) desc,
                     d.updated_at desc nulls last,
                     d.created_at desc nulls last,
                     d.id
          ) as canonical_programacao_id,
          count(*) over (
            partition by d.data_referencia, d.colaborador_id
          ) as qtd
        from public.%I d
        left join public.programacao_dia pd on pd.id = d.programacao_id
      )
      select distinct %L, keeper_id, canonical_programacao_id
      from ranked
      where qtd > 1
      on conflict (source_table, keeper_id) do nothing
    $sql$, tabela, tabela);

    -- Arquiva todos os registros que deixarão de ser ativos antes do DELETE.
    execute format($sql$
      insert into public.programacao_despesas_dedup_archive (
        source_table,
        source_id,
        payload,
        reason
      )
      select
        %L,
        d.id,
        to_jsonb(d),
        'DUPLICADO_COLABORADOR_DIA'
      from public.%I d
      join _programacao_despesas_dedup_map m
        on m.source_table = %L
      join public.%I keeper
        on keeper.id = m.keeper_id
       and keeper.data_referencia = d.data_referencia
       and keeper.colaborador_id = d.colaborador_id
      where d.id <> m.keeper_id
      on conflict (source_table, source_id) do nothing
    $sql$, tabela, tabela, tabela, tabela);

    -- Mantém somente o lançamento mais recente de cada colaborador/dia.
    execute format($sql$
      delete from public.%I d
      using _programacao_despesas_dedup_map m,
            public.%I keeper
      where m.source_table = %L
        and keeper.id = m.keeper_id
        and d.data_referencia = keeper.data_referencia
        and d.colaborador_id = keeper.colaborador_id
        and d.id <> m.keeper_id
    $sql$, tabela, tabela, tabela);

    -- Reassocia o registro preservado à Programação do próprio dia quando
    -- havia uma cópia antiga apontando para outro programacao_id.
    execute format($sql$
      update public.%I d
         set programacao_id = m.canonical_programacao_id
        from _programacao_despesas_dedup_map m
       where m.source_table = %L
         and d.id = m.keeper_id
         and d.programacao_id is distinct from m.canonical_programacao_id
    $sql$, tabela, tabela);
  end loop;
end
$$;

-- Invariante física: cada categoria base possui um único registro por dia.
create unique index if not exists programacao_alimentacao_colaborador_dia_uidx
  on public.programacao_alimentacao (data_referencia, colaborador_id);

create unique index if not exists programacao_estadia_colaborador_dia_uidx
  on public.programacao_estadia (data_referencia, colaborador_id);

create unique index if not exists programacao_deslocamento_colaborador_dia_uidx
  on public.programacao_deslocamento (data_referencia, colaborador_id);

comment on index public.programacao_alimentacao_colaborador_dia_uidx is
  'Uma alimentação por colaborador/dia; múltiplas O.S. compartilham o mesmo registro.';
comment on index public.programacao_estadia_colaborador_dia_uidx is
  'Uma estadia por colaborador/dia; múltiplas O.S. compartilham o mesmo registro.';
comment on index public.programacao_deslocamento_colaborador_dia_uidx is
  'Um deslocamento por colaborador/dia; múltiplas O.S. compartilham o mesmo registro.';

-- Os frontends existentes fazem UPSERT por (programacao_id,colaborador_id).
-- Antes do INSERT, redirecionamos o programacao_id para o registro diário já
-- existente. Assim o ON CONFLICT antigo continua funcionando e atualiza o
-- mesmo ID físico em vez de tentar criar outro para uma segunda O.S./contexto.
create or replace function public.programacao_despesa_compartilhar_por_dia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  programacao_existente uuid;
begin
  if new.data_referencia is null or nullif(btrim(new.colaborador_id), '') is null then
    return new;
  end if;

  execute format(
    'select programacao_id
       from public.%I
      where data_referencia = $1
        and colaborador_id = $2
        and id is distinct from $3
      order by updated_at desc nulls last,
               created_at desc nulls last,
               id
      limit 1',
    tg_table_name
  )
  into programacao_existente
  using new.data_referencia, new.colaborador_id, new.id;

  if programacao_existente is not null then
    new.programacao_id := programacao_existente;
  end if;

  return new;
end
$$;

comment on function public.programacao_despesa_compartilhar_por_dia() is
  'Mantém estadia/alimentação/deslocamento como um único registro por colaborador/dia, mesmo quando há várias O.S.';

drop trigger if exists trg_programacao_alimentacao_compartilhar_dia on public.programacao_alimentacao;
create trigger trg_programacao_alimentacao_compartilhar_dia
before insert or update on public.programacao_alimentacao
for each row execute function public.programacao_despesa_compartilhar_por_dia();

drop trigger if exists trg_programacao_estadia_compartilhar_dia on public.programacao_estadia;
create trigger trg_programacao_estadia_compartilhar_dia
before insert or update on public.programacao_estadia
for each row execute function public.programacao_despesa_compartilhar_por_dia();

drop trigger if exists trg_programacao_deslocamento_compartilhar_dia on public.programacao_deslocamento;
create trigger trg_programacao_deslocamento_compartilhar_dia
before insert or update on public.programacao_deslocamento
for each row execute function public.programacao_despesa_compartilhar_por_dia();

-- Projeção visual: uma mesma despesa aparece em todas as O.S. confirmadas do
-- colaborador naquele dia, sempre carregando o MESMO despesa_id. O JOIN cria
-- apenas linhas de exibição; não duplica o lançamento nas tabelas de origem.
create or replace view public.programacao_despesas_os_compartilhadas
with (security_invoker = true)
as
with os_dia as (
  select distinct
    pe.programacao_id,
    pe.os_id,
    pe.colaborador_id,
    pd.data_referencia
  from public.programacao_equipe pe
  join public.programacao_dia pd on pd.id = pe.programacao_id
  where pe.confirmado = true
    and pe.os_id is not null
), despesas as (
  select
    a.id as despesa_id,
    'ALIMENTACAO'::text as tipo_registro,
    a.programacao_id as programacao_origem_id,
    a.data_referencia,
    a.colaborador_id,
    a.nome_colaborador,
    to_jsonb(a) as detalhes
  from public.programacao_alimentacao a

  union all

  select
    e.id,
    'ESTADIA'::text,
    e.programacao_id,
    e.data_referencia,
    e.colaborador_id,
    e.nome_colaborador,
    to_jsonb(e)
  from public.programacao_estadia e

  union all

  select
    d.id,
    'DESLOCAMENTO'::text,
    d.programacao_id,
    d.data_referencia,
    d.colaborador_id,
    d.nome_colaborador,
    to_jsonb(d)
  from public.programacao_deslocamento d

  union all

  select
    x.id,
    'EXTRA'::text,
    x.programacao_id,
    x.data_referencia,
    x.colaborador_id,
    x.nome_colaborador,
    to_jsonb(x)
  from public.programacao_extras x
)
select
  d.despesa_id,
  d.tipo_registro,
  d.data_referencia,
  d.colaborador_id,
  d.nome_colaborador,
  d.programacao_origem_id,
  o.programacao_id as programacao_exibicao_id,
  o.os_id,
  d.detalhes
from despesas d
join os_dia o
  on o.data_referencia = d.data_referencia
 and o.colaborador_id = d.colaborador_id;

comment on view public.programacao_despesas_os_compartilhadas is
  'Exibe a mesma despesa em todas as O.S. do colaborador no dia sem duplicar o registro físico.';

grant select on public.programacao_despesas_os_compartilhadas to authenticated;
