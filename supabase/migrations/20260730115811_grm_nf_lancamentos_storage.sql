-- Auditoria e idempotência do agente de lançamento de notas fiscais no GRM.
-- Origem dos arquivos: upload direto no painel (bucket 'notas-fiscais'), não Google Drive.

create extension if not exists pgcrypto;

create table if not exists public.grm_nf_lancamento_execucoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'INICIADO',
  dry_run boolean not null default true,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  resumo jsonb not null default '{}'::jsonb,
  erro text,
  created_at timestamptz not null default now()
);

create table if not exists public.grm_nf_lancamentos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid references public.grm_nf_lancamento_execucoes(id) on delete set null,
  storage_bucket text not null default 'notas-fiscais',
  storage_path text not null unique,
  arquivo_nome text not null,
  arquivo_mime_type text,
  setor text,
  enviado_por uuid references auth.users(id),
  fingerprint text,
  status text not null default 'NOVO',
  tentativas integer not null default 0,
  fornecedor_cnpj text,
  fornecedor_nome text,
  numero_documento text,
  data_emissao date,
  data_vencimento date,
  valor_total numeric(18,2),
  grupo_categoria text,
  categoria text,
  forma_pagamento text,
  origem_extracao text,
  extraido_json jsonb not null default '{}'::jsonb,
  validacao_erros jsonb not null default '[]'::jsonb,
  grm_codigo text,
  grm_grupo text,
  grm_resposta jsonb,
  processado_em timestamptz,
  lancado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grm_nf_lancamentos_status_idx
  on public.grm_nf_lancamentos(status, updated_at desc);

create index if not exists grm_nf_lancamentos_fingerprint_idx
  on public.grm_nf_lancamentos(fingerprint)
  where fingerprint is not null;

create index if not exists grm_nf_lancamentos_documento_idx
  on public.grm_nf_lancamentos(fornecedor_cnpj, numero_documento, data_emissao);

alter table public.grm_nf_lancamento_execucoes enable row level security;
alter table public.grm_nf_lancamentos enable row level security;

drop policy if exists "Leitura autenticada execucoes NF" on public.grm_nf_lancamento_execucoes;
create policy "Leitura autenticada execucoes NF"
  on public.grm_nf_lancamento_execucoes for select
  to authenticated
  using (true);

drop policy if exists "Leitura autenticada lancamentos NF" on public.grm_nf_lancamentos;
create policy "Leitura autenticada lancamentos NF"
  on public.grm_nf_lancamentos for select
  to authenticated
  using (true);

drop policy if exists "Upload autenticado lancamentos NF" on public.grm_nf_lancamentos;
create policy "Upload autenticado lancamentos NF"
  on public.grm_nf_lancamentos for insert
  to authenticated
  with check (enviado_por = auth.uid());

grant select on public.grm_nf_lancamento_execucoes to authenticated;
grant select, insert on public.grm_nf_lancamentos to authenticated;
;
