-- Módulo PROPOSTAS
-- Geração e acompanhamento de propostas comerciais com link de proposta, aceite e contrato.

create extension if not exists pgcrypto;

create table if not exists public.propostas_comerciais (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  cliente text not null,
  status text not null default 'rascunho' check (status in ('rascunho','gerada','enviada','aceita','contrato','recusada')),
  tipo_modelo text not null default 'padrao',
  modelo_doc_id text not null default '1oXtCy8kAs9hfivR62JYKknjw7s0VKGeLvRkhSCN0Vzg',
  pasta_destino_id text not null default '13oHU_dFWBVe9h-YRk-ZmPTb1VoEWx0Pt',

  -- Colunas adicionais solicitadas
  link_proposta text,
  nome_contato text,
  email_contato text,
  whatsapp_contato text,
  data_aceite_proposta date,
  link_contrato text,

  -- Campos principais do modelo padrão
  estados text,
  data_proposta date default current_date,
  prazo_inicial date,
  prazo_final date,
  prazo_fatura text,
  prazo_pgto text,
  solicitante text,
  cargo text,
  telefone text,
  email text,

  -- Valores/serviços presentes nos marcadores do modelo atual
  tn text,
  cad text,
  aud text,
  quality text,
  intacta text,
  lacrar text,
  cif text,
  fob text,
  m_8h text,
  m_12h text,
  add_sup text,
  add_claf text,
  t_gmos text,
  t_gmoc text,
  t_aflas text,
  t_aflac text,
  t_don text,

  campos jsonb not null default '{}'::jsonb,
  observacao text,
  formato_ultima_geracao text,
  arquivo_drive_id text,
  arquivo_drive_nome text,
  gerada_em timestamptz,
  created_by uuid,
  created_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_propostas_comerciais_numero on public.propostas_comerciais(numero);
create index if not exists idx_propostas_comerciais_cliente on public.propostas_comerciais using gin (to_tsvector('portuguese', coalesce(cliente,'')));
create index if not exists idx_propostas_comerciais_status on public.propostas_comerciais(status);
create index if not exists idx_propostas_comerciais_created_at on public.propostas_comerciais(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_propostas_comerciais_updated_at on public.propostas_comerciais;
create trigger trg_propostas_comerciais_updated_at
before update on public.propostas_comerciais
for each row execute function public.set_updated_at();

alter table public.propostas_comerciais enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'propostas_comerciais'
      and policyname = 'propostas_comerciais_auth_all'
  ) then
    create policy propostas_comerciais_auth_all
      on public.propostas_comerciais
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- Registro tolerante do módulo no cadastro de permissões.
-- O bloco não quebra a migration caso a tabela app_modulos ainda não exista ou tenha schema diferente.
do $$
begin
  if to_regclass('public.app_modulos') is not null then
    begin
      insert into public.app_modulos (codigo, nome, descricao, rota, categoria, ordem, ativo)
      values ('propostas', 'Propostas', 'Geração de propostas comerciais', 'propostas', 'COMERCIAL', 10, true)
      on conflict (codigo) do update
        set nome = excluded.nome,
            descricao = excluded.descricao,
            rota = excluded.rota,
            categoria = excluded.categoria,
            ativo = excluded.ativo;
    exception
      when undefined_column then
        begin
          insert into public.app_modulos (code, name, description, route, category, "order", active)
          values ('propostas', 'Propostas', 'Geração de propostas comerciais', 'propostas', 'COMERCIAL', 10, true)
          on conflict (code) do update
            set name = excluded.name,
                description = excluded.description,
                route = excluded.route,
                category = excluded.category,
                active = excluded.active;
        exception
          when others then null;
        end;
      when others then null;
    end;
  end if;
end $$;
