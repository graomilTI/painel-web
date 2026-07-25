create table if not exists public.programacao_indisponibilidade_informados (
  id uuid primary key default gen_random_uuid(),
  programacao_id text,
  colaborador_id text not null,
  colaborador_cpf text,
  colaborador_nome text not null,
  cargo text,
  coordenacao text,
  supervisao text,
  data_referencia date not null,
  tipo text not null check (tipo in ('ATESTADO', 'FALTA', 'FERIAS', 'FOLGA')),
  observacao text,
  origem text not null default 'PROGRAMACAO_SEM_OS',
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PROCESSADO', 'CANCELADO')),
  informado_por uuid,
  informado_por_nome text,
  informado_em timestamptz not null default now(),
  processado_por uuid,
  processado_por_nome text,
  processado_em timestamptz,
  observacao_rh text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_indisponibilidade_informados_dia_colaborador_key
    unique (data_referencia, colaborador_id)
);

create index if not exists idx_prog_indisp_informados_status
  on public.programacao_indisponibilidade_informados (status, informado_em desc);

create index if not exists idx_prog_indisp_informados_data
  on public.programacao_indisponibilidade_informados (data_referencia desc);

alter table public.programacao_indisponibilidade_informados enable row level security;

drop policy if exists "programacao_indisponibilidade_informados_authenticated_all"
  on public.programacao_indisponibilidade_informados;

create policy "programacao_indisponibilidade_informados_authenticated_all"
  on public.programacao_indisponibilidade_informados
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete
  on public.programacao_indisponibilidade_informados
  to authenticated;
