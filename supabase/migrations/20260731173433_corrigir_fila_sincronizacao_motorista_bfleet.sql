-- Garante o elo entre a leitura de patrimônios e a Edge Function que associa
-- o condutor ao veículo no BFleet. A função
-- sincronizar_frotas_veiculos_patrimonios() atualiza motorista_atual; este
-- trigger transforma cada mudança em um item idempotente da fila.

alter table public.frotas_veiculos
  add column if not exists bfleet_condutor_status text,
  add column if not exists bfleet_condutor_erro text,
  add column if not exists bfleet_condutor_atualizado_em timestamptz;
create table if not exists public.frotas_bfleet_condutores_fila (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  placa text not null,
  motorista_atual text not null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'OK', 'ERRO')),
  tentativas integer not null default 0 check (tentativas >= 0),
  erro text,
  atualizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frotas_bfleet_condutores_fila_veiculo_key unique (veiculo_id)
);
create index if not exists idx_frotas_bfleet_condutores_fila_pendentes
  on public.frotas_bfleet_condutores_fila (tentativas, created_at)
  where status = 'PENDENTE';
-- Instalações antigas criaram a fila sem unicidade. Mantém o item mais
-- recentemente alterado de cada veículo antes de tornar o upsert idempotente.
delete from public.frotas_bfleet_condutores_fila q
where q.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by veiculo_id
        order by updated_at desc nulls last, created_at desc nulls last, id desc
      ) as ordem
    from public.frotas_bfleet_condutores_fila
  ) duplicados
  where ordem > 1
);
create unique index if not exists idx_frotas_bfleet_condutores_fila_veiculo
  on public.frotas_bfleet_condutores_fila (veiculo_id);
alter table public.frotas_bfleet_condutores_fila enable row level security;
-- A fila é interna: somente service_role (Edge Function/worker) deve lê-la
-- ou alterá-la. RLS permanece sem policies para clientes anon/authenticated.
revoke all on table public.frotas_bfleet_condutores_fila from anon, authenticated;
grant select, insert, update, delete on table public.frotas_bfleet_condutores_fila to service_role;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.enqueue_bfleet_condutor_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Leitura sem funcionário não deve apagar uma associação válida no BFleet.
  if nullif(btrim(new.motorista_atual), '') is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.motorista_atual is not distinct from new.motorista_atual then
    return new;
  end if;

  insert into public.frotas_bfleet_condutores_fila (
    veiculo_id,
    placa,
    motorista_atual,
    status,
    tentativas,
    erro,
    atualizado_em,
    created_at,
    updated_at
  ) values (
    new.id,
    new.placa,
    btrim(new.motorista_atual),
    'PENDENTE',
    0,
    null,
    null,
    now(),
    now()
  )
  on conflict (veiculo_id) do update
    set placa = excluded.placa,
        motorista_atual = excluded.motorista_atual,
        status = 'PENDENTE',
        tentativas = 0,
        erro = null,
        atualizado_em = null,
        updated_at = now();

  update public.frotas_veiculos
     set bfleet_condutor_status = 'PENDENTE',
         bfleet_condutor_erro = null
   where id = new.id;

  return new;
end;
$$;
revoke all on function private.enqueue_bfleet_condutor_update() from public, anon, authenticated;
drop trigger if exists trg_enqueue_bfleet_condutor_update on public.frotas_veiculos;
create trigger trg_enqueue_bfleet_condutor_update
after insert or update of motorista_atual on public.frotas_veiculos
for each row
execute function private.enqueue_bfleet_condutor_update();
-- Reprocessa o estado atual para corrigir associações que ficaram sem fila
-- antes desta migração. O ON CONFLICT evita duplicidade por veículo.
insert into public.frotas_bfleet_condutores_fila (
  veiculo_id,
  placa,
  motorista_atual,
  status,
  tentativas,
  erro,
  atualizado_em,
  created_at,
  updated_at
)
select
  v.id,
  v.placa,
  btrim(v.motorista_atual),
  'PENDENTE',
  0,
  null,
  null,
  now(),
  now()
from public.frotas_veiculos v
where nullif(btrim(v.motorista_atual), '') is not null
on conflict (veiculo_id) do update
  set placa = excluded.placa,
      motorista_atual = excluded.motorista_atual,
      status = 'PENDENTE',
      tentativas = 0,
      erro = null,
      atualizado_em = null,
      updated_at = now();
