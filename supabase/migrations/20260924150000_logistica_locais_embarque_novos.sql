-- Novos locais de embarque solicitados na abertura de O.S. (Gestor > Logística > Abrir OS) quando o
-- local não existe no cadastro do GRM (grm_locais_servico). O usuário escolhe UF/cidade, marca o ponto
-- no mapa e a solicitação segue como "local novo"; a Logística cadastra o local no GRM. Quando o
-- agente espelhar o local com spl_code, a linha pode ser marcada como CADASTRADO.
create table if not exists public.logistica_locais_embarque_novos (
  id uuid primary key default gen_random_uuid(),
  nome_local text not null,
  uf text not null,
  cidade text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  solicitante_id uuid,
  solicitante_nome text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CADASTRADO', 'RECUSADO')),
  spl_code integer,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists logistica_locais_embarque_novos_status_idx
  on public.logistica_locais_embarque_novos (status, created_at desc);
create index if not exists logistica_locais_embarque_novos_coord_idx
  on public.logistica_locais_embarque_novos (latitude, longitude)
  where status = 'PENDENTE';

alter table public.logistica_locais_embarque_novos enable row level security;
drop policy if exists logistica_locais_embarque_novos_authenticated_all on public.logistica_locais_embarque_novos;
create policy logistica_locais_embarque_novos_authenticated_all
  on public.logistica_locais_embarque_novos for all to authenticated using (true) with check (true);

-- Busca de locais próximos (raio de 2 km) por caixa de coordenadas.
create index if not exists grm_locais_servico_coord_idx
  on public.grm_locais_servico (latitude, longitude)
  where ativo and latitude is not null and longitude is not null;
