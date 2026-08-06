alter table public.operacional_colaborador_base
  add column if not exists bfleet_lugar_id text,
  add column if not exists bfleet_lugar_nome text,
  add column if not exists bfleet_lugar_hash text,
  add column if not exists bfleet_lugar_sync_status text,
  add column if not exists bfleet_lugar_sync_error text,
  add column if not exists bfleet_lugar_sync_em timestamptz,
  add column if not exists bfleet_lugar_payload jsonb;
create index if not exists idx_operacional_colaborador_base_bfleet_lugar_id
  on public.operacional_colaborador_base (bfleet_lugar_id)
  where bfleet_lugar_id is not null;
create index if not exists idx_operacional_colaborador_base_bfleet_sync_status
  on public.operacional_colaborador_base (bfleet_lugar_sync_status);
