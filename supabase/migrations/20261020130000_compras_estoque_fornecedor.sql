-- Estoque que está no fornecedor (aba "Fornecedor" em Compras > Estoque).
-- Controle separado do estoque próprio: não mexe em compras_estoque_materiais.estoque_atual.

create table if not exists public.compras_estoque_fornecedor (
  id uuid primary key default gen_random_uuid(),
  fornecedor text not null,
  material text not null,
  tamanho text,
  unidade text not null default 'UN',
  quantidade numeric(12,2) not null default 0 check (quantidade >= 0),
  valor_unitario numeric(12,2),
  observacao text,
  ativo boolean not null default true,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compras_estoque_fornecedor_ativo on public.compras_estoque_fornecedor(ativo, fornecedor);

drop trigger if exists trg_compras_estoque_fornecedor_updated_at on public.compras_estoque_fornecedor;
create trigger trg_compras_estoque_fornecedor_updated_at
before update on public.compras_estoque_fornecedor
for each row execute function public.set_updated_at();

alter table public.compras_estoque_fornecedor enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_fornecedor' and policyname='compras_estoque_fornecedor_auth_all') then
    create policy compras_estoque_fornecedor_auth_all on public.compras_estoque_fornecedor for all to authenticated using (true) with check (true);
  end if;
end $$;
