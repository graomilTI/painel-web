create table if not exists public.programacao_recusas_respostas (
  id uuid primary key default gen_random_uuid(),
  conferencia_status_id uuid not null references public.programacao_conferencia_status(id) on delete cascade,
  programacao_id uuid not null,
  colaborador_id text not null,
  data_referencia date,
  resposta text not null check (resposta in ('ACEITO','CONTESTADO')),
  motivo text,
  anexos_urls jsonb not null default '[]'::jsonb,
  respondido_por uuid,
  respondido_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conferencia_status_id)
);

comment on table public.programacao_recusas_respostas is 'Resposta do Gestor (Programação > 3-Recusas) a uma despesa marcada PENDENCIA pela Conferência: Aceitar (sem motivo) ou Contestar (motivo obrigatório + anexos).';

alter table public.programacao_recusas_respostas enable row level security;

drop policy if exists "recusas_respostas_select_auth" on public.programacao_recusas_respostas;
create policy "recusas_respostas_select_auth" on public.programacao_recusas_respostas
  for select to authenticated using (true);

drop policy if exists "recusas_respostas_write_auth" on public.programacao_recusas_respostas;
create policy "recusas_respostas_write_auth" on public.programacao_recusas_respostas
  for all to authenticated using (true) with check (true);;
