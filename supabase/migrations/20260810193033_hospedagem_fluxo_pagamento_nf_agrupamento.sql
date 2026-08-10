-- Fluxo operacional de hotéis: agrupamento, conferência de custos e pagamentos parciais.
create table if not exists public.hospedagem_reserva_solicitacoes (
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  solicitacao_id uuid not null references public.hospedagem_solicitacoes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reserva_id, solicitacao_id),
  unique (solicitacao_id)
);

create index if not exists idx_hosp_reserva_solicitacoes_solicitacao
  on public.hospedagem_reserva_solicitacoes (solicitacao_id);

alter table public.hospedagem_reserva_solicitacoes enable row level security;
drop policy if exists hospedagem_reserva_solicitacoes_auth_all on public.hospedagem_reserva_solicitacoes;
create policy hospedagem_reserva_solicitacoes_auth_all
  on public.hospedagem_reserva_solicitacoes for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
grant select, insert, update, delete on public.hospedagem_reserva_solicitacoes to authenticated;

alter table public.hospedagem_custos_extras
  add column if not exists enviar_conferencia boolean not null default false,
  add column if not exists status_conferencia text not null default 'NAO_ENVIADO';

alter table public.hospedagem_financeiro
  add column if not exists valor_original numeric(14,2),
  add column if not exists pagamento_parcial boolean not null default false,
  add column if not exists pago_em timestamptz;

comment on table public.hospedagem_reserva_solicitacoes is
  'Permite agrupar várias solicitações compatíveis em uma única reserva de hotel.';
