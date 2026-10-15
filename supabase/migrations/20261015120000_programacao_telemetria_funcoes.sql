-- TEMPORÁRIA (15/10/2026): telemetria de uso das funções de renderContent() em assets/js/programacao.js.
--
-- Objetivo: provar, com dados reais de uso, quais funções da tela clássica de etapas A–E da Programação
-- nunca executam (a UI nova — lista + painel lateral, Sem O.S., Transferências — a substituiu), para
-- então apagá-las com segurança. Cada linha é o que UMA sessão do navegador executou desde o último envio:
-- { "nomeDaFuncao": nº de chamadas }. Não guarda dado de colaborador, O.S. ou valor.
--
-- Remover depois da coleta (~22/10/2026), junto com assets/js/programacao-telemetria.js e o bloco
-- "TELEMETRIA TEMPORÁRIA" de programacao.js:
--   drop table public.programacao_telemetria_funcoes;
--
-- Segurança: o cliente (usuário logado) só consegue INSERIR; não há política de leitura, então ninguém
-- lê pela API. A leitura é feita pelo dono do banco (supabase db query --linked).

create table if not exists public.programacao_telemetria_funcoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid default auth.uid(),
  sessao text not null,
  versao text not null,
  funcoes jsonb not null,
  constraint programacao_telemetria_funcoes_funcoes_objeto check (jsonb_typeof(funcoes) = 'object'),
  constraint programacao_telemetria_funcoes_tamanho check (pg_column_size(funcoes) < 8192)
);

comment on table public.programacao_telemetria_funcoes is
  'TEMPORÁRIA (15/10/2026): contagem de chamadas das funções de renderContent() da Programação por sessão. Dropar após ~22/10/2026.';

create index if not exists programacao_telemetria_funcoes_criado_em_idx
  on public.programacao_telemetria_funcoes (criado_em desc);

alter table public.programacao_telemetria_funcoes enable row level security;

drop policy if exists programacao_telemetria_funcoes_insert on public.programacao_telemetria_funcoes;
create policy programacao_telemetria_funcoes_insert
  on public.programacao_telemetria_funcoes
  for insert
  to authenticated
  with check (usuario_id is null or usuario_id = auth.uid());

revoke all on public.programacao_telemetria_funcoes from public, anon, authenticated;
grant insert on public.programacao_telemetria_funcoes to authenticated;
