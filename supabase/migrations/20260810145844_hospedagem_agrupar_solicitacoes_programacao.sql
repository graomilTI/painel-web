-- Identifica solicitações de hotel criadas automaticamente pela Programação.
-- A coluna permite que todos os colaboradores do mesmo período/destino sejam
-- associados a uma única solicitação e, consequentemente, a uma única reserva.

alter table public.hospedagem_solicitacoes
  add column if not exists programacao_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.hospedagem_solicitacoes'::regclass
       and conname = 'hospedagem_solicitacoes_programacao_id_fkey'
  ) then
    alter table public.hospedagem_solicitacoes
      add constraint hospedagem_solicitacoes_programacao_id_fkey
      foreign key (programacao_id)
      references public.programacao_dia(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_hosp_solicitacoes_programacao_periodo
  on public.hospedagem_solicitacoes (
    programacao_id,
    data_checkin_prevista,
    data_checkout_prevista
  )
  where programacao_id is not null;

comment on column public.hospedagem_solicitacoes.programacao_id is
  'Programação que originou a solicitação; usada para agrupar hóspedes do mesmo período, cidade e supervisão.';
