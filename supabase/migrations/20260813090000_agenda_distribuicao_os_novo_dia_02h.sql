-- Motivação (13/08): 5 O.S. da supervisão MATO GROSSO MT2 - Campo Verde
-- sumiram da tela Distribuir O.S para os colaboradores porque a Programação
-- do dia 13/08 foi criada/duplicada na noite de 12/08, mas o agente
-- aplicar-distribuicao-os só dispara por evento (idle de 5 min na tela
-- Distribuir O.S — ver 20260810160000_dispara_aplicar_distribuicao_os.sql).
-- Como ninguém ficou parado naquela tela depois da programação do dia
-- seguinte, a distribuição nunca rodou pra essas O.S. (que continuavam
-- "Aberta" no GRM, só sem colaborador vinculado nesse ciclo).
--
-- Este agendamento cobre esse buraco: toda vez que uma programação_dia é
-- criada pra uma data POSTERIOR à de hoje (novo dia via Etapa 1 ou via
-- duplicar_programacao_dia — ambos inserem em programacao_dia), fica
-- registrado um pedido pendente. Um cron às 02h (Brasília) enfileira o
-- aplicar-distribuicao-os se houver pedido pendente numa supervisão com
-- distribuicao_os_automatica = true — mesma checagem de elegibilidade usada
-- por solicitar_aplicar_distribuicao_os, só que disparada por agendamento
-- em vez de inatividade na tela.

create table if not exists public.programacao_distribuicao_agendada (
  id uuid primary key default gen_random_uuid(),
  supervisao text not null,
  data_referencia date not null,
  programacao_id uuid references public.programacao_dia(id) on delete cascade,
  processado boolean not null default false,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (supervisao, data_referencia)
);

comment on table public.programacao_distribuicao_agendada is
  'Fila de pedidos de distribuição automática de O.S. gerados quando a Programação de um dia posterior é criada ou duplicada. Consumida pelo cron aplicar-distribuicao-os-agendada-02h.';

alter table public.programacao_distribuicao_agendada enable row level security;

create policy "programacao_distribuicao_agendada_select_authenticated"
  on public.programacao_distribuicao_agendada
  for select
  to authenticated
  using (true);

create or replace function public.agenda_distribuicao_os_novo_dia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.supervisao is not null
     and new.data_referencia > (now() at time zone 'America/Sao_Paulo')::date
  then
    insert into public.programacao_distribuicao_agendada (supervisao, data_referencia, programacao_id)
    values (new.supervisao, new.data_referencia, new.id)
    on conflict (supervisao, data_referencia)
    do update set
      programacao_id = excluded.programacao_id,
      processado = false,
      processado_em = null,
      created_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agenda_distribuicao_os_novo_dia on public.programacao_dia;
create trigger trg_agenda_distribuicao_os_novo_dia
  after insert on public.programacao_dia
  for each row execute function public.agenda_distribuicao_os_novo_dia();

comment on function public.agenda_distribuicao_os_novo_dia() is
  'Registra em programacao_distribuicao_agendada quando uma programacao_dia é criada (Etapa 1) ou duplicada (duplicar_programacao_dia) para uma data posterior a hoje, pra ser processada pelo cron das 02h.';

select cron.schedule(
  'aplicar-distribuicao-os-agendada-02h',
  '0 5 * * *',
  $cron$
    with pendencias as (
      select pda.id
      from public.programacao_distribuicao_agendada pda
      join public.supervisoes s on s.nome = pda.supervisao
      where pda.processado = false
        and s.distribuicao_os_automatica = true
    )
    insert into public.grm_sync_jobs (agente_id, status)
    select 'aplicar-distribuicao-os', 'pendente'
    where exists (select 1 from pendencias)
      and not exists (
        select 1 from public.grm_sync_jobs
        where agente_id = 'aplicar-distribuicao-os' and status in ('pendente', 'rodando')
      );

    update public.programacao_distribuicao_agendada pda
    set processado = true, processado_em = now()
    from public.supervisoes s
    where s.nome = pda.supervisao
      and s.distribuicao_os_automatica = true
      and pda.processado = false;
  $cron$
);
