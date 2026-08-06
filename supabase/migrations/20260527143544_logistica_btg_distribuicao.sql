
create table if not exists public.logistica_btg_distribuicao (
  id bigserial primary key,
  numero_os text,
  colaborador text,
  supervisao text,
  lote numeric default 0,
  remanescente numeric default 0,
  updated_at timestamptz default now()
);
create index if not exists idx_logistica_btg_distribuicao_os on public.logistica_btg_distribuicao (numero_os);
alter table public.logistica_btg_distribuicao enable row level security;
do $$ begin create policy "btg_distribuicao_select" on public.logistica_btg_distribuicao for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "btg_distribuicao_insert" on public.logistica_btg_distribuicao for insert to authenticated with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "btg_distribuicao_update" on public.logistica_btg_distribuicao for update to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "btg_distribuicao_delete" on public.logistica_btg_distribuicao for delete to authenticated using (true); exception when duplicate_object then null; end $$;
;
