-- Histórico de situação extraído diretamente dos relatórios de colaboradores do GRM.
--
-- A tabela `colaboradores` guarda apenas o estado mais recente. Para relatórios
-- retroativos (ex.: conferir quem era efetivo ativo em 23/07), precisamos saber
-- em que data o relatório do GRM mudou o colaborador de Ativo para outra situação
-- e também quando houve uma eventual reativação/readmissão.

create extension if not exists pgcrypto;

create table if not exists public.colaboradores_status_historico (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid null,
  cpf text not null,
  nome text not null,
  situacao_anterior text null,
  situacao_nova text not null,
  ativo_anterior boolean null,
  ativo_novo boolean not null,
  data_efetiva date not null,
  detectado_em timestamptz not null default now(),
  fonte text not null default 'grmserver_relatorio_colaboradores',
  relatorio_referencia timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_colab_status_hist_cpf_data
  on public.colaboradores_status_historico (cpf, data_efetiva desc, detectado_em desc);

create index if not exists idx_colab_status_hist_nome_data
  on public.colaboradores_status_historico (nome, data_efetiva desc, detectado_em desc);

create index if not exists idx_colab_status_hist_ativo_data
  on public.colaboradores_status_historico (ativo_novo, data_efetiva desc);

-- Evita gravar o mesmo estado efetivo repetidamente em cada execução do agente.
create unique index if not exists uq_colab_status_hist_estado
  on public.colaboradores_status_historico
  (cpf, ativo_novo, data_efetiva, (coalesce(situacao_nova, '')));

alter table public.colaboradores_status_historico enable row level security;

drop policy if exists "colaboradores_status_historico_select" on public.colaboradores_status_historico;
create policy "colaboradores_status_historico_select"
  on public.colaboradores_status_historico
  for select
  to authenticated
  using (true);

grant select on public.colaboradores_status_historico to authenticated;
grant all on public.colaboradores_status_historico to service_role;

-- Backfill inicial: aproveita qualquer colaborador que já esteja como não ativo
-- na base atual. Isso resolve imediatamente desligamentos já presentes no último
-- relatório, mesmo antes da primeira execução do agente com a comparação nova.
with base as (
  select
    id,
    regexp_replace(coalesce(cpf, ''), '\D', '', 'g') as cpf_normalizado,
    nome,
    situacao,
    desligamento,
    coalesce(sincronizado_em, updated_at, created_at) as momento,
    row_number() over (
      partition by regexp_replace(coalesce(cpf, ''), '\D', '', 'g')
      order by coalesce(sincronizado_em, updated_at, created_at) desc nulls last,
               desligamento desc nulls last,
               id desc
    ) as rn
  from public.colaboradores
  where coalesce(regexp_replace(cpf, '\D', '', 'g'), '') <> ''
), inativos as (
  select *
  from base
  where rn = 1
    and upper(trim(coalesce(situacao, ''))) <> 'ATIVO'
)
insert into public.colaboradores_status_historico (
  colaborador_id,
  cpf,
  nome,
  situacao_anterior,
  situacao_nova,
  ativo_anterior,
  ativo_novo,
  data_efetiva,
  detectado_em,
  fonte,
  relatorio_referencia,
  metadata
)
select
  id,
  cpf_normalizado,
  coalesce(nome, ''),
  null,
  coalesce(nullif(trim(situacao), ''), 'Não ativo'),
  null,
  false,
  coalesce(desligamento, current_date),
  coalesce(momento, now()),
  'backfill_colaboradores_atual',
  momento,
  jsonb_build_object('backfill', true)
from inativos
on conflict do nothing;

comment on table public.colaboradores_status_historico is
  'Mudanças de situação detectadas pela comparação entre relatórios sucessivos de colaboradores do GRM.';
comment on column public.colaboradores_status_historico.data_efetiva is
  'Data em que o novo estado passou a valer: desligamento/admissão do XLS, ou data da detecção quando o relatório não informa.';
