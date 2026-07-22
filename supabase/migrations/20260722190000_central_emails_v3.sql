-- Central de E-mails v3 — melhorias de triagem e distribuição
--
-- 1. Palavras-chave de regional passam a morar no banco (tabela nova), para que
--    a equipe cadastre novas cidades/termos sem precisar alterar código.
-- 2. Encaminhamento automático opcional (opt-in) por regra e por conta: quando
--    ambos permitem e há destino identificado, o worker coloca o encaminhamento
--    direto na fila de envio, sem exigir clique de aprovação.
-- 3. Índices para deixar a listagem e os filtros do painel mais rápidos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Palavras-chave por regional
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.email_regionais_keywords (
  id uuid primary key default gen_random_uuid(),
  regional text not null,
  palavra text not null,
  prioridade integer not null default 100,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (regional, palavra)
);

alter table public.email_regionais_keywords enable row level security;

drop policy if exists email_regionais_keywords_select on public.email_regionais_keywords;
drop policy if exists email_regionais_keywords_insert on public.email_regionais_keywords;
drop policy if exists email_regionais_keywords_update on public.email_regionais_keywords;
drop policy if exists email_regionais_keywords_delete on public.email_regionais_keywords;

create policy email_regionais_keywords_select
  on public.email_regionais_keywords for select to authenticated using (true);
create policy email_regionais_keywords_insert
  on public.email_regionais_keywords for insert to authenticated with check (true);
create policy email_regionais_keywords_update
  on public.email_regionais_keywords for update to authenticated using (true) with check (true);
create policy email_regionais_keywords_delete
  on public.email_regionais_keywords for delete to authenticated using (true);

-- Semente: mesmo conjunto que estava fixo no código do worker (ordem preservada
-- pela coluna prioridade — quanto menor, mais cedo é testada).
insert into public.email_regionais_keywords (regional, palavra, prioridade) values
  ('MATO GROSSO MT3', 'vale sul', 10),
  ('MATO GROSSO MT3', 'confresa', 10),
  ('MATO GROSSO MT3', 'querencia', 10),
  ('MATO GROSSO MT3', 'mt3', 10),
  ('MATO GROSSO MT3', 'mato grosso mt3', 10),
  ('MATO GROSSO MT1', 'br163 sul', 20),
  ('MATO GROSSO MT1', 'br163 norte', 20),
  ('MATO GROSSO MT1', 'br 163', 20),
  ('MATO GROSSO MT1', 'mt1', 20),
  ('MATO GROSSO MT1', 'sinop', 20),
  ('MATO GROSSO MT1', 'sorriso', 20),
  ('MATO GROSSO MT1', 'lucas do rio verde', 20),
  ('MATO GROSSO MT2', 'mt2', 30),
  ('MATO GROSSO MT2', 'rondonopolis', 30),
  ('MATO GROSSO MT2', 'primavera do leste', 30),
  ('MATO GROSSO MT4', 'mt4', 40),
  ('MATO GROSSO MT4', 'campo novo do parecis', 40),
  ('MATO GROSSO MT4', 'comodoro', 40),
  ('PR PONTA GROSSA', 'pr pgo', 50),
  ('PR PONTA GROSSA', 'ponta grossa', 50),
  ('PR CASCAVEL', 'pr csc', 60),
  ('PR CASCAVEL', 'cascavel', 60),
  ('PR CASCAVEL', 'oeste pr', 60),
  ('PR LONDRINA', 'londrina', 70),
  ('PR MARINGA', 'pr mga', 80),
  ('PR MARINGA', 'maringa', 80),
  ('PR MARINGA', 'paranagua', 80),
  ('PR MARINGA', 'terminal', 80),
  ('PR MARINGA', 'terminais', 80),
  ('GOIAS', 'goias', 90),
  ('GOIAS', 'goiania', 90),
  ('GOIAS', 'jatai', 90),
  ('MATO GROSSO DO SUL', 'ms norte', 100),
  ('MATO GROSSO DO SUL', 'ms sul', 100),
  ('MATO GROSSO DO SUL', 'mato grosso do sul', 100),
  ('MINAS GERAIS', 'minas gerais', 110),
  ('BAHIA', 'bahia', 120),
  ('MARANHAO', 'maranhao', 130),
  ('PARA', 'pa pgm', 140),
  ('PARA', 'paragominas', 140),
  ('PARAGUAI', 'paraguai', 150),
  ('RIO GRANDE DO SUL', 'rio grande do sul', 160),
  ('SAO PAULO', 'sao paulo', 170),
  ('TOCANTINS', 'tocantins', 180),
  ('TOCANTINS', 'palmas', 180),
  ('TOCANTINS', 'gurupi', 180)
on conflict (regional, palavra) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Encaminhamento automático (opt-in em dois níveis: conta E regra)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.email_regras
  add column if not exists auto_encaminhar boolean not null default false;

alter table public.email_accounts
  add column if not exists auto_encaminhar boolean not null default false;

-- A view pública usada pelo painel precisa expor a coluna nova da conta.
drop view if exists public.email_accounts_public;
create view public.email_accounts_public as
select
  id, nome, email, username, imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure, pasta_entrada, limite_por_sync,
  ativo, auto_responder, auto_encaminhar,
  ultima_uid, ultima_sync_em, ultima_sync_status, ultima_sync_erro,
  created_at, updated_at
from public.email_accounts;

grant select on public.email_accounts_public to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índices de listagem/filtragem do painel
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_email_messages_categoria on public.email_messages (categoria);
create index if not exists idx_email_messages_regional on public.email_messages (regional);
create index if not exists idx_email_messages_status_data on public.email_messages (status, data_recebimento desc);
create index if not exists idx_email_messages_prioridade on public.email_messages (prioridade);
