create extension if not exists pgcrypto;
create table if not exists public.propostas_gestores_regionais (
  id uuid primary key default gen_random_uuid(),
  regional text not null,
  supervisor text not null,
  contato text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint propostas_gestores_regionais_unique unique (regional, supervisor, contato)
);
create index if not exists propostas_gestores_regionais_ativo_ordem_idx
  on public.propostas_gestores_regionais (ativo, ordem, regional);
alter table public.propostas_gestores_regionais enable row level security;
drop policy if exists propostas_gestores_regionais_select on public.propostas_gestores_regionais;
drop policy if exists propostas_gestores_regionais_insert on public.propostas_gestores_regionais;
drop policy if exists propostas_gestores_regionais_update on public.propostas_gestores_regionais;
drop policy if exists propostas_gestores_regionais_delete on public.propostas_gestores_regionais;
create policy propostas_gestores_regionais_select
  on public.propostas_gestores_regionais
  for select
  to authenticated
  using (true);
create policy propostas_gestores_regionais_insert
  on public.propostas_gestores_regionais
  for insert
  to authenticated
  with check (true);
create policy propostas_gestores_regionais_update
  on public.propostas_gestores_regionais
  for update
  to authenticated
  using (true)
  with check (true);
create policy propostas_gestores_regionais_delete
  on public.propostas_gestores_regionais
  for delete
  to authenticated
  using (true);
insert into public.propostas_gestores_regionais (ordem, regional, supervisor, contato, ativo) values
  (10, 'BAHIA', 'DOUGLAS CANDIDO', '(77) 9 9999-3585', true),
  (20, 'GOIAS', 'DILSON REBAU', '(64) 9 9344-0641', true),
  (30, 'GOIAS', 'SIDNEI RIBEIRO', '(64) 9 9223-3113', true),
  (40, 'MARANHÃO', 'MANUEL DE JESUS', '(99) 9 8848-6088', true),
  (50, 'MATO GROSSO DO SUL', 'SAMUEL SANTA CRUZ', '(67) 9 9119-4786', true),
  (60, 'MATO GROSSO DO SUL', 'CECILIA KAROLAYNE', '(66) 9 8437-4326', true),
  (70, 'MINAS GERAIS', 'RICARDO ARAÚJO', '(34) 9 9729-7489', true),
  (80, 'MT1 - SINOP', 'MARCO AUGUSTO', '(66) 9 9714-3354', true),
  (90, 'MT2 - RONDONOPOLIS/PRIMAVERA DO LESTE', 'JEAN PABLO', '(66) 9 9607-6403', true),
  (100, 'MT3 - CONFRESA', 'VANUZA PEREIRA', '(66) 9 8457-8435', true),
  (110, 'MT3 - QUERENCIA', 'VANUZA PEREIRA', '(66) 9 8457-8435', true),
  (120, 'MT4 - CAMPO NOVO DO PARECIS', 'CLEUTON ALBERNAZ', '(66) 9 9690-9921', true),
  (130, 'PARA', 'JADSON SARAVA', '(63) 9 9216-7795', true),
  (140, 'PARAGUAI', 'ANDERSON DO CARMO', '(44) 9 9829-3822', true),
  (150, 'PR - PONTA GROSSA E REGIÃO', 'MICHAEL RIBAS', '(42) 9 9834-4303', true),
  (160, 'PR - CASCAVEL', 'ANDERSON DO CARMO', '(44) 9 9829-3822', true),
  (170, 'PR - LONDRINA', 'MICHAEL GONÇALVES', '(43) 9 9182-6733', true),
  (180, 'PR - MARINGÁ E TERMINAIS FERROVIÁRIOS', 'JOSÉ BOA VENTURA', '(44) 9 9836-1000', true),
  (190, 'RIO GRANDE DO SUL', 'DILMAR THOMET', '(54) 9 9674-3775', true),
  (200, 'SÃO PAULO', 'MAYCKON INOUE', '(43) 9 9604-1000', true),
  (210, 'TOCANTINS', 'KAIRO LEITE', '(63) 9 9120-1087', true)
on conflict (regional, supervisor, contato) do update set
  ordem = excluded.ordem,
  ativo = true,
  updated_at = now();
