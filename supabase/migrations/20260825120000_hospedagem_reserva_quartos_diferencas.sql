-- Fase 0 da reconstrução do módulo Hotel: itemização de quartos por reserva
-- e lançamento de diferença no caixa do colaborador (hotel fora do sugerido).

create table if not exists public.hospedagem_reserva_quartos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  quantidade integer not null default 1 check (quantidade > 0),
  tipo_quarto text not null default 'INDIVIDUAL' check (tipo_quarto in ('INDIVIDUAL','DUPLO','TRIPLO','QUADRUPLO')),
  genero text check (genero in ('MASC','FEM','MISTO')),
  valor_diaria numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hosp_reserva_quartos_reserva
  on public.hospedagem_reserva_quartos (reserva_id);

drop trigger if exists trg_hosp_reserva_quartos_updated_at on public.hospedagem_reserva_quartos;
create trigger trg_hosp_reserva_quartos_updated_at
  before update on public.hospedagem_reserva_quartos
  for each row execute function public.hospedagem_touch_updated_at();

alter table public.hospedagem_reserva_colaboradores
  add column if not exists reserva_quarto_id uuid references public.hospedagem_reserva_quartos(id) on delete set null;

create index if not exists idx_hosp_reserva_colab_quarto
  on public.hospedagem_reserva_colaboradores (reserva_quarto_id);

create table if not exists public.hospedagem_diferencas_colaborador (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  observacoes text,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosp_diferencas_reserva
  on public.hospedagem_diferencas_colaborador (reserva_id);
create index if not exists idx_hosp_diferencas_colaborador
  on public.hospedagem_diferencas_colaborador (solicitacao_colaborador_id);

alter table public.hospedagem_reserva_quartos enable row level security;
alter table public.hospedagem_diferencas_colaborador enable row level security;

drop policy if exists hospedagem_reserva_quartos_select_authorized on public.hospedagem_reserva_quartos;
create policy hospedagem_reserva_quartos_select_authorized
  on public.hospedagem_reserva_quartos
  for select to authenticated
  using (hospedagem_pode_operar(false) or hospedagem_pode_financeiro(false));

drop policy if exists hospedagem_reserva_quartos_write_hotel on public.hospedagem_reserva_quartos;
create policy hospedagem_reserva_quartos_write_hotel
  on public.hospedagem_reserva_quartos
  for all to authenticated
  using (hospedagem_pode_operar(true))
  with check (hospedagem_pode_operar(true));

drop policy if exists hospedagem_diferencas_colaborador_select_authorized on public.hospedagem_diferencas_colaborador;
create policy hospedagem_diferencas_colaborador_select_authorized
  on public.hospedagem_diferencas_colaborador
  for select to authenticated
  using (hospedagem_pode_operar(false) or hospedagem_pode_financeiro(false));

drop policy if exists hospedagem_diferencas_colaborador_write_hotel on public.hospedagem_diferencas_colaborador;
create policy hospedagem_diferencas_colaborador_write_hotel
  on public.hospedagem_diferencas_colaborador
  for all to authenticated
  using (hospedagem_pode_operar(true))
  with check (hospedagem_pode_operar(true));

grant select, insert, update, delete on public.hospedagem_reserva_quartos to authenticated;
grant select, insert, update, delete on public.hospedagem_diferencas_colaborador to authenticated;
