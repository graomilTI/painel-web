create table if not exists public.grm_despesas_retroativas_auditoria (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  cpf text not null,
  colaborador text not null,
  sta_code bigint not null,
  tipo_contrato text not null,
  tipo_despesa text not null,
  oex_code bigint not null,
  valor numeric(12,2) not null,
  acao text not null check (acao in ('NONE', 'APPROVE', 'CREATE')),
  ofm_code bigint,
  dry_run boolean not null default false,
  sucesso boolean not null default false,
  erro text,
  diagnostico jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists grm_despesas_retroativas_auditoria_data_cpf_idx
  on public.grm_despesas_retroativas_auditoria (data_referencia desc, cpf);
alter table public.grm_despesas_retroativas_auditoria enable row level security;
revoke all on table public.grm_despesas_retroativas_auditoria from anon, authenticated;
