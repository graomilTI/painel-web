-- Desligados com material a recolher (Relatórios de Patrimônios > aba Desligados).
--
-- O usuário cadastra o desligado com a DATA DE DESLIGAMENTO; o prazo para
-- recolher o material é de 10 dias a partir dela. Os patrimônios NÃO são
-- gravados aqui: a tela os lê ao vivo de patrimonios_snapshot pelo nome do
-- colaborador, então o item some sozinho quando outro colaborador faz a leitura
-- (o snapshot passa a apontar outro `funcionario`). Quando já não resta nenhum
-- item, a tela fecha o registro (RECOLHIDO). Vencido o prazo, o que não foi
-- recolhido é marcado como LANCADO_CAIXA, guardando a lista congelada.
create table if not exists public.patrimonio_desligados (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text,
  nome_colaborador text not null,
  cargo text,
  coordenacao text,
  supervisao text,
  motivo text,
  data_desligamento date not null,
  prazo_recolhimento date generated always as (data_desligamento + 10) stored,
  status text not null default 'ABERTO'
    check (status in ('ABERTO', 'RECOLHIDO', 'LANCADO_CAIXA', 'CANCELADO')),
  itens_lancados jsonb,
  lancado_caixa_em timestamptz,
  lancado_caixa_por_nome text,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um desligado aberto por colaborador (mesmo nome, sem diferença de caixa).
create unique index if not exists uq_patrimonio_desligados_aberto_nome
  on public.patrimonio_desligados (upper(btrim(nome_colaborador)))
  where status = 'ABERTO';

create index if not exists idx_patrimonio_desligados_status
  on public.patrimonio_desligados (status, prazo_recolhimento);

create or replace function public.patrimonio_desligados_touch()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_patrimonio_desligados_touch on public.patrimonio_desligados;
create trigger trg_patrimonio_desligados_touch
  before update on public.patrimonio_desligados
  for each row execute function public.patrimonio_desligados_touch();

alter table public.patrimonio_desligados enable row level security;

drop policy if exists patrimonio_desligados_select on public.patrimonio_desligados;
create policy patrimonio_desligados_select
  on public.patrimonio_desligados for select to authenticated using (true);

drop policy if exists patrimonio_desligados_insert on public.patrimonio_desligados;
create policy patrimonio_desligados_insert
  on public.patrimonio_desligados for insert to authenticated with check (true);

drop policy if exists patrimonio_desligados_update on public.patrimonio_desligados;
create policy patrimonio_desligados_update
  on public.patrimonio_desligados for update to authenticated using (true) with check (true);

-- Sem DELETE: remover da lista = status CANCELADO (fica o histórico).
