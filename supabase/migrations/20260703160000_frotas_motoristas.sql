-- Frotas · Motoristas: cadastro com os dados que o BFleet exige pra registrar um condutor
-- (createDriver/updateDriver da API Service24GPS: nombre, telefono, licencia, vigencia,
-- direccion, email) — hoje esse dado não existe em nenhuma tabela do painel, o que bloqueia
-- o cadastro em lote de condutores no BFleet (ver [[painel-web-bfleet-motorista-auto]]).
create table if not exists public.frotas_motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  telefone text,
  email text,
  cnh_numero text,
  cnh_validade date,
  endereco text,
  status text not null default 'ATIVO',
  origem text not null default 'manual',
  colaborador_nome text,
  bfleet_conductor_id text,
  bfleet_sync_status text,
  bfleet_sync_erro text,
  bfleet_ultima_sync_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_frotas_motoristas_nome on public.frotas_motoristas (nome);
create index if not exists idx_frotas_motoristas_cpf on public.frotas_motoristas (cpf);
create index if not exists idx_frotas_motoristas_status on public.frotas_motoristas (status);
alter table public.frotas_motoristas enable row level security;
-- Mesmo padrão simples já usado de verdade em frotas_veiculos neste projeto (select livre pra
-- autenticados, escrita exige sessão) — painel_has_module não existe aqui, só no repo local.
drop policy if exists frotas_motoristas_select_auth on public.frotas_motoristas;
create policy frotas_motoristas_select_auth on public.frotas_motoristas
  for select to authenticated
  using (true);
drop policy if exists frotas_motoristas_insert_auth on public.frotas_motoristas;
create policy frotas_motoristas_insert_auth on public.frotas_motoristas
  for insert to authenticated
  with check (( select auth.uid() ) is not null);
drop policy if exists frotas_motoristas_update_auth on public.frotas_motoristas;
create policy frotas_motoristas_update_auth on public.frotas_motoristas
  for update to authenticated
  using (( select auth.uid() ) is not null);
drop policy if exists frotas_motoristas_delete_auth on public.frotas_motoristas;
create policy frotas_motoristas_delete_auth on public.frotas_motoristas
  for delete to authenticated
  using (( select auth.uid() ) is not null);
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values ('frotas_motoristas', 'Motoristas', 'FROTAS', 'frotas-motoristas', 67, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  rota = excluded.rota,
  ativo = true,
  updated_at = now();
insert into public.modules (code, name, area, active)
values ('frotas_motoristas', 'Motoristas', 'FROTAS', true)
on conflict (code) do update set
  name = excluded.name,
  area = excluded.area,
  active = true;
