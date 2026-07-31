-- Solicitação de inativação de colaborador feita pelo gestor na Etapa 4
-- (Sem O.S.) da Programação. O clique do gestor NÃO inativa ninguém — só
-- registra o pedido com motivo. Quem inativa de fato (no cadastro/GRM) é o
-- setor de RH, a partir do KPI/lista em Recursos Humanos > Equipe > Inativações.
create table if not exists public.programacao_inativacao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  nome_colaborador text not null,
  cargo text,
  coordenacao text,
  supervisao text,
  motivo text not null,
  data_referencia date,
  programacao_id uuid references public.programacao_dia(id) on delete set null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PROCESSADA', 'CANCELADA')),
  solicitado_por uuid,
  solicitado_por_nome text,
  solicitado_em timestamptz not null default now(),
  processado_por uuid,
  processado_por_nome text,
  processado_em timestamptz,
  observacao_rh text
);

create index if not exists idx_programacao_inativacao_status on public.programacao_inativacao_solicitacoes (status);
create index if not exists idx_programacao_inativacao_colaborador on public.programacao_inativacao_solicitacoes (colaborador_id);

alter table public.programacao_inativacao_solicitacoes enable row level security;

create policy programacao_inativacao_solicitacoes_auth_all
  on public.programacao_inativacao_solicitacoes
  for all
  to authenticated
  using (true)
  with check (true);
;
