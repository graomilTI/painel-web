-- Frotas · Rastreadores: fluxo de manutenção (botão "!" na placa).
-- Etapas: disponibilidade com o motorista -> alinhar com o técnico -> agendar -> finalizar.
-- Finalizar devolve o rastreador para "Instalado" (Com BFleet) e a linha fica como histórico.

create table if not exists public.frotas_rastreadores_manutencoes (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  situacao text not null default 'aberta' check (situacao in ('aberta','finalizada','cancelada')),
  etapa text not null default 'disponibilidade' check (etapa in ('disponibilidade','tecnico','agendamento','finalizar')),
  motivo text,
  status_anterior text,

  disponibilidade_motorista text,
  tecnico_nome text,
  tecnico_contato text,
  data_agendada date,
  hora_agendada text,
  local_agendado text,
  resolucao text,

  linha_tempo jsonb not null default '[]'::jsonb,

  aberta_em timestamptz not null default now(),
  aberta_por uuid default auth.uid(),
  aberta_por_nome text,
  encerrada_em timestamptz,
  encerrada_por_nome text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_frotas_rastr_manut_placa on public.frotas_rastreadores_manutencoes (placa, aberta_em desc);
create index if not exists idx_frotas_rastr_manut_situacao on public.frotas_rastreadores_manutencoes (situacao);

-- Uma manutenção aberta por placa.
create unique index if not exists uq_frotas_rastr_manut_aberta
  on public.frotas_rastreadores_manutencoes (placa) where situacao = 'aberta';

drop trigger if exists trg_frotas_rastr_manut_updated on public.frotas_rastreadores_manutencoes;
create trigger trg_frotas_rastr_manut_updated
  before update on public.frotas_rastreadores_manutencoes
  for each row execute function public.set_updated_at();

alter table public.frotas_rastreadores_manutencoes enable row level security;

drop policy if exists frotas_rastr_manut_select on public.frotas_rastreadores_manutencoes;
create policy frotas_rastr_manut_select on public.frotas_rastreadores_manutencoes
  for select to authenticated
  using (public.painel_has_module(array['frotas_rastreadores'], false));

drop policy if exists frotas_rastr_manut_write on public.frotas_rastreadores_manutencoes;
create policy frotas_rastr_manut_write on public.frotas_rastreadores_manutencoes
  for all to authenticated
  using (public.painel_has_module(array['frotas_rastreadores'], true))
  with check (public.painel_has_module(array['frotas_rastreadores'], true));
