create table public.frotas_manutencoes (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  tipo_servico text,
  descricao text,
  oficina text,
  data_execucao date not null default current_date,
  km_execucao numeric,
  custo numeric,
  proxima_data date,
  proxima_km numeric,
  anexo_url text,
  observacoes text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_frotas_manutencoes_veiculo on public.frotas_manutencoes(veiculo_id);
create trigger trg_frotas_manutencoes_updated_at before update on public.frotas_manutencoes
  for each row execute function public.set_updated_at_generic();
alter table public.frotas_manutencoes enable row level security;
create policy frotas_manutencoes_authenticated on public.frotas_manutencoes for all to authenticated using (true) with check (true);

create table public.frotas_trocas_oleo (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  tipo_oleo text,
  data_execucao date not null default current_date,
  km_execucao numeric,
  custo numeric,
  proxima_data date,
  proxima_km numeric,
  anexo_url text,
  observacoes text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_frotas_trocas_oleo_veiculo on public.frotas_trocas_oleo(veiculo_id);
create trigger trg_frotas_trocas_oleo_updated_at before update on public.frotas_trocas_oleo
  for each row execute function public.set_updated_at_generic();
alter table public.frotas_trocas_oleo enable row level security;
create policy frotas_trocas_oleo_authenticated on public.frotas_trocas_oleo for all to authenticated using (true) with check (true);

create table public.frotas_checklists (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  data_execucao date not null default current_date,
  km_execucao numeric,
  responsavel text,
  itens jsonb not null default '[]'::jsonb,
  aprovado boolean,
  proxima_data date,
  anexo_url text,
  observacoes text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_frotas_checklists_veiculo on public.frotas_checklists(veiculo_id);
create trigger trg_frotas_checklists_updated_at before update on public.frotas_checklists
  for each row execute function public.set_updated_at_generic();
alter table public.frotas_checklists enable row level security;
create policy frotas_checklists_authenticated on public.frotas_checklists for all to authenticated using (true) with check (true);;
