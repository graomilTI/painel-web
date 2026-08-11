-- Persistência individual do fluxo de checkout e créditos de hospedagem.

create table if not exists public.hospedagem_reserva_colaboradores (
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  status text not null default 'HOSPEDADO' check (status in ('HOSPEDADO','CHECKOUT','CANCELADO')),
  checkout_em timestamptz,
  checkout_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reserva_id, solicitacao_colaborador_id)
);

create index if not exists idx_hosp_reserva_colab_status
  on public.hospedagem_reserva_colaboradores (reserva_id, status);

create table if not exists public.hospedagem_checkout_lotes (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  hotel_id uuid references public.hospedagem_hoteis(id) on delete set null,
  data_checkout date not null default current_date,
  valor_diarias numeric(12,2) not null default 0,
  valor_extras numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null default 0,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','PARCIAL','PAGO','CANCELADO')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospedagem_checkout_lote_colaboradores (
  lote_id uuid not null references public.hospedagem_checkout_lotes(id) on delete cascade,
  reserva_colaborador_id uuid,
  nome_colaborador text not null,
  primary key (lote_id, nome_colaborador)
);

create index if not exists idx_hosp_checkout_lotes_hotel_status
  on public.hospedagem_checkout_lotes (hotel_id, status, data_checkout);

create table if not exists public.hospedagem_adiantamentos (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hospedagem_hoteis(id),
  reserva_origem_id uuid references public.hospedagem_reservas(id),
  valor_creditado numeric(14,2) not null check (valor_creditado > 0),
  saldo numeric(14,2) not null check (saldo >= 0),
  status text not null default 'DISPONIVEL' check (status in ('DISPONIVEL','UTILIZADO','CANCELADO')),
  observacoes text,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hosp_adiantamentos_hotel_disponivel
  on public.hospedagem_adiantamentos (hotel_id, created_at)
  where status = 'DISPONIVEL' and saldo > 0;

create table if not exists public.hospedagem_adiantamento_movimentos (
  id uuid primary key default gen_random_uuid(),
  adiantamento_id uuid not null references public.hospedagem_adiantamentos(id) on delete restrict,
  reserva_id uuid references public.hospedagem_reservas(id),
  tipo text not null check (tipo in ('CREDITO','DEBITO','ESTORNO')),
  valor numeric(14,2) not null check (valor > 0),
  observacoes text,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosp_adiantamento_mov_reserva
  on public.hospedagem_adiantamento_movimentos (reserva_id, created_at desc);

alter table if exists public.hospedagem_financeiro
  add column if not exists taxa_bancaria numeric(14,2) not null default 0,
  add column if not exists valor_comprovante numeric(14,2),
  add column if not exists classificacao_pagamento text,
  add column if not exists adiantamento_gerado numeric(14,2) not null default 0;

alter table public.hospedagem_reserva_colaboradores enable row level security;
alter table public.hospedagem_adiantamentos enable row level security;
alter table public.hospedagem_adiantamento_movimentos enable row level security;
alter table public.hospedagem_checkout_lotes enable row level security;
alter table public.hospedagem_checkout_lote_colaboradores enable row level security;

drop policy if exists hospedagem_reserva_colaboradores_auth_all on public.hospedagem_reserva_colaboradores;
create policy hospedagem_reserva_colaboradores_auth_all on public.hospedagem_reserva_colaboradores
  for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists hospedagem_adiantamentos_auth_all on public.hospedagem_adiantamentos;
create policy hospedagem_adiantamentos_auth_all on public.hospedagem_adiantamentos
  for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists hospedagem_adiantamento_movimentos_auth_all on public.hospedagem_adiantamento_movimentos;
create policy hospedagem_adiantamento_movimentos_auth_all on public.hospedagem_adiantamento_movimentos
  for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy hospedagem_checkout_lotes_auth_all on public.hospedagem_checkout_lotes
  for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy hospedagem_checkout_lote_colaboradores_auth_all on public.hospedagem_checkout_lote_colaboradores
  for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

grant select, insert, update, delete on public.hospedagem_reserva_colaboradores to authenticated;
grant select, insert, update, delete on public.hospedagem_adiantamentos to authenticated;
grant select, insert, update, delete on public.hospedagem_adiantamento_movimentos to authenticated;
grant select, insert, update, delete on public.hospedagem_checkout_lotes to authenticated;
grant select, insert, update, delete on public.hospedagem_checkout_lote_colaboradores to authenticated;
