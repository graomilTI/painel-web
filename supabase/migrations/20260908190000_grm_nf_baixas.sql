-- Fila de baixa de pagamentos (holerite/NF) no GRM a partir de comprovantes
-- bancários (PIX/TED) anexados pelo Financeiro. Espelha o padrão de
-- grm_nf_lancamentos/grm_nf_lancamento_execucoes (ver
-- server-patches/grm-sync/sql/20260730010000_grm_nf_lancamentos.sql), mas
-- para o passo seguinte: marcar como pago (payInvoice/payment) um
-- lançamento já existente (grm_nf_lancamentos.grm_codigo = pinCode no GRM).

create table if not exists public.grm_nf_baixa_execucoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'INICIADO',
  dry_run boolean not null default true,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  resumo jsonb not null default '{}'::jsonb,
  erro text,
  created_at timestamptz not null default now()
);

create table if not exists public.grm_nf_baixas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid references public.grm_nf_baixa_execucoes(id) on delete set null,
  storage_bucket text not null default 'notas-fiscais',
  storage_path text not null unique,
  arquivo_nome text not null,
  arquivo_mime_type text,
  enviado_por uuid references auth.users(id),
  fingerprint text,
  status text not null default 'NOVO',
  tentativas integer not null default 0,

  -- extraído do texto do comprovante
  favorecido_nome text,
  favorecido_documento text,
  valor numeric(18,2),
  data_pagamento date,
  banco_pagador text,
  agencia_conta_pagador text,

  -- resolvido (conta pagadora -> empresa/GRM, e candidato casado)
  empresa_detectada text,
  bacc_code integer,
  pat_code integer,
  pin_code text,
  grm_nf_lancamento_id uuid references public.grm_nf_lancamentos(id) on delete set null,

  -- revisão manual quando o match não é único
  candidatos_json jsonb not null default '[]'::jsonb,

  extraido_json jsonb not null default '{}'::jsonb,
  validacao_erros jsonb not null default '[]'::jsonb,
  grm_resposta jsonb,
  processado_em timestamptz,
  baixado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint grm_nf_baixas_status_check check (status in (
    'NOVO', 'PROCESSANDO', 'AGUARDANDO_REVISAO', 'VALIDADO',
    'BAIXADO', 'DRY_RUN_OK', 'DUPLICADO', 'ERRO', 'CANCELADO'
  ))
);

create index if not exists grm_nf_baixas_status_idx
  on public.grm_nf_baixas(status, updated_at desc);

create index if not exists grm_nf_baixas_fingerprint_idx
  on public.grm_nf_baixas(fingerprint)
  where fingerprint is not null;

create index if not exists grm_nf_baixas_grm_nf_lancamento_id_idx
  on public.grm_nf_baixas(grm_nf_lancamento_id)
  where grm_nf_lancamento_id is not null;

alter table public.grm_nf_baixa_execucoes enable row level security;
alter table public.grm_nf_baixas enable row level security;

create policy "Leitura autenticada execucoes baixa NF"
  on public.grm_nf_baixa_execucoes for select
  to authenticated
  using (true);

create policy "Leitura autenticada baixas NF"
  on public.grm_nf_baixas for select
  to authenticated
  using (true);

-- Financeiro sobe o comprovante e cria a linha; só o agente (service role)
-- preenche extração/matching/resultado da baixa depois.
create policy "Upload autenticado baixas NF"
  on public.grm_nf_baixas for insert
  to authenticated
  with check (enviado_por = auth.uid());

-- Usuário confirma manualmente qual candidato é o lançamento certo quando
-- o agente não conseguiu casar sozinho (0 ou 2+ candidatos).
create policy "Confirmar candidato baixa NF"
  on public.grm_nf_baixas for update
  to authenticated
  using (status = 'AGUARDANDO_REVISAO')
  with check (status = 'VALIDADO');

-- Cancelar um comprovante enviado por engano, antes de ele ser baixado.
create policy "Cancelar baixa NF"
  on public.grm_nf_baixas for update
  to authenticated
  using (status in ('NOVO', 'PROCESSANDO', 'AGUARDANDO_REVISAO', 'ERRO'))
  with check (status = 'CANCELADO');

-- Relançar um comprovante que deu erro (ex.: conta pagadora não mapeada
-- ainda no config, corrigido, e quer tentar de novo).
create policy "Relancar baixa NF com erro"
  on public.grm_nf_baixas for update
  to authenticated
  using (status = 'ERRO')
  with check (status = 'NOVO');

grant select on public.grm_nf_baixa_execucoes to authenticated;
grant select, insert, update on public.grm_nf_baixas to authenticated;
