-- Frotas · Cadastros · Checklist: histórico das notificações ao condutor pedindo a atualização do checklist.
--
-- O botão "Notificar" da lista monta a mensagem de WhatsApp (como em Multas) e, ao copiar ou abrir o WhatsApp,
-- registra aqui quem foi avisado, para a lista mostrar "Notificado em ..." e a equipe não avisar duas vezes sem querer.

create table if not exists public.frotas_checklist_notificacoes (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  motorista text,
  telefone text,
  mensagem text,
  acao text not null check (acao in ('copiada', 'whatsapp')),
  data_ultimo_checklist date,
  usuario_nome text,
  criado_em timestamptz not null default now()
);

comment on table public.frotas_checklist_notificacoes is
  'Notificações (WhatsApp) ao condutor para atualizar o checklist do veículo. acao: copiada = mensagem copiada; whatsapp = aberta no WhatsApp.';

create index if not exists frotas_checklist_notificacoes_placa_idx
  on public.frotas_checklist_notificacoes (placa, criado_em desc);

alter table public.frotas_checklist_notificacoes enable row level security;

drop policy if exists frotas_checklist_notificacoes_select on public.frotas_checklist_notificacoes;
create policy frotas_checklist_notificacoes_select
  on public.frotas_checklist_notificacoes
  for select to authenticated
  using ((select public.frotas_usuario_tem_acesso()));

drop policy if exists frotas_checklist_notificacoes_insert on public.frotas_checklist_notificacoes;
create policy frotas_checklist_notificacoes_insert
  on public.frotas_checklist_notificacoes
  for insert to authenticated
  with check ((select public.frotas_usuario_tem_acesso()));

revoke all on public.frotas_checklist_notificacoes from anon, authenticated;
grant select, insert on public.frotas_checklist_notificacoes to authenticated;
grant all on public.frotas_checklist_notificacoes to service_role;
