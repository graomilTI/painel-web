-- Auditoria do agente que lança NHE automaticamente no GRM quando o colaborador
-- do informativo (Mapa de Embarque) tem login dentro do raio configurado da
-- O.S. Ver agentes-grm-sync/grm-sync-lancar-nhe.js.

create table if not exists public.logistica_nhe_lancamentos_auto (
  id uuid primary key default gen_random_uuid(),
  chave_unica text not null unique,
  data_referencia date not null,
  numero_os text not null,
  cliente text,
  supervisao text,
  coordenacao text,
  funcionario text,
  colaborador_chave text,
  distancia_m numeric,
  raio_m numeric,
  motivo text,
  observacao text,
  status text not null default 'PENDENTE',
  erro text,
  tentativas int not null default 0,
  lancado_em timestamptz,
  raw jsonb,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_logistica_nhe_lancamentos_auto_data
  on public.logistica_nhe_lancamentos_auto (data_referencia);

create index if not exists idx_logistica_nhe_lancamentos_auto_status
  on public.logistica_nhe_lancamentos_auto (status);

create table if not exists public.logistica_nhe_lancamentos_execucoes (
  id uuid primary key default gen_random_uuid(),
  data_referencia date,
  status text not null default 'INICIADO',
  total_pendentes int,
  total_candidatos int,
  total_sucesso int,
  total_erro int,
  total_sem_login int,
  total_fora_do_raio int,
  total_sem_coordenada_os int,
  erro text,
  raw jsonb,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

alter table public.logistica_nhe_lancamentos_auto enable row level security;
alter table public.logistica_nhe_lancamentos_execucoes enable row level security;

drop policy if exists "logistica_nhe_lancamentos_auto_select_authenticated" on public.logistica_nhe_lancamentos_auto;
create policy "logistica_nhe_lancamentos_auto_select_authenticated"
  on public.logistica_nhe_lancamentos_auto for select
  to authenticated
  using (true);

drop policy if exists "logistica_nhe_lancamentos_execucoes_select_authenticated" on public.logistica_nhe_lancamentos_execucoes;
create policy "logistica_nhe_lancamentos_execucoes_select_authenticated"
  on public.logistica_nhe_lancamentos_execucoes for select
  to authenticated
  using (true);
;
