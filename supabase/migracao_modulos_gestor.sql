
-- =========================================================
-- MIGRAÇÃO DOS MÓDULOS DE GESTOR PARA SUPABASE
-- Programação fiel ao painel antigo + módulos gestor
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- PROGRAMAÇÃO DO GESTOR (A -> E)
-- ---------------------------------------------------------

create table if not exists public.programacao_contextos (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  supervisao text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (data_referencia, supervisao)
);

create table if not exists public.programacao_itens (
  id uuid primary key default gen_random_uuid(),
  contexto_id uuid not null references public.programacao_contextos(id) on delete cascade,
  colaborador_nome text not null,
  colaborador_cpf text not null,
  disponibilidade_marcado boolean not null default false,
  disponibilidade_obs text,
  estadia_necessaria boolean not null default false,
  estadia_local text,
  estadia_checkin date,
  estadia_checkout date,
  estadia_obs text,
  alimentacao_necessaria boolean not null default false,
  alimentacao_tipo text,
  alimentacao_obs text,
  deslocamento_necessario boolean not null default false,
  deslocamento_origem text,
  deslocamento_destino text,
  deslocamento_tipo text,
  deslocamento_obs text,
  extras_necessario boolean not null default false,
  extras_tipo text,
  extras_obs text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contexto_id, colaborador_cpf)
);

create index if not exists idx_programacao_contextos_data_sup
  on public.programacao_contextos (data_referencia desc, supervisao);
create index if not exists idx_programacao_itens_contexto
  on public.programacao_itens (contexto_id);
create index if not exists idx_programacao_itens_cpf
  on public.programacao_itens (colaborador_cpf);

create or replace function public.touch_programacao_itens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_programacao_itens_updated_at on public.programacao_itens;
create trigger trg_programacao_itens_updated_at
before update on public.programacao_itens
for each row execute procedure public.touch_programacao_itens_updated_at();

alter table public.programacao_contextos enable row level security;
alter table public.programacao_itens enable row level security;

drop policy if exists "authenticated read programacao_contextos" on public.programacao_contextos;
create policy "authenticated read programacao_contextos" on public.programacao_contextos
for select to authenticated using (true);

drop policy if exists "authenticated insert programacao_contextos" on public.programacao_contextos;
create policy "authenticated insert programacao_contextos" on public.programacao_contextos
for insert to authenticated with check (auth.uid() = created_by or created_by is null);

drop policy if exists "authenticated update programacao_contextos" on public.programacao_contextos;
create policy "authenticated update programacao_contextos" on public.programacao_contextos
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated read programacao_itens" on public.programacao_itens;
create policy "authenticated read programacao_itens" on public.programacao_itens
for select to authenticated using (true);

drop policy if exists "authenticated insert programacao_itens" on public.programacao_itens;
create policy "authenticated insert programacao_itens" on public.programacao_itens
for insert to authenticated with check (true);

drop policy if exists "authenticated update programacao_itens" on public.programacao_itens;
create policy "authenticated update programacao_itens" on public.programacao_itens
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete programacao_itens" on public.programacao_itens;
create policy "authenticated delete programacao_itens" on public.programacao_itens
for delete to authenticated using (true);

-- ---------------------------------------------------------
-- MÓDULOS DE GESTOR
-- ---------------------------------------------------------

