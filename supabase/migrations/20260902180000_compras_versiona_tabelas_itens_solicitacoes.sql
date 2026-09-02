-- Fase 1 da organização do módulo de Compras (continuação da Fase 3 já feita em
-- 20260831214600_compras_status_check_constraint.sql).
--
-- compras_itens e compras_solicitacoes nunca tiveram CREATE TABLE versionado —
-- foram criadas direto no Supabase antes de existir controle de migration neste
-- repositório. Esta migration só traz as duas tabelas (colunas, índices,
-- triggers, policies) para dentro do controle de versão, espelhando
-- exatamente o que já existe em produção — nenhuma mudança de comportamento.
--
-- Todos os comandos são idempotentes (IF NOT EXISTS / DROP...CREATE guardado)
-- porque as tabelas já existem com dados reais.

create table if not exists public.compras_solicitacoes (
  id uuid not null default gen_random_uuid(),
  data_solicitacao date not null,
  solicitante text,
  item text,
  quantidade numeric(14,2),
  prioridade text default 'normal'::text,
  status text not null default 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  coordenacao text,
  solicitante_id uuid,
  tipo_solicitacao text,
  fornecedor text,
  telefone_fornecedor text,
  updated_at timestamp with time zone default now(),
  supervisao text,
  colaborador_id text,
  colaborador_nome text,
  constraint compras_solicitacoes_pkey primary key (id),
  constraint compras_solicitacoes_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null
);

create table if not exists public.compras_itens (
  id uuid not null default gen_random_uuid(),
  solicitacao_id uuid not null,
  unidade numeric not null default 1,
  quantidade numeric not null default 1,
  material text not null,
  tipo text,
  tamanho text,
  colaborador_id text,
  colaborador_nome text,
  colaborador_tipo text,
  uniforme_cor text,
  status text not null default 'pendente'::text,
  valor_unitario numeric,
  valor_total numeric,
  forma_pagamento text,
  dados_pagamento text,
  boleto_url text,
  chave_pix text,
  link_pagamento text,
  comprovante_url text,
  nf_url text,
  marca text,
  mensagem_aprovacao text,
  aprovado_por text,
  aprovado_em timestamp with time zone,
  recusado_por text,
  motivo_recusa text,
  comprado_em timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  nf_lancado boolean not null default false,
  nf_lancado_em timestamp with time zone,
  regional text,
  colaborador_cpf text,
  colaborador_rg text,
  colaborador_data_nascimento date,
  colaborador_funcao text,
  colaborador_cargo text,
  colaborador_setor text,
  colaborador_supervisao text,
  colaborador_coordenacao text,
  colaborador_data_admissao date,
  ca text,
  fornecedor text,
  nf_lembrete_enviado_em timestamp with time zone,
  constraint compras_itens_pkey primary key (id),
  constraint compras_itens_solicitacao_id_fkey foreign key (solicitacao_id) references public.compras_solicitacoes(id) on delete cascade
);

create index if not exists idx_compras_solicitacoes_data on public.compras_solicitacoes using btree (data_solicitacao desc);
create index if not exists idx_compras_solicitacoes_status on public.compras_solicitacoes using btree (status);
create index if not exists idx_compras_solicitacoes_tipo_status on public.compras_solicitacoes using btree (tipo_solicitacao, status);

create index if not exists idx_compras_itens_colaborador_nome on public.compras_itens using btree (colaborador_nome);
create index if not exists idx_compras_itens_colaborador_supervisao on public.compras_itens using btree (colaborador_supervisao);
create index if not exists idx_compras_itens_solicitacao_id on public.compras_itens using btree (solicitacao_id);
create index if not exists idx_compras_itens_status on public.compras_itens using btree (status);

alter table public.compras_solicitacoes enable row level security;
alter table public.compras_itens enable row level security;

drop trigger if exists trg_compras_solicitacoes_updated_at on public.compras_solicitacoes;
create trigger trg_compras_solicitacoes_updated_at before update on public.compras_solicitacoes
  for each row execute function set_updated_at();

drop trigger if exists trg_compras_itens_updated_at on public.compras_itens;
create trigger trg_compras_itens_updated_at before update on public.compras_itens
  for each row execute function set_updated_at();

drop trigger if exists compras_itens_status_sync on public.compras_itens;
create trigger compras_itens_status_sync after insert or update of status on public.compras_itens
  for each row when (new.solicitacao_id is not null) execute function sync_compras_solicitacao_status();

-- trg_auditoria é recriado com o rótulo correto ('compras', não 'notas-fiscais')
-- na migration seguinte (20260902181500), junto com a correção do índice
-- duplicado — não recriamos aqui pra manter esta migration só de "versionar
-- sem mudar nada".
drop trigger if exists trg_auditoria on public.compras_itens;
create trigger trg_auditoria after insert or delete or update on public.compras_itens
  for each row execute function fn_registrar_auditoria('notas-fiscais');

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_itens' and policyname='authenticated_all_compras_itens') then
    create policy authenticated_all_compras_itens on public.compras_itens as permissive for all to authenticated using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_solicitacoes' and policyname='authenticated delete compras_solicitacoes') then
    create policy "authenticated delete compras_solicitacoes" on public.compras_solicitacoes as permissive for delete to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_solicitacoes' and policyname='authenticated insert compras_solicitacoes') then
    create policy "authenticated insert compras_solicitacoes" on public.compras_solicitacoes as permissive for insert to authenticated with check (((select auth.uid()) = created_by) or (created_by is null));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_solicitacoes' and policyname='authenticated read compras_solicitacoes') then
    create policy "authenticated read compras_solicitacoes" on public.compras_solicitacoes as permissive for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_solicitacoes' and policyname='authenticated update compras_solicitacoes') then
    create policy "authenticated update compras_solicitacoes" on public.compras_solicitacoes as permissive for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_solicitacoes' and policyname='authenticated_all_compras_solicitacoes') then
    create policy authenticated_all_compras_solicitacoes on public.compras_solicitacoes as permissive for all to authenticated using (true) with check (true);
  end if;
end $$;
