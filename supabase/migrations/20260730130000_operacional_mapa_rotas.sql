-- Rotas calculadas pro Mapa Operacional (Operacional > Mapa), disparadas
-- quando o Gestor clica "Salvar programação". tipo=frota usa VROOM
-- multi-veículo (frotas_veiculos/frotas_posicoes); tipo=reembolso_km é rota
-- individual ponto-a-ponto de colaborador com carro próprio
-- (programacao_deslocamento.tipo_deslocamento=REEMBOLSO KM). Separada de
-- frotas_rotas (que é dono de outro fluxo, Frotas > Roteirização).
create table if not exists public.operacional_mapa_rotas (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid,
  supervisao text not null,
  data_referencia date not null,
  tipo text not null check (tipo in ('frota','reembolso_km')),
  veiculo_id uuid,
  placa text,
  motorista_nome text,
  colaborador_nome text,
  colaborador_cpf text,
  origem_latitude numeric,
  origem_longitude numeric,
  origem_tipo text check (origem_tipo in ('casa','hotel','alojamento') or origem_tipo is null),
  km_total_estimado numeric not null default 0,
  duracao_estimada_min numeric not null default 0,
  geometria jsonb,
  gerado_em timestamptz not null default now(),
  gerado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_operacional_mapa_rotas_sup_data on public.operacional_mapa_rotas (supervisao, data_referencia);
create index if not exists idx_operacional_mapa_rotas_data on public.operacional_mapa_rotas (data_referencia);
create index if not exists idx_operacional_mapa_rotas_programacao on public.operacional_mapa_rotas (programacao_id);
comment on table public.operacional_mapa_rotas is 'Rotas calculadas pro Mapa Operacional (Operacional > Mapa), disparadas quando o Gestor clica Salvar programação. tipo=frota usa VROOM multi-veículo (frotas_veiculos/frotas_posicoes); tipo=reembolso_km é rota individual ponto-a-ponto de colaborador com carro próprio (programacao_deslocamento.tipo_deslocamento=REEMBOLSO KM). Separada de frotas_rotas (que é dono de outro fluxo, Frotas > Roteirização).';
create table if not exists public.operacional_mapa_rotas_paradas (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.operacional_mapa_rotas(id) on delete cascade,
  ordem int not null,
  tipo text not null check (tipo in ('colaborador','embarque')),
  os_id uuid,
  colaborador_nome text,
  ponto_nome text,
  embarque_texto text,
  latitude numeric,
  longitude numeric,
  distancia_km_trecho numeric,
  duracao_min_trecho numeric
);
create index if not exists idx_operacional_mapa_rotas_paradas_rota on public.operacional_mapa_rotas_paradas (rota_id);
alter table public.operacional_mapa_rotas enable row level security;
alter table public.operacional_mapa_rotas_paradas enable row level security;
drop policy if exists "mapa_rotas_select_auth" on public.operacional_mapa_rotas;
create policy "mapa_rotas_select_auth" on public.operacional_mapa_rotas for select to authenticated using (true);
drop policy if exists "mapa_rotas_write_auth" on public.operacional_mapa_rotas;
create policy "mapa_rotas_write_auth" on public.operacional_mapa_rotas for all to authenticated using (true) with check (true);
drop policy if exists "mapa_rotas_paradas_select_auth" on public.operacional_mapa_rotas_paradas;
create policy "mapa_rotas_paradas_select_auth" on public.operacional_mapa_rotas_paradas for select to authenticated using (true);
drop policy if exists "mapa_rotas_paradas_write_auth" on public.operacional_mapa_rotas_paradas;
create policy "mapa_rotas_paradas_write_auth" on public.operacional_mapa_rotas_paradas for all to authenticated using (true) with check (true);
