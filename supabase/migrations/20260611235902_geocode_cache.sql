-- Cache de geocodificação (CEP -> lat/lng) para a roteirização de colaboradores
-- e marcação de tipo de parada (colaborador vs ponto de embarque) em frotas_rotas_paradas.

create table if not exists public.geocode_cache (
  chave text primary key,
  tipo text not null check (tipo in ('cep','cidade')),
  latitude numeric,
  longitude numeric,
  endereco_resolvido text,
  status text not null default 'ok' check (status in ('ok','erro')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.geocode_cache enable row level security;

alter table public.frotas_rotas_paradas
  add column if not exists tipo text not null default 'embarque' check (tipo in ('colaborador','embarque')),
  add column if not exists colaborador_nome text;
