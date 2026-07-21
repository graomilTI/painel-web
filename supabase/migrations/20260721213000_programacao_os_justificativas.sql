-- Justificativa obrigatória quando mais de um colaborador de atendimento
-- é vinculado à mesma O.S. no dia. Colaboradores marcados apenas como
-- LOGISTICA não entram nessa obrigatoriedade.
create table if not exists public.programacao_os_justificativas (
  id uuid primary key default gen_random_uuid(),
  programacao_id text not null,
  os_id text not null,
  data_referencia date,
  justificativa text not null check (char_length(trim(justificativa)) > 0),
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_os_justificativas_programacao_os_key unique (programacao_id, os_id)
);

create index if not exists idx_programacao_os_justificativas_data
  on public.programacao_os_justificativas (data_referencia desc);

create index if not exists idx_programacao_os_justificativas_os
  on public.programacao_os_justificativas (os_id);

alter table public.programacao_os_justificativas enable row level security;

drop policy if exists "programacao_os_justificativas_select" on public.programacao_os_justificativas;
create policy "programacao_os_justificativas_select"
  on public.programacao_os_justificativas
  for select
  to authenticated
  using (true);

drop policy if exists "programacao_os_justificativas_insert" on public.programacao_os_justificativas;
create policy "programacao_os_justificativas_insert"
  on public.programacao_os_justificativas
  for insert
  to authenticated
  with check (true);

drop policy if exists "programacao_os_justificativas_update" on public.programacao_os_justificativas;
create policy "programacao_os_justificativas_update"
  on public.programacao_os_justificativas
  for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.programacao_os_justificativas to authenticated;
