-- Trilha de posições (breadcrumb) — ao contrário de frotas_posicoes (upsert, 1 linha
-- por veículo, sempre sobrescrita), esta tabela é append-only: cada sincronização
-- grava uma linha nova por veículo, reconstruindo o trajeto realizado ao longo do dia
-- pro Mapa Operacional comparar com a rota estimada (operacional_mapa_rotas).
create table if not exists public.frotas_posicoes_historico (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  veiculo_id uuid,
  latitude numeric,
  longitude numeric,
  velocidade_kmh numeric,
  motorista text,
  reportado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_frotas_posicoes_historico_placa_data on public.frotas_posicoes_historico (placa, reportado_em);
create index if not exists idx_frotas_posicoes_historico_reportado on public.frotas_posicoes_historico (reportado_em);

comment on table public.frotas_posicoes_historico is 'Trilha de posições da BFleet (breadcrumb, append-only) — reconstrói a rota REALIZADA de cada veículo pro Mapa Operacional comparar com a rota ESTIMADA (operacional_mapa_rotas). Gravada por bfleet-posicoes a cada sincronização; retenção de ~7 dias.';

alter table public.frotas_posicoes_historico enable row level security;

drop policy if exists "posicoes_historico_select_auth" on public.frotas_posicoes_historico;
create policy "posicoes_historico_select_auth" on public.frotas_posicoes_historico for select to authenticated using (true);
drop policy if exists "posicoes_historico_write_auth" on public.frotas_posicoes_historico;
create policy "posicoes_historico_write_auth" on public.frotas_posicoes_historico for all to authenticated using (true) with check (true);;
