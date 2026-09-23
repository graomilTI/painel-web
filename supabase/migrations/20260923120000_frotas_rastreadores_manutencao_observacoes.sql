-- Frotas · Rastreadores: status "manutencao" + histórico de observações (data | descrição).
-- Observações só podem ser excluídas por master (RLS); qualquer autenticado lê e inclui.

alter table public.frotas_rastreadores drop constraint if exists frotas_rastreadores_status_check;
alter table public.frotas_rastreadores
  add constraint frotas_rastreadores_status_check
  check (status in ('sem_rastreador','em_andamento','concluido','aguardando_motorista','agendado','manutencao'));

create table if not exists public.frotas_rastreadores_observacoes (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  data date not null default current_date,
  descricao text not null check (length(btrim(descricao)) > 0),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_frotas_rastreadores_obs_placa
  on public.frotas_rastreadores_observacoes (placa, data desc);

alter table public.frotas_rastreadores_observacoes enable row level security;

drop policy if exists frotas_rastr_obs_select on public.frotas_rastreadores_observacoes;
create policy frotas_rastr_obs_select on public.frotas_rastreadores_observacoes
  for select to authenticated using (true);

drop policy if exists frotas_rastr_obs_insert on public.frotas_rastreadores_observacoes;
create policy frotas_rastr_obs_insert on public.frotas_rastreadores_observacoes
  for insert to authenticated with check ((select auth.uid()) is not null);

-- Sem policy de update (observação é registro histórico) e delete apenas master.
drop policy if exists frotas_rastr_obs_delete on public.frotas_rastreadores_observacoes;
create policy frotas_rastr_obs_delete on public.frotas_rastreadores_observacoes
  for delete to authenticated using (public.painel_is_master());

-- Migra o texto livre antigo como primeira observação de cada rastreador.
insert into public.frotas_rastreadores_observacoes (placa, data, descricao, criado_por_nome)
select r.placa, coalesce(r.updated_at::date, current_date), btrim(r.observacoes), 'Migrado do campo anterior'
from public.frotas_rastreadores r
where r.observacoes is not null and btrim(r.observacoes) <> ''
  and not exists (select 1 from public.frotas_rastreadores_observacoes o where o.placa = r.placa);
