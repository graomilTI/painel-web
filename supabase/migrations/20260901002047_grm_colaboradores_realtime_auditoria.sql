-- Sincronização quase em tempo real do cadastro de colaboradores do GRM.
-- A tabela colaboradores continua sendo a fonte do estado atual. Esta migration
-- adiciona a identidade estável do GRM e um journal imutável das diferenças.

alter table public.colaboradores
  add column if not exists grm_staff_code bigint;

create unique index if not exists uq_colaboradores_grm_staff_code
  on public.colaboradores (grm_staff_code)
  where grm_staff_code is not null;

create table if not exists public.colaboradores_alteracoes (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  colaborador_id uuid null references public.colaboradores(id) on delete set null,
  grm_staff_code bigint null,
  cpf text null,
  nome text not null,
  tipo_evento text not null check (
    tipo_evento in ('CADASTRADO', 'ALTERADO', 'INATIVADO', 'REATIVADO')
  ),
  campos_alterados text[] not null default '{}'::text[],
  valores_anteriores jsonb not null default '{}'::jsonb,
  valores_novos jsonb not null default '{}'::jsonb,
  detectado_em timestamptz not null default now(),
  fonte text not null default 'grm_api_staff_get_records',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_colaboradores_alteracoes_colaborador_data
  on public.colaboradores_alteracoes (colaborador_id, detectado_em desc);

create index if not exists idx_colaboradores_alteracoes_grm_data
  on public.colaboradores_alteracoes (grm_staff_code, detectado_em desc);

create index if not exists idx_colaboradores_alteracoes_tipo_data
  on public.colaboradores_alteracoes (tipo_evento, detectado_em desc);

alter table public.colaboradores_alteracoes enable row level security;

drop policy if exists "colaboradores_alteracoes_select_authenticated"
  on public.colaboradores_alteracoes;
create policy "colaboradores_alteracoes_select_authenticated"
  on public.colaboradores_alteracoes
  for select
  to authenticated
  using (true);

grant select on public.colaboradores_alteracoes to authenticated;
grant all on public.colaboradores_alteracoes to service_role;

-- Realtime publica somente tabelas, nunca views. O bloco é idempotente porque
-- pg_publication_tables não aceita ADD TABLE repetido.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'colaboradores'
  ) then
    alter publication supabase_realtime add table public.colaboradores;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'colaboradores_alteracoes'
  ) then
    alter publication supabase_realtime add table public.colaboradores_alteracoes;
  end if;
end
$$;

comment on table public.colaboradores_alteracoes is
  'Journal imutável das mudanças detectadas no cadastro de funcionários do GRM.';
