-- Uso de veículo fora do expediente: ocorrências consolidadas e fila de Caixa.
-- Aplicado em produção em 18/09/2026.

create table if not exists public.frotas_fora_horario_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  data_evento date not null,
  placa text not null,
  motorista text,
  patrimonio_id uuid,
  patrimonio_codigo text,
  coordenacao text,
  supervisao text,
  hora_inicio text,
  hora_fim text,
  km_00_05 numeric(12,3) not null default 0,
  valor_km numeric(10,2) not null default 4.00,
  valor_caixa numeric(12,2) generated always as (round(km_00_05 * valor_km, 2)) stored,
  endereco_inicio text,
  endereco_fim text,
  latitude_inicio numeric,
  longitude_inicio numeric,
  latitude_fim numeric,
  longitude_fim numeric,
  mapa_url text,
  status_calculo text not null default 'PENDENTE',
  fonte_calculo text,
  calculo_detalhes jsonb not null default '{}'::jsonb,
  status_notificacao text not null default 'PENDENTE',
  mensagem_gerada text,
  gerado_em timestamptz,
  gerado_por uuid,
  gerado_por_nome text,
  justificativa text,
  justificado_em timestamptz,
  justificado_por uuid,
  justificado_por_nome text,
  status_caixa text not null default 'NAO_SOLICITADO',
  caixa_solicitado_em timestamptz,
  caixa_solicitado_por uuid,
  caixa_solicitado_por_nome text,
  caixa_lancamento_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frotas_fora_horario_ocorrencias_un unique (data_evento, placa),
  constraint frotas_fora_horario_status_calculo_chk check (status_calculo in ('PENDENTE','OK','FALLBACK_RELATORIO','SEM_HISTORICO','ERRO')),
  constraint frotas_fora_horario_status_notificacao_chk check (status_notificacao in ('PENDENTE','GERADA','JUSTIFICADA')),
  constraint frotas_fora_horario_status_caixa_chk check (status_caixa in ('NAO_SOLICITADO','PENDENTE','PROCESSANDO','LANCADO','ERRO','CANCELADO')),
  constraint frotas_fora_horario_km_chk check (km_00_05 >= 0),
  constraint frotas_fora_horario_valor_km_chk check (valor_km >= 0)
);

create index if not exists frotas_fora_horario_ocorrencias_data_idx
  on public.frotas_fora_horario_ocorrencias (data_evento desc, hora_inicio desc);

create index if not exists frotas_fora_horario_ocorrencias_status_idx
  on public.frotas_fora_horario_ocorrencias (status_notificacao, status_caixa, data_evento desc);

create table if not exists public.frotas_fora_horario_caixa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.frotas_fora_horario_ocorrencias(id) on delete restrict,
  data_evento date not null,
  placa text not null,
  colaborador_nome text not null,
  nome_normalizado text not null,
  km_00_05 numeric(12,3) not null,
  valor_km numeric(10,2) not null default 4.00,
  valor numeric(12,2) not null,
  descricao text not null,
  status text not null default 'PENDENTE',
  tentativas integer not null default 0,
  ultimo_erro text,
  grm_retorno jsonb,
  solicitado_por uuid,
  solicitado_por_nome text,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  processado_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint frotas_fora_horario_caixa_ocorrencia_un unique (ocorrencia_id),
  constraint frotas_fora_horario_caixa_status_chk check (status in ('PENDENTE','PROCESSANDO','LANCADO','ERRO','CANCELADO')),
  constraint frotas_fora_horario_caixa_km_chk check (km_00_05 > 0),
  constraint frotas_fora_horario_caixa_valor_chk check (valor >= 0)
);

create index if not exists frotas_fora_horario_caixa_status_idx
  on public.frotas_fora_horario_caixa_lancamentos (status, solicitado_em);

alter table public.frotas_fora_horario_ocorrencias enable row level security;
alter table public.frotas_fora_horario_caixa_lancamentos enable row level security;

drop policy if exists frotas_fora_horario_ocorrencias_authenticated_select
  on public.frotas_fora_horario_ocorrencias;
create policy frotas_fora_horario_ocorrencias_authenticated_select
  on public.frotas_fora_horario_ocorrencias
  for select to authenticated using (true);

drop policy if exists frotas_fora_horario_caixa_authenticated_select
  on public.frotas_fora_horario_caixa_lancamentos;
create policy frotas_fora_horario_caixa_authenticated_select
  on public.frotas_fora_horario_caixa_lancamentos
  for select to authenticated using (true);

revoke all on table public.frotas_fora_horario_ocorrencias from anon;
revoke all on table public.frotas_fora_horario_caixa_lancamentos from anon;
grant select on table public.frotas_fora_horario_ocorrencias to authenticated;
grant select on table public.frotas_fora_horario_caixa_lancamentos to authenticated;
grant select, insert, update, delete on table public.frotas_fora_horario_ocorrencias to service_role;
grant select, insert, update, delete on table public.frotas_fora_horario_caixa_lancamentos to service_role;

create or replace function public.frotas_fora_horario_sync_caixa_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.frotas_fora_horario_ocorrencias
     set status_caixa = new.status,
         caixa_lancamento_id = new.id,
         updated_at = now()
   where id = new.ocorrencia_id;
  return new;
end;
$$;

drop trigger if exists trg_frotas_fora_horario_sync_caixa_status
  on public.frotas_fora_horario_caixa_lancamentos;

create trigger trg_frotas_fora_horario_sync_caixa_status
after insert or update of status on public.frotas_fora_horario_caixa_lancamentos
for each row execute function public.frotas_fora_horario_sync_caixa_status();

revoke all on function public.frotas_fora_horario_sync_caixa_status() from public, anon, authenticated;
grant execute on function public.frotas_fora_horario_sync_caixa_status() to service_role;
