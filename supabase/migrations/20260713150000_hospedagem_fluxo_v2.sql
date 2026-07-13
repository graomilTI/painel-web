-- Hospedagem v2: cotação, custos adicionais, documentos e comunicação.
-- Mantém as tabelas atuais de solicitações/reservas/financeiro e acrescenta
-- camadas independentes para que operação, pagamento e documentos avancem separadamente.

create extension if not exists pgcrypto;

alter table if exists public.hospedagem_hoteis
  add column if not exists aceita_pagamento_checkout boolean,
  add column if not exists condicao_pagamento_padrao text,
  add column if not exists recebe_cotacao boolean not null default true,
  add column if not exists whatsapp_validado boolean not null default false,
  add column if not exists pix_chave text,
  add column if not exists email_financeiro text;

create table if not exists public.hospedagem_cotacoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null,
  hotel_id uuid not null,
  hotel_nome text,
  status text not null default 'PENDENTE',
  quantidade_pessoas integer,
  quantidade_quartos integer,
  composicao_quartos text,
  diarias_previstas numeric(10,2),
  valor_diaria numeric(14,2),
  valor_total numeric(14,2),
  aceita_pagamento_checkout boolean,
  cafe_incluso boolean,
  estacionamento_incluso boolean,
  observacoes text,
  mensagem_enviada text,
  resposta_texto text,
  erro_envio text,
  enviado_em timestamptz,
  respondido_em timestamptz,
  selecionada boolean not null default false,
  selecionada_em timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (solicitacao_id, hotel_id)
);

create index if not exists idx_hosp_cotacoes_solicitacao on public.hospedagem_cotacoes(solicitacao_id);
create index if not exists idx_hosp_cotacoes_hotel on public.hospedagem_cotacoes(hotel_id);
create index if not exists idx_hosp_cotacoes_status on public.hospedagem_cotacoes(status);

create table if not exists public.hospedagem_custos_extras (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null,
  reserva_id uuid,
  tipo text not null default 'OUTROS',
  descricao text not null,
  quantidade numeric(12,2) not null default 1,
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  data_custo date not null default current_date,
  autorizado_por uuid,
  autorizado_por_nome text,
  anexo_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hosp_extras_solicitacao on public.hospedagem_custos_extras(solicitacao_id);
create index if not exists idx_hosp_extras_reserva on public.hospedagem_custos_extras(reserva_id);

create table if not exists public.hospedagem_documentos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null,
  reserva_id uuid,
  tipo text not null default 'OUTRO',
  arquivo_url text not null,
  nome_arquivo text,
  mime_type text,
  origem text not null default 'PAINEL',
  status text not null default 'ANEXADO',
  external_message_id text,
  botconversa_destinatario text,
  botconversa_enviado_em timestamptz,
  recebido_em timestamptz,
  observacoes text,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hosp_docs_solicitacao on public.hospedagem_documentos(solicitacao_id);
create index if not exists idx_hosp_docs_reserva on public.hospedagem_documentos(reserva_id);
create index if not exists idx_hosp_docs_tipo on public.hospedagem_documentos(tipo);
create unique index if not exists idx_hosp_docs_external_unique on public.hospedagem_documentos(external_message_id) where external_message_id is not null;

create table if not exists public.hospedagem_mensagens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null,
  reserva_id uuid,
  hotel_id uuid,
  direcao text not null default 'SAIDA',
  tipo text not null default 'OUTRO',
  canal text not null default 'BOTCONVERSA',
  remetente text,
  destinatario text,
  conteudo text,
  arquivo_url text,
  external_message_id text,
  status text not null default 'PENDENTE',
  erro text,
  enviado_em timestamptz,
  recebido_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_hosp_msg_solicitacao on public.hospedagem_mensagens(solicitacao_id);
create index if not exists idx_hosp_msg_hotel on public.hospedagem_mensagens(hotel_id);
create unique index if not exists idx_hosp_msg_external_unique on public.hospedagem_mensagens(external_message_id) where external_message_id is not null;

alter table if exists public.hospedagem_financeiro
  add column if not exists origem_pagamento text,
  add column if not exists condicao_pagamento text,
  add column if not exists forma_pagamento text,
  add column if not exists valor_pago numeric(14,2),
  add column if not exists saldo numeric(14,2),
  add column if not exists comprovante_url text,
  add column if not exists comprovante_enviado_em timestamptz;

create or replace function public.hospedagem_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_hosp_cotacoes_updated_at') then
    create trigger trg_hosp_cotacoes_updated_at before update on public.hospedagem_cotacoes for each row execute function public.hospedagem_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_hosp_extras_updated_at') then
    create trigger trg_hosp_extras_updated_at before update on public.hospedagem_custos_extras for each row execute function public.hospedagem_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_hosp_docs_updated_at') then
    create trigger trg_hosp_docs_updated_at before update on public.hospedagem_documentos for each row execute function public.hospedagem_touch_updated_at();
  end if;
end $$;

alter table public.hospedagem_cotacoes enable row level security;
alter table public.hospedagem_custos_extras enable row level security;
alter table public.hospedagem_documentos enable row level security;
alter table public.hospedagem_mensagens enable row level security;

do $$
declare t text;
begin
  foreach t in array array['hospedagem_cotacoes','hospedagem_custos_extras','hospedagem_documentos','hospedagem_mensagens'] loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_auth_all', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hospedagem-documentos','hospedagem-documentos',true,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "hospedagem_documentos_public_read" on storage.objects;
create policy "hospedagem_documentos_public_read" on storage.objects for select to public using (bucket_id = 'hospedagem-documentos');

drop policy if exists "hospedagem_documentos_auth_insert" on storage.objects;
create policy "hospedagem_documentos_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'hospedagem-documentos');

drop policy if exists "hospedagem_documentos_auth_update" on storage.objects;
create policy "hospedagem_documentos_auth_update" on storage.objects for update to authenticated using (bucket_id = 'hospedagem-documentos') with check (bucket_id = 'hospedagem-documentos');

drop policy if exists "hospedagem_documentos_auth_delete" on storage.objects;
create policy "hospedagem_documentos_auth_delete" on storage.objects for delete to authenticated using (bucket_id = 'hospedagem-documentos');

create or replace view public.hospedagem_documentos_pendentes_lancamento as
select d.*, s.codigo, s.cidade, s.uf, s.cliente
from public.hospedagem_documentos d
left join public.hospedagem_solicitacoes s on s.id = d.solicitacao_id
where upper(d.tipo) = 'NFSE' and upper(d.status) not in ('LANCADO','DISPENSADO');

grant select on public.hospedagem_documentos_pendentes_lancamento to authenticated;
