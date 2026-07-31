-- Compatibilidade para ambientes/branches Supabase criados apenas pelas migrations.
-- A tabela app_modulos existia no projeto principal, mas não estava versionada antes
-- desta migration. Em branches novas, o INSERT abaixo falhava com SQLSTATE 42P01.
create extension if not exists pgcrypto;

create table if not exists public.app_modulos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  categoria text,
  rota text,
  icone text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Módulo BTG no menu Logística.
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values ('logistica_btg', 'BTG', 'LOGÍSTICA', 'btg-logistica', 915, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  updated_at = now();
