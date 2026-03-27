
-- =========================================================
-- PAINEL WEB + SUPABASE
-- Estrutura base para ligar o frontend já criado
-- Rode este arquivo no SQL Editor do Supabase
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- PERFIS / PERMISSÕES
-- ---------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text default 'user',
  department_id uuid references public.departments (id) on delete set null,
  active boolean not null default true,
  is_master boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_modules (
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_code text not null references public.modules (code) on delete cascade,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, module_code)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.touch_profile_updated_at();

insert into public.modules (code, name) values
  ('DASHBOARD', 'Dashboard'),
  ('NOTIFICACOES', 'Notificações'),
  ('HISTORICO_GERAL', 'Histórico Geral'),
  ('PROGRAMACAO', 'Programação'),
  ('HOSPEDAGEM', 'Hospedagem'),
  ('COMPRAS', 'Compras'),
  ('LOGISTICA', 'Logística'),
  ('PATRIMONIOS', 'Patrimônios'),
  ('CONTATO_CLIENTE', 'Contato Cliente'),
  ('ADM_CONFERENCIA', 'Conferência'),
  ('ADM_HOTEL', 'Hotel'),
  ('COMPRAS_ADM', 'Compras'),
  ('FINANCEIRO', 'Financeiro'),
  ('PATRIMONIO_ADM', 'Patrimônio'),
  ('LOGISTICA_ADM', 'Logística'),
  ('RH_FERIAS_ATESTADOS', 'Férias e Atestados'),
  ('RH_HIST_INDISP', 'Histórico de Indisponibilidade'),
  ('BASE_COLAB_IMPORT', 'Importar Colaboradores'),
  ('BASE_COLAB_HIST', 'Histórico de Importações'),
  ('BASE_COLAB_CONSULTA', 'Consultar Base'),
  ('PRODUCAO_IMPORT', 'Importar Produção'),
  ('PRODUCAO_HIST', 'Histórico Produção'),
  ('EFETIVOS_ZERO', 'Efetivos sem Produção')
on conflict (code) do update set name = excluded.name;

create or replace function public.get_user_context(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with u as (
    select
      p.id,
      p.full_name,
      p.email,
      p.role,
      p.active,
      p.is_master,
      d.id as department_id,
      d.name as department_name
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.id = p_user_id
  ),
  mods as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', m.code,
          'name', m.name,
          'can_view', coalesce(um.can_view, false),
          'can_edit', coalesce(um.can_edit, false)
        )
        order by m.name
      ),
      '[]'::jsonb
    ) as modules
    from public.modules m
    left join public.user_modules um
      on um.module_code = m.code
     and um.user_id = p_user_id
  )
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'name', coalesce(u.full_name, u.email, 'Usuário'),
      'email', u.email,
      'role', coalesce(u.role, 'user'),
      'active', coalesce(u.active, false),
      'is_master', coalesce(u.is_master, false)
    ),
    'department', case
      when u.department_id is null then null
      else jsonb_build_object('id', u.department_id, 'name', u.department_name)
    end,
    'modules', mods.modules
  )
  from u cross join mods;
$$;

