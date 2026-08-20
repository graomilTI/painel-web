create table public.frotas_print_ocr_execucoes (
  id bigint generated always as identity primary key,
  arquivo_id text,
  arquivo_nome text not null,
  arquivo_url text,
  data_notificacao date,
  placa_ocr text,
  motorista_ocr text,
  registros_ocr jsonb not null default '[]'::jsonb,
  resposta_ocr jsonb not null default '{}'::jsonb,
  status text not null default 'PENDENTE_CONFERENCIA',
  motivo text,
  ids_correspondentes jsonb not null default '[]'::jsonb,
  ids_arquivados jsonb not null default '[]'::jsonb,
  candidatos_ambiguos jsonb not null default '[]'::jsonb,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  constraint frotas_print_ocr_status_check check (status in (
    'PENDENTE_CONFERENCIA', 'AMBIGUO', 'CONCILIADO', 'ARQUIVADO', 'CONFLITO_CONCORRENCIA', 'ERRO'
  ))
);

create index frotas_print_ocr_arquivo_id_idx
  on public.frotas_print_ocr_execucoes (arquivo_id) where arquivo_id is not null;
create index frotas_print_ocr_pendentes_idx
  on public.frotas_print_ocr_execucoes (criado_em desc)
  where status in ('PENDENTE_CONFERENCIA', 'AMBIGUO', 'CONFLITO_CONCORRENCIA');

alter table public.frotas_print_ocr_execucoes enable row level security;
create policy frotas_print_ocr_select on public.frotas_print_ocr_execucoes
  for select to authenticated
  using (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], false));
create policy frotas_print_ocr_insert on public.frotas_print_ocr_execucoes
  for insert to authenticated
  with check (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true)
    and (criado_por is null or criado_por = (select auth.uid())));
create policy frotas_print_ocr_update on public.frotas_print_ocr_execucoes
  for update to authenticated
  using (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true))
  with check (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true));

grant select, insert, update on public.frotas_print_ocr_execucoes to authenticated;
grant usage, select on sequence public.frotas_print_ocr_execucoes_id_seq to authenticated;
revoke all on public.frotas_print_ocr_execucoes from anon;
revoke all on sequence public.frotas_print_ocr_execucoes_id_seq from anon;
comment on table public.frotas_print_ocr_execucoes is
  'Auditoria durável dos prints de excesso de velocidade e da conciliação com ocorrências.';
