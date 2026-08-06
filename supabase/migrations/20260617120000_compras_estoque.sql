-- Estoque do módulo Compras
-- Controle de materiais internos, movimentações, inventário e configurações.

create extension if not exists pgcrypto;
create table if not exists public.compras_estoque_materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'Outros',
  tamanho text,
  codigo_interno text,
  unidade text not null default 'UN',
  estoque_atual numeric(12,2) not null default 0,
  estoque_minimo numeric(12,2) not null default 0,
  estoque_maximo numeric(12,2) not null default 0,
  local_armazenamento text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.compras_estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.compras_estoque_materiais(id) on delete restrict,
  tipo_movimentacao text not null check (tipo_movimentacao in ('entrada','saida','ajuste','transferencia')),
  quantidade numeric(12,2) not null check (quantidade >= 0),
  data_movimentacao date not null default current_date,
  fornecedor text,
  valor_unitario numeric(12,2),
  numero_nf text,
  destino text,
  colaborador_id text,
  colaborador_nome text,
  coordenacao text,
  supervisao text,
  motivo text,
  observacao text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);
create table if not exists public.compras_estoque_inventarios (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.compras_estoque_materiais(id) on delete restrict,
  estoque_sistema numeric(12,2) not null default 0,
  estoque_contado numeric(12,2) not null default 0,
  diferenca numeric(12,2) not null default 0,
  motivo_ajuste text not null,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);
create table if not exists public.compras_estoque_config (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tipo, nome)
);
create index if not exists idx_compras_estoque_materiais_categoria on public.compras_estoque_materiais(categoria);
create index if not exists idx_compras_estoque_materiais_status on public.compras_estoque_materiais(ativo, estoque_atual, estoque_minimo);
create index if not exists idx_compras_estoque_mov_material on public.compras_estoque_movimentacoes(material_id);
create index if not exists idx_compras_estoque_mov_data on public.compras_estoque_movimentacoes(data_movimentacao desc);
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_compras_estoque_materiais_updated_at on public.compras_estoque_materiais;
create trigger trg_compras_estoque_materiais_updated_at
before update on public.compras_estoque_materiais
for each row execute function public.set_updated_at();
insert into public.compras_estoque_config (tipo, nome) values
  ('categoria','Uniformes'),('categoria','Escritório'),('categoria','Brindes'),('categoria','Equipamentos'),('categoria','Classificação'),('categoria','TI'),('categoria','Outros'),
  ('unidade','UN'),('unidade','CX'),('unidade','PCT'),('unidade','KG'),('unidade','M'),('unidade','RL'),
  ('local','Almoxarifado'),('local','Matriz'),('local','Sala Técnica'),('local','Escritório'),('local','Veículo'),('local','Operação'),
  ('motivo_saida','Entrega ao colaborador'),('motivo_saida','Reposição'),('motivo_saida','Uso operacional'),('motivo_saida','Perda'),('motivo_saida','Descarte'),('motivo_saida','Transferência'),('motivo_saida','Manutenção')
on conflict (tipo, nome) do nothing;
alter table public.compras_estoque_materiais enable row level security;
alter table public.compras_estoque_movimentacoes enable row level security;
alter table public.compras_estoque_inventarios enable row level security;
alter table public.compras_estoque_config enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_materiais' and policyname='compras_estoque_materiais_auth_all') then
    create policy compras_estoque_materiais_auth_all on public.compras_estoque_materiais for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_movimentacoes' and policyname='compras_estoque_movimentacoes_auth_all') then
    create policy compras_estoque_movimentacoes_auth_all on public.compras_estoque_movimentacoes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_inventarios' and policyname='compras_estoque_inventarios_auth_all') then
    create policy compras_estoque_inventarios_auth_all on public.compras_estoque_inventarios for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_config' and policyname='compras_estoque_config_auth_all') then
    create policy compras_estoque_config_auth_all on public.compras_estoque_config for all to authenticated using (true) with check (true);
  end if;
end $$;