grant execute on function public.get_user_context(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- BASE DE COLABORADORES
-- ---------------------------------------------------------

create table if not exists public.colaborador_importacoes (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  arquivo_nome text,
  origem text default 'upload_manual',
  importado_por uuid references public.profiles (id) on delete set null,
  status text not null default 'processando',
  total_linhas integer not null default 0,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_colaborador_importacoes_data_ref
  on public.colaborador_importacoes (data_referencia desc);

create table if not exists public.colaborador_snapshot (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid references public.colaborador_importacoes (id) on delete cascade,
  data_referencia date not null,
  cpf text,
  nome text,
  situacao text,
  admissao date,
  desligamento date,
  salario numeric(14,2),
  conta_bancaria text,
  empresa text,
  coordenacao text,
  supervisao text,
  tipo text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  complemento text,
  data_nascimento date,
  cargo text,
  whatsapp text,
  email_pessoal text,
  email_empresa text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_colab_snapshot_data_ref
  on public.colaborador_snapshot (data_referencia desc);
create index if not exists idx_colab_snapshot_cpf
  on public.colaborador_snapshot (cpf);
create index if not exists idx_colab_snapshot_nome
  on public.colaborador_snapshot (nome);

-- ---------------------------------------------------------
-- PRODUÇÃO
-- ---------------------------------------------------------

create table if not exists public.producao_importacoes (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  arquivo_nome text,
  origem text default 'upload_manual',
  importado_por uuid references public.profiles (id) on delete set null,
  status text not null default 'processando',
  total_linhas integer not null default 0,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_producao_importacoes_data_ref
  on public.producao_importacoes (data_referencia desc);

create table if not exists public.producao_snapshot (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid references public.producao_importacoes (id) on delete cascade,
  data_referencia date not null,
  coordenacao text,
  supervisao text,
  funcionario text,
  tipo text,
  data date,
  os text,
  cliente text,
  servico text,
  cidade text,
  local_embarque text,
  checkin text,
  checkout text,
  cargas numeric(14,2),
  tons numeric(14,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_producao_snapshot_data_ref
  on public.producao_snapshot (data_referencia desc);
create index if not exists idx_producao_snapshot_funcionario
  on public.producao_snapshot (funcionario);

-- ---------------------------------------------------------
-- RH / INDISPONIBILIDADE
-- ---------------------------------------------------------

create table if not exists public.indisponibilidades (
  id uuid primary key default gen_random_uuid(),
  colaborador_nome text not null,
  colaborador_cpf text,
  data_inicio date not null,
  data_fim date,
  motivo text,
  observacoes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_indisponibilidades_periodo
  on public.indisponibilidades (data_inicio desc, data_fim desc);

-- ---------------------------------------------------------
-- RELATÓRIOS AUXILIARES
-- ---------------------------------------------------------

create table if not exists public.efetivos_sem_producao (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  colaborador text,
  coordenacao text,
  supervisao text,
  cargo text,
  tipo text,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_efetivos_sem_producao_data
  on public.efetivos_sem_producao (data_referencia desc);

create table if not exists public.excecoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  motivo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.modules enable row level security;
alter table public.user_modules enable row level security;
alter table public.colaborador_importacoes enable row level security;
alter table public.colaborador_snapshot enable row level security;
alter table public.producao_importacoes enable row level security;
alter table public.producao_snapshot enable row level security;
alter table public.indisponibilidades enable row level security;
alter table public.efetivos_sem_producao enable row level security;
alter table public.excecoes enable row level security;

-- leitura autenticada
drop policy if exists "authenticated read departments" on public.departments;
create policy "authenticated read departments" on public.departments
for select to authenticated using (true);

drop policy if exists "authenticated read modules" on public.modules;
create policy "authenticated read modules" on public.modules
for select to authenticated using (true);

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
for select to authenticated using (auth.uid() = id);

drop policy if exists "users update own profile basic" on public.profiles;
create policy "users update own profile basic" on public.profiles
for update to authenticated using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "authenticated read user_modules" on public.user_modules;
create policy "authenticated read user_modules" on public.user_modules
for select to authenticated using (auth.uid() = user_id);

-- dados operacionais
drop policy if exists "authenticated read colaborador_importacoes" on public.colaborador_importacoes;
create policy "authenticated read colaborador_importacoes" on public.colaborador_importacoes
for select to authenticated using (true);

drop policy if exists "authenticated insert colaborador_importacoes" on public.colaborador_importacoes;
create policy "authenticated insert colaborador_importacoes" on public.colaborador_importacoes
for insert to authenticated with check (auth.uid() = importado_por);

drop policy if exists "authenticated update colaborador_importacoes" on public.colaborador_importacoes;
create policy "authenticated update colaborador_importacoes" on public.colaborador_importacoes
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated read colaborador_snapshot" on public.colaborador_snapshot;
create policy "authenticated read colaborador_snapshot" on public.colaborador_snapshot
for select to authenticated using (true);

drop policy if exists "authenticated insert colaborador_snapshot" on public.colaborador_snapshot;
create policy "authenticated insert colaborador_snapshot" on public.colaborador_snapshot
for insert to authenticated with check (true);

drop policy if exists "authenticated read producao_importacoes" on public.producao_importacoes;
create policy "authenticated read producao_importacoes" on public.producao_importacoes
for select to authenticated using (true);

drop policy if exists "authenticated insert producao_importacoes" on public.producao_importacoes;
create policy "authenticated insert producao_importacoes" on public.producao_importacoes
for insert to authenticated with check (auth.uid() = importado_por);

drop policy if exists "authenticated update producao_importacoes" on public.producao_importacoes;
create policy "authenticated update producao_importacoes" on public.producao_importacoes
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated read producao_snapshot" on public.producao_snapshot;
create policy "authenticated read producao_snapshot" on public.producao_snapshot
for select to authenticated using (true);

drop policy if exists "authenticated insert producao_snapshot" on public.producao_snapshot;
create policy "authenticated insert producao_snapshot" on public.producao_snapshot
for insert to authenticated with check (true);

drop policy if exists "authenticated read indisponibilidades" on public.indisponibilidades;
create policy "authenticated read indisponibilidades" on public.indisponibilidades
for select to authenticated using (true);

drop policy if exists "authenticated insert indisponibilidades" on public.indisponibilidades;
create policy "authenticated insert indisponibilidades" on public.indisponibilidades
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "authenticated read efetivos_sem_producao" on public.efetivos_sem_producao;
create policy "authenticated read efetivos_sem_producao" on public.efetivos_sem_producao
for select to authenticated using (true);

drop policy if exists "authenticated insert efetivos_sem_producao" on public.efetivos_sem_producao;
create policy "authenticated insert efetivos_sem_producao" on public.efetivos_sem_producao
for insert to authenticated with check (true);

drop policy if exists "authenticated delete efetivos_sem_producao" on public.efetivos_sem_producao;
create policy "authenticated delete efetivos_sem_producao" on public.efetivos_sem_producao
for delete to authenticated using (true);

drop policy if exists "authenticated read excecoes" on public.excecoes;
create policy "authenticated read excecoes" on public.excecoes
for select to authenticated using (true);

-- ---------------------------------------------------------
-- EXEMPLO: liberar tudo para um usuário master já criado
-- Troque o e-mail abaixo pelo seu usuário real, se quiser
-- ---------------------------------------------------------
-- update public.profiles
--    set is_master = true,
--        role = 'master',
--        active = true
--  where email = 'seu-email@empresa.com';

-- Se não quiser usar master, vincule permissões assim:
-- insert into public.user_modules (user_id, module_code, can_view, can_edit)
-- select 'UUID_DO_USUARIO', code, true, true
-- from public.modules
-- on conflict (user_id, module_code) do update
-- set can_view = excluded.can_view,
--     can_edit = excluded.can_edit;
