-- Frotas · Roteirização & Mapa ao Vivo
-- Posições em tempo real (BFleet/Service24GPS) + rotas diárias sugeridas/publicadas

-- 1) Posições em tempo real (1 linha por placa, sobrescrita a cada sincronização)
create table if not exists public.frotas_posicoes (
  placa text primary key,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  idgps text,
  latitude numeric,
  longitude numeric,
  velocidade_kmh numeric,
  direcao numeric,
  ignicao boolean,
  endereco text,
  motorista text,
  sinal text,
  reportado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_frotas_posicoes_veiculo on public.frotas_posicoes (veiculo_id);
alter table public.frotas_posicoes enable row level security;
drop policy if exists frotas_posicoes_auth_all on public.frotas_posicoes;
create policy frotas_posicoes_auth_all on public.frotas_posicoes
  for all to authenticated using (true) with check (true);
-- 2) Rotas diárias sugeridas/publicadas (uma por veículo/dia)
create table if not exists public.frotas_rotas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  placa text not null,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  motorista text,
  status text not null default 'planejada' check (status in ('planejada','publicada','concluida','cancelada')),
  origem_latitude numeric,
  origem_longitude numeric,
  km_total_estimado numeric,
  duracao_estimada_min numeric,
  qtd_paradas integer not null default 0,
  geometria jsonb,
  criado_por uuid references auth.users(id),
  publicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_frotas_rotas_data_placa on public.frotas_rotas (data, placa);
alter table public.frotas_rotas enable row level security;
drop policy if exists frotas_rotas_auth_all on public.frotas_rotas;
create policy frotas_rotas_auth_all on public.frotas_rotas
  for all to authenticated using (true) with check (true);
drop trigger if exists trg_frotas_rotas_updated on public.frotas_rotas;
create trigger trg_frotas_rotas_updated
  before update on public.frotas_rotas
  for each row execute function public.set_updated_at();
-- 3) Paradas de cada rota, em ordem
create table if not exists public.frotas_rotas_paradas (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.frotas_rotas(id) on delete cascade,
  os_id uuid references public.operacional_os(id) on delete set null,
  ordem integer not null,
  ponto_nome text,
  embarque_texto text,
  latitude numeric not null,
  longitude numeric not null,
  distancia_km_trecho numeric,
  duracao_min_trecho numeric,
  status text not null default 'pendente' check (status in ('pendente','concluido','pulado')),
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_frotas_rotas_paradas_rota on public.frotas_rotas_paradas (rota_id);
create index if not exists idx_frotas_rotas_paradas_os   on public.frotas_rotas_paradas (os_id);
alter table public.frotas_rotas_paradas enable row level security;
drop policy if exists frotas_rotas_paradas_auth_all on public.frotas_rotas_paradas;
create policy frotas_rotas_paradas_auth_all on public.frotas_rotas_paradas
  for all to authenticated using (true) with check (true);
-- 4) Registrar módulo no sistema
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values ('frotas_roteirizacao', 'Roteirização & Mapa ao Vivo', 'FROTAS', 'frotas-roteirizacao', 66, true)
on conflict (codigo) do nothing;
insert into public.modules (code, name, area, active)
values ('frotas_roteirizacao', 'Roteirização & Mapa ao Vivo', 'FROTAS', true)
on conflict (code) do update set
  name = excluded.name,
  area = excluded.area,
  active = true;
