-- Frotas · Rastreadores: controle de instalação de rastreadores por veículo
create table if not exists public.frotas_rastreadores (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  placa text not null unique,
  estado text,
  cidade text,
  local_instalacao text,
  imei text,
  data_envio date,
  previsao_chegada date,
  cod_rastreio text,
  status text not null default 'sem_rastreador' check (status in ('sem_rastreador','em_andamento','concluido')),
  data_instalacao date,
  nao_atendido boolean not null default false,
  contato text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_frotas_rastreadores_placa   on public.frotas_rastreadores (placa);
create index if not exists idx_frotas_rastreadores_status  on public.frotas_rastreadores (status);
create index if not exists idx_frotas_rastreadores_veiculo on public.frotas_rastreadores (veiculo_id);

-- Trigger para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_frotas_rastreadores_updated on public.frotas_rastreadores;
create trigger trg_frotas_rastreadores_updated
  before update on public.frotas_rastreadores
  for each row execute function public.set_updated_at();

-- Registrar módulo no sistema
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values ('frotas_rastreadores', 'Rastreadores', 'FROTAS', 'frotas-rastreadores', 65, true)
on conflict (codigo) do nothing;

insert into public.modules (code, name, area, active)
values ('frotas_rastreadores', 'Rastreadores', 'FROTAS', true)
on conflict (code) do update set
  name = excluded.name,
  area = excluded.area,
  active = true;