create table if not exists public.hospedagem_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  data_solicitacao date not null,
  colaborador text,
  cidade text,
  checkin date,
  checkout date,
  hotel_sugerido text,
  status text not null default 'aberto',
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.compras_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  data_solicitacao date not null,
  solicitante text,
  item text,
  quantidade numeric(14,2),
  prioridade text default 'normal',
  status text not null default 'aberto',
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.logistica_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  data_solicitacao date not null,
  colaborador text,
  origem text,
  destino text,
  tipo_deslocamento text,
  status text not null default 'aberto',
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.patrimonio_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  data_solicitacao date not null,
  colaborador text,
  item text,
  acao text,
  patrimonio_tag text,
  status text not null default 'aberto',
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.contato_cliente_registros (
  id uuid primary key default gen_random_uuid(),
  data_contato date not null,
  cliente text,
  contato text,
  assunto text,
  retorno_previsto date,
  status text not null default 'aberto',
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hospedagem_solicitacoes_data on public.hospedagem_solicitacoes (data_solicitacao desc);
create index if not exists idx_compras_solicitacoes_data on public.compras_solicitacoes (data_solicitacao desc);
create index if not exists idx_logistica_solicitacoes_data on public.logistica_solicitacoes (data_solicitacao desc);
create index if not exists idx_patrimonio_solicitacoes_data on public.patrimonio_solicitacoes (data_solicitacao desc);
create index if not exists idx_contato_cliente_data on public.contato_cliente_registros (data_contato desc);

alter table public.hospedagem_solicitacoes enable row level security;
alter table public.compras_solicitacoes enable row level security;
alter table public.logistica_solicitacoes enable row level security;
alter table public.patrimonio_solicitacoes enable row level security;
alter table public.contato_cliente_registros enable row level security;

drop policy if exists "authenticated read hospedagem_solicitacoes" on public.hospedagem_solicitacoes;
create policy "authenticated read hospedagem_solicitacoes" on public.hospedagem_solicitacoes
for select to authenticated using (true);
drop policy if exists "authenticated insert hospedagem_solicitacoes" on public.hospedagem_solicitacoes;
create policy "authenticated insert hospedagem_solicitacoes" on public.hospedagem_solicitacoes
for insert to authenticated with check (auth.uid() = created_by or created_by is null);
drop policy if exists "authenticated update hospedagem_solicitacoes" on public.hospedagem_solicitacoes;
create policy "authenticated update hospedagem_solicitacoes" on public.hospedagem_solicitacoes
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete hospedagem_solicitacoes" on public.hospedagem_solicitacoes;
create policy "authenticated delete hospedagem_solicitacoes" on public.hospedagem_solicitacoes
for delete to authenticated using (true);

drop policy if exists "authenticated read compras_solicitacoes" on public.compras_solicitacoes;
create policy "authenticated read compras_solicitacoes" on public.compras_solicitacoes
for select to authenticated using (true);
drop policy if exists "authenticated insert compras_solicitacoes" on public.compras_solicitacoes;
create policy "authenticated insert compras_solicitacoes" on public.compras_solicitacoes
for insert to authenticated with check (auth.uid() = created_by or created_by is null);
drop policy if exists "authenticated update compras_solicitacoes" on public.compras_solicitacoes;
create policy "authenticated update compras_solicitacoes" on public.compras_solicitacoes
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete compras_solicitacoes" on public.compras_solicitacoes;
create policy "authenticated delete compras_solicitacoes" on public.compras_solicitacoes
for delete to authenticated using (true);

drop policy if exists "authenticated read logistica_solicitacoes" on public.logistica_solicitacoes;
create policy "authenticated read logistica_solicitacoes" on public.logistica_solicitacoes
for select to authenticated using (true);
drop policy if exists "authenticated insert logistica_solicitacoes" on public.logistica_solicitacoes;
create policy "authenticated insert logistica_solicitacoes" on public.logistica_solicitacoes
for insert to authenticated with check (auth.uid() = created_by or created_by is null);
drop policy if exists "authenticated update logistica_solicitacoes" on public.logistica_solicitacoes;
create policy "authenticated update logistica_solicitacoes" on public.logistica_solicitacoes
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete logistica_solicitacoes" on public.logistica_solicitacoes;
create policy "authenticated delete logistica_solicitacoes" on public.logistica_solicitacoes
for delete to authenticated using (true);

drop policy if exists "authenticated read patrimonio_solicitacoes" on public.patrimonio_solicitacoes;
create policy "authenticated read patrimonio_solicitacoes" on public.patrimonio_solicitacoes
for select to authenticated using (true);
drop policy if exists "authenticated insert patrimonio_solicitacoes" on public.patrimonio_solicitacoes;
create policy "authenticated insert patrimonio_solicitacoes" on public.patrimonio_solicitacoes
for insert to authenticated with check (auth.uid() = created_by or created_by is null);
drop policy if exists "authenticated update patrimonio_solicitacoes" on public.patrimonio_solicitacoes;
create policy "authenticated update patrimonio_solicitacoes" on public.patrimonio_solicitacoes
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete patrimonio_solicitacoes" on public.patrimonio_solicitacoes;
create policy "authenticated delete patrimonio_solicitacoes" on public.patrimonio_solicitacoes
for delete to authenticated using (true);

drop policy if exists "authenticated read contato_cliente_registros" on public.contato_cliente_registros;
create policy "authenticated read contato_cliente_registros" on public.contato_cliente_registros
for select to authenticated using (true);
drop policy if exists "authenticated insert contato_cliente_registros" on public.contato_cliente_registros;
create policy "authenticated insert contato_cliente_registros" on public.contato_cliente_registros
for insert to authenticated with check (auth.uid() = created_by or created_by is null);
drop policy if exists "authenticated update contato_cliente_registros" on public.contato_cliente_registros;
create policy "authenticated update contato_cliente_registros" on public.contato_cliente_registros
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete contato_cliente_registros" on public.contato_cliente_registros;
create policy "authenticated delete contato_cliente_registros" on public.contato_cliente_registros
for delete to authenticated using (true);

-- ---------------------------------------------------------
-- PERMISSÕES DE MÓDULO
-- ---------------------------------------------------------

insert into public.modules (code, name) values
  ('PROGRAMACAO', 'Programação'),
  ('HOSPEDAGEM', 'Hospedagem'),
  ('COMPRAS', 'Compras'),
  ('LOGISTICA', 'Logística'),
  ('PATRIMONIOS', 'Patrimônios'),
  ('CONTATO_CLIENTE', 'Contato Cliente')
on conflict (code) do update set name = excluded.name;
