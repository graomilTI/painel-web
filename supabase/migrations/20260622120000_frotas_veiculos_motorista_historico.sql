-- Histórico de motorista por veículo (patrimônio), para permitir saber quem
-- estava dirigindo um veículo numa data específica (ex: data da infração de
-- uma multa), em vez de assumir sempre o motorista_atual.

create table if not exists public.frotas_veiculos_historico (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  motorista text,
  data_inicio timestamptz not null default now(),
  data_fim timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists idx_frotas_veiculos_historico_veiculo
  on public.frotas_veiculos_historico(veiculo_id, data_inicio desc);
alter table public.frotas_veiculos_historico enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'frotas_veiculos_historico'
      and policyname = 'frotas_veiculos_historico_auth_all'
  ) then
    create policy frotas_veiculos_historico_auth_all
      on public.frotas_veiculos_historico
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
-- Backfill: cria o registro do estado atual de cada veículo com motorista
-- definido. data_inicio é fixada bem no passado (não temos a data real da
-- última troca), servindo como fallback para multas antigas até que o
-- trigger abaixo comece a registrar trocas reais a partir de agora.
insert into public.frotas_veiculos_historico (veiculo_id, motorista, data_inicio, data_fim)
select v.id, v.motorista_atual, timestamptz '2000-01-01', null
from public.frotas_veiculos v
where v.motorista_atual is not null
  and trim(v.motorista_atual) <> ''
  and not exists (
    select 1 from public.frotas_veiculos_historico h where h.veiculo_id = v.id
  );
-- Trigger: ao mudar (ou definir por primeira vez) o motorista_atual de um
-- veículo, encerra o registro de histórico em aberto e abre um novo.
create or replace function public.registrar_troca_motorista_veiculo()
returns trigger as $$
begin
  if coalesce(new.motorista_atual, '') is distinct from coalesce(old.motorista_atual, '') then
    update public.frotas_veiculos_historico
       set data_fim = now()
     where veiculo_id = new.id
       and data_fim is null;

    if new.motorista_atual is not null and trim(new.motorista_atual) <> '' then
      insert into public.frotas_veiculos_historico (veiculo_id, motorista, data_inicio)
      values (new.id, new.motorista_atual, now());
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_frotas_veiculos_motorista_historico on public.frotas_veiculos;
create trigger trg_frotas_veiculos_motorista_historico
after update on public.frotas_veiculos
for each row execute function public.registrar_troca_motorista_veiculo();
-- Função auxiliar: motorista do veículo numa data específica (fallback para
-- o motorista_atual quando não há registro de histórico cobrindo a data).
create or replace function public.frotas_motorista_em_data(p_veiculo_id uuid, p_data date)
returns text as $$
  select coalesce(
    (
      select h.motorista
      from public.frotas_veiculos_historico h
      where h.veiculo_id = p_veiculo_id
        and h.data_inicio <= (p_data + interval '1 day')
        and (h.data_fim is null or h.data_fim > p_data::timestamptz)
      order by h.data_inicio desc
      limit 1
    ),
    (select v.motorista_atual from public.frotas_veiculos v where v.id = p_veiculo_id)
  );
$$ language sql stable;
