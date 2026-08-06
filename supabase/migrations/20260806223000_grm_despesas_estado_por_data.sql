-- Mantém estados independentes por colaborador e janela de programação.
alter table public.grm_despesas_estado_colaborador
  add column if not exists data_referencia date;

update public.grm_despesas_estado_colaborador e
set data_referencia = coalesce(
  (select v.data_referencia from public.grm_despesas_versoes v where v.id = e.versao_desejada_id),
  (now() at time zone 'America/Sao_Paulo')::date
)
where data_referencia is null;

alter table public.grm_despesas_estado_colaborador
  alter column data_referencia set not null;

alter table public.grm_despesas_estado_colaborador
  drop constraint if exists grm_despesas_estado_colaborador_pkey;

alter table public.grm_despesas_estado_colaborador
  add constraint grm_despesas_estado_colaborador_pkey primary key (cpf, data_referencia);

drop index if exists public.grm_despesas_fila_pendente_hash_uidx;
create unique index grm_despesas_fila_pendente_hash_uidx
  on public.grm_despesas_fila (cpf, data_referencia, hash_desejado)
  where status in ('PENDENTE', 'PROCESSANDO');

create index if not exists grm_despesas_estado_data_status_idx
  on public.grm_despesas_estado_colaborador (data_referencia, status_aplicacao);
