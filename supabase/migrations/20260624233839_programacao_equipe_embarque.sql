-- Programação · Etapa B (Organizar Equipe / Roteiro Logístico)
-- 1) Persiste o rótulo "UF - Cidade (Local)" em operacional_pontos_embarque
-- 2) Vincula operacional_os ao ponto de embarque resolvido (evita matching textual em runtime)
-- 3) Tabela de candidatos/confirmações por OS (score Contrato/Distância/Auditoria)

-- 1) Rótulo persistido do ponto de embarque
alter table public.operacional_pontos_embarque
  add column if not exists embarque_label text generated always as
    (coalesce(uf, '') || ' - ' || coalesce(cidade, '') || ' (' || coalesce(nome_local, '') || ')') stored;

-- 2) Vínculo persistido OS -> ponto de embarque
alter table public.operacional_os
  add column if not exists ponto_embarque_id uuid references public.operacional_pontos_embarque(id) on delete set null;

create index if not exists idx_operacional_os_ponto_embarque on public.operacional_os (ponto_embarque_id);

-- Backfill: replica o score de matching textual hoje usado em runtime
-- (UF +50 / Cidade +80 / Local +120 / Cliente +30 / Supervisão +15; aceita score >= 120)
with normalizado as (
  select
    os.id as os_id,
    upper(trim(split_part(os.embarque, ' - ', 1))) as uf_os,
    lower(trim(regexp_replace(split_part(split_part(os.embarque, ' - ', 2), '(', 1), '\s+$', ''))) as cidade_os,
    lower(trim(regexp_replace(substring(os.embarque from '\(([^)]*)\)$'), '^\s+|\s+$', ''))) as local_os,
    lower(trim(os.cliente)) as cliente_os,
    lower(trim(os.supervisao)) as supervisao_os
  from public.operacional_os os
  where os.ponto_embarque_id is null and os.embarque is not null
),
candidatos as (
  select
    n.os_id,
    p.id as ponto_id,
    (case when n.uf_os <> '' and upper(p.uf) = n.uf_os then 50 else 0 end)
    + (case when n.cidade_os <> '' and (lower(p.cidade) like '%' || n.cidade_os || '%' or n.cidade_os like '%' || lower(p.cidade) || '%') then 80 else 0 end)
    + (case when n.local_os <> '' and (lower(p.nome_local) like '%' || n.local_os || '%' or n.local_os like '%' || lower(p.nome_local) || '%') then 120 else 0 end)
    + (case when n.cliente_os <> '' and (lower(p.nome_local) like '%' || n.cliente_os || '%' or n.cliente_os like '%' || lower(p.nome_local) || '%') then 30 else 0 end)
    + (case when n.supervisao_os <> '' and p.supervisao is not null and (lower(p.supervisao) like '%' || n.supervisao_os || '%' or n.supervisao_os like '%' || lower(p.supervisao) || '%') then 15 else 0 end)
      as score
  from normalizado n
  join public.operacional_pontos_embarque p
    on p.ativo is true and p.latitude is not null and p.longitude is not null
),
melhor as (
  select distinct on (os_id) os_id, ponto_id, score
  from candidatos
  where score >= 120
  order by os_id, score desc
)
update public.operacional_os os
set ponto_embarque_id = melhor.ponto_id
from melhor
where os.id = melhor.os_id;

-- 3) Candidatos/confirmações de equipe por OS (etapa B)
create table if not exists public.programacao_equipe (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacao_dia(id) on delete cascade,
  os_id uuid not null references public.operacional_os(id) on delete cascade,
  colaborador_id text not null,
  nome_colaborador text,
  score numeric,
  score_contrato numeric,
  score_distancia numeric,
  score_auditoria numeric,
  km_estimado numeric,
  confirmado boolean not null default false,
  ordem_rota integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programacao_id, os_id, colaborador_id)
);

create index if not exists idx_programacao_equipe_programacao on public.programacao_equipe (programacao_id);
create index if not exists idx_programacao_equipe_os on public.programacao_equipe (os_id);
create index if not exists idx_programacao_equipe_colaborador on public.programacao_equipe (programacao_id, colaborador_id);

alter table public.programacao_equipe enable row level security;
drop policy if exists programacao_equipe_auth_all on public.programacao_equipe;
create policy programacao_equipe_auth_all on public.programacao_equipe
  for all to authenticated using (true) with check (true);

drop trigger if exists trg_programacao_equipe_updated on public.programacao_equipe;
create trigger trg_programacao_equipe_updated
  before update on public.programacao_equipe
  for each row execute function public.set_updated_at();
;
