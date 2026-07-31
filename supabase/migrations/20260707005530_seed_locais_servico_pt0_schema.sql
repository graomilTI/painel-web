create table if not exists public.operacional_pontos_embarque (
  id uuid primary key default gen_random_uuid(),
  tipo_local text,
  nome_local text not null,
  uf text not null,
  cidade text not null,
  latitude numeric,
  longitude numeric,
  supervisao text,
  coordenacao text,
  origem text not null default 'seed_locais_servico',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operacional_pontos_embarque
  add column if not exists embarque_label text generated always as
    (coalesce(uf, '') || ' - ' || coalesce(cidade, '') || ' (' || coalesce(nome_local, '') || ')') stored;

create unique index if not exists operacional_pontos_embarque_unico
  on public.operacional_pontos_embarque (nome_local, cidade, uf);

create index if not exists idx_operacional_pontos_embarque_ativo
  on public.operacional_pontos_embarque (ativo);

create index if not exists idx_operacional_pontos_embarque_cidade_uf
  on public.operacional_pontos_embarque (cidade, uf);

create index if not exists idx_operacional_pontos_embarque_coordenacao
  on public.operacional_pontos_embarque (coordenacao);

create index if not exists idx_operacional_pontos_embarque_supervisao
  on public.operacional_pontos_embarque (supervisao);

create unique index if not exists operacional_pontos_embarque_uf_cidade_local_uidx
  on public.operacional_pontos_embarque (upper(btrim(uf)), upper(btrim(cidade)), upper(btrim(nome_local)))
  where (ativo = true);
;
