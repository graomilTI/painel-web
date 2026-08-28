-- Auditoria do agente que casa placas "Aguardando Classificação" no painel
-- Ouro Safra (app.ourosafra.com.br/app/cdci) com a classificação já feita no
-- GRM e anexa o laudo de volta. Ver agentes-grm-sync/grm-sync-classificacao-ourosafra.js.
-- 1 linha por placa processada em cada execução (não 1 linha por execução).

create table if not exists public.ouro_safra_classificacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  agendamento_id text,
  placa text,
  os_grm text,
  umidade numeric,
  impureza numeric,
  avariados numeric,
  status text not null, -- 'sucesso' | 'erro' | 'dry-run'
  erro text,
  duracao_ms int,
  iniciado_em timestamptz not null default now()
);

create index if not exists idx_ouro_safra_classificacao_execucoes_iniciado_em
  on public.ouro_safra_classificacao_execucoes (iniciado_em desc);

create index if not exists idx_ouro_safra_classificacao_execucoes_status
  on public.ouro_safra_classificacao_execucoes (status);

alter table public.ouro_safra_classificacao_execucoes enable row level security;

drop policy if exists "ouro_safra_classificacao_execucoes_select_authenticated" on public.ouro_safra_classificacao_execucoes;
create policy "ouro_safra_classificacao_execucoes_select_authenticated"
  on public.ouro_safra_classificacao_execucoes for select
  to authenticated
  using (true);
