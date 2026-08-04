-- Permite liberar o mesmo alojamento para várias supervisões.
-- `supervisao` é mantida como compatibilidade para telas/consultas antigas.

alter table public.hospedagem_alojamentos
  add column if not exists supervisoes text[] not null default '{}'::text[];

update public.hospedagem_alojamentos
set supervisoes = array[btrim(supervisao)]
where cardinality(supervisoes) = 0
  and nullif(btrim(supervisao), '') is not null;

create index if not exists idx_hospedagem_alojamentos_supervisoes_gin
  on public.hospedagem_alojamentos
  using gin (supervisoes);

comment on column public.hospedagem_alojamentos.supervisoes is
  'Supervisões autorizadas a visualizar e utilizar o alojamento. O campo supervisao mantém a primeira opção para compatibilidade.';
