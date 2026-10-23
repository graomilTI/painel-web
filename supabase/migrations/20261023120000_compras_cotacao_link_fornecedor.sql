-- Cotação por link: Compras gera um link com os itens escolhidos, envia ao fornecedor e as respostas voltam ao painel.
--   compras_cotacao_links            -> o link (uma rodada; aceita vários fornecedores)
--   compras_cotacao_itens            -> itens que entram no link
--   compras_cotacao_respostas        -> uma resposta por fornecedor (CNPJ) no link
--   compras_cotacao_resposta_itens   -> valor unitário por item (nulo = "Não possuo")
-- O fornecedor não tem login: o acesso público passa só pela Edge Function compras-cotacao-publica (service role).
-- (compras_cotacoes é uma tabela antiga, de outro desenho, e não é usada aqui.)

create table if not exists public.compras_cotacao_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  expira_em timestamptz not null default (now() + interval '7 days'),
  observacao text,
  criado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compras_cotacao_itens (
  cotacao_id uuid not null references public.compras_cotacao_links(id) on delete cascade,
  compra_item_id uuid not null references public.compras_itens(id) on delete cascade,
  primary key (cotacao_id, compra_item_id)
);
create index if not exists idx_compras_cotacao_itens_item on public.compras_cotacao_itens (compra_item_id);

create table if not exists public.compras_cotacao_respostas (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.compras_cotacao_links(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  razao_social text not null,
  emite_nf boolean not null,
  prazo_entrega text,
  formas_pagamento text[] not null default '{}',
  tem_desconto boolean not null default false,
  descontos jsonb not null default '[]'::jsonb,
  respondido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cotacao_id, cnpj)
);
create index if not exists idx_compras_cotacao_respostas_cotacao on public.compras_cotacao_respostas (cotacao_id);

create table if not exists public.compras_cotacao_resposta_itens (
  resposta_id uuid not null references public.compras_cotacao_respostas(id) on delete cascade,
  compra_item_id uuid not null references public.compras_itens(id) on delete cascade,
  valor_unitario numeric check (valor_unitario is null or valor_unitario >= 0),
  primary key (resposta_id, compra_item_id)
);
create index if not exists idx_compras_cotacao_resposta_itens_item on public.compras_cotacao_resposta_itens (compra_item_id);

-- Uma primeira versão desta migration apontava cotacao_id para a tabela antiga compras_cotacoes. Reaponta (tabelas vazias).
do $$
declare
  t text;
begin
  foreach t in array array['compras_cotacao_itens', 'compras_cotacao_respostas'] loop
    if exists (select 1 from pg_constraint where conname = t || '_cotacao_id_fkey' and conrelid = ('public.' || t)::regclass
               and confrelid = 'public.compras_cotacoes'::regclass) then
      execute format('alter table public.%I drop constraint %I', t, t || '_cotacao_id_fkey');
      execute format('alter table public.%I add constraint %I foreign key (cotacao_id) references public.compras_cotacao_links(id) on delete cascade', t, t || '_cotacao_id_fkey');
    end if;
  end loop;
end $$;

drop trigger if exists trg_compras_cotacao_links_updated_at on public.compras_cotacao_links;
create trigger trg_compras_cotacao_links_updated_at before update on public.compras_cotacao_links
  for each row execute function set_updated_at();

-- Painel (usuários logados): mesma regra das demais tabelas de Compras.
alter table public.compras_cotacao_links enable row level security;
alter table public.compras_cotacao_itens enable row level security;
alter table public.compras_cotacao_respostas enable row level security;
alter table public.compras_cotacao_resposta_itens enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['compras_cotacao_links', 'compras_cotacao_itens', 'compras_cotacao_respostas', 'compras_cotacao_resposta_itens'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated_all_' || t) then
      execute format('create policy %I on public.%I as permissive for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
    end if;
  end loop;
end $$;

-- Sem acesso direto para quem não está logado (o fornecedor entra só pela Edge Function).
revoke all on public.compras_cotacao_links, public.compras_cotacao_itens, public.compras_cotacao_respostas, public.compras_cotacao_resposta_itens from anon;
