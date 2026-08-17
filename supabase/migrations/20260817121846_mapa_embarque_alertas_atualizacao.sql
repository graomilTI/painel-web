create table if not exists public.mapa_embarque_alertas_atualizacao (
  id uuid primary key default gen_random_uuid(),
  os text not null,
  data_mapa date not null,
  informativo_em timestamptz not null,
  colaborador_nome text not null,
  colaborador_cpf text,
  telefone text,
  status text not null default 'pendente'
    check (status in ('pendente','alertado','respondido','encerrado','sem_contato','erro')),
  alertado_em timestamptz,
  respondido_em timestamptz,
  resposta text,
  silenciado_em timestamptz,
  silenciado_data date,
  external_message_id text,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (os, informativo_em)
);

create index if not exists idx_mapa_embarque_alertas_telefone_status
  on public.mapa_embarque_alertas_atualizacao (telefone, status, alertado_em desc)
  where telefone is not null;

create index if not exists idx_mapa_embarque_alertas_os_encerrado
  on public.mapa_embarque_alertas_atualizacao (os, silenciado_data desc)
  where status = 'encerrado';

alter table public.mapa_embarque_alertas_atualizacao enable row level security;
revoke all on table public.mapa_embarque_alertas_atualizacao from anon, authenticated;

comment on table public.mapa_embarque_alertas_atualizacao is
  'Controle idempotente dos alertas de informativo do Mapa de Embarque com mais de duas horas sem atualização.';
