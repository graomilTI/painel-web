-- Vínculos independentes entre frota, O.S. e colaboradores.
-- A frota deixa de ser tratada como integrante da equipe quando está apenas em
-- Logística. Assim, o vínculo Colaborador <-> O.S. permanece intacto e uma
-- mesma frota pode transportar vários colaboradores no mesmo roteiro.

create table if not exists public.programacao_frota_vinculos (
  id uuid primary key default gen_random_uuid(),
  chave_vinculo text not null unique,
  programacao_id uuid not null,
  data_referencia date,
  frota_colaborador_id text not null,
  frota_nome text,
  placa_veiculo text not null,
  tipo_atuacao text not null check (tipo_atuacao in ('ATENDIMENTO', 'LOGISTICA')),
  alvo_tipo text not null check (alvo_tipo in ('OS', 'COLABORADOR')),
  os_id uuid not null references public.operacional_os(id) on delete cascade,
  alvo_colaborador_id text,
  alvo_colaborador_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_frota_vinculos_alvo_ck check (
    (alvo_tipo = 'OS' and alvo_colaborador_id is null)
    or (alvo_tipo = 'COLABORADOR' and alvo_colaborador_id is not null)
  )
);

create index if not exists programacao_frota_vinculos_programacao_idx
  on public.programacao_frota_vinculos(programacao_id);
create index if not exists programacao_frota_vinculos_frota_idx
  on public.programacao_frota_vinculos(programacao_id, frota_colaborador_id);
create index if not exists programacao_frota_vinculos_os_idx
  on public.programacao_frota_vinculos(os_id);
create index if not exists programacao_frota_vinculos_alvo_idx
  on public.programacao_frota_vinculos(programacao_id, alvo_colaborador_id)
  where alvo_colaborador_id is not null;

alter table public.programacao_frota_vinculos enable row level security;

drop policy if exists programacao_frota_vinculos_rw
  on public.programacao_frota_vinculos;
create policy programacao_frota_vinculos_rw
  on public.programacao_frota_vinculos
  for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete
  on public.programacao_frota_vinculos
  to authenticated;
