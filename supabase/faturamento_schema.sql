-- Módulo de Faturamento | Grão 1000
-- Execute no SQL Editor do Supabase antes de usar em produção compartilhada.
-- A tela funciona em modo local se essas tabelas ainda não existirem.

create table if not exists public.faturamento_clientes (
  id text primary key,
  nome text not null,
  cnpj text,
  email_financeiro text,
  whatsapp text,
  periodicidade text default 'Mensal',
  prazo_retorno_dias integer default 2,
  prazo_pagamento_dias integer default 7,
  status text default 'Ativo',
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.faturamento_faturas (
  id text primary key,
  codigo text,
  cliente_id text,
  cliente_nome text,
  periodicidade text,
  periodo text,
  valor_bruto numeric default 0,
  descontos numeric default 0,
  valor_liquido numeric default 0,
  prazo_envio date,
  prazo_retorno date,
  status text default 'Sem responsável',
  prioridade text default 'Normal',
  responsavel_id text,
  responsavel_nome text,
  distribuido_por_nome text,
  distribuido_em timestamptz,
  canal_envio text,
  ultimo_retorno_em timestamptz,
  proxima_cobranca_em date,
  divergencia text,
  observacoes text,
  os_abertas integer default 0,
  os_sem_movimento integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.faturamento_documentos (
  id text primary key,
  fatura_id text,
  cliente_nome text,
  tipo text not null,
  numero text,
  status text default 'A emitir',
  vencimento date,
  enviado_em timestamptz,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.faturamento_tarifas (
  id text primary key,
  cliente_id text,
  cliente_nome text,
  servico text not null,
  unidade text,
  valor numeric default 0,
  vigencia date,
  status text default 'Ativa',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_faturamento_faturas_status on public.faturamento_faturas(status);
create index if not exists idx_faturamento_faturas_responsavel on public.faturamento_faturas(responsavel_id);
create index if not exists idx_faturamento_faturas_prazo on public.faturamento_faturas(prazo_envio);
create index if not exists idx_faturamento_documentos_status on public.faturamento_documentos(status);

-- Permissão de menu: se sua tabela app_modulos tiver essas colunas, execute este insert.
-- Ajuste nomes de colunas caso o cadastro de módulos do painel esteja diferente.
insert into public.app_modulos (codigo, nome, grupo, ativo)
select 'faturamento', 'Painel de Faturamento', 'FATURAMENTO', true
where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'app_modulos'
)
and not exists (
  select 1 from public.app_modulos where codigo = 'faturamento'
);
