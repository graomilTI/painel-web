-- Frotas > Rastreadores > Agenda: assinatura (feed .ics) para sincronizar com o Google Agenda.
-- Cada usuário que quiser tem um link pessoal e secreto (token); quem tem o link lê a agenda, então o token
-- é gerado e entregue só pela Edge Function frotas-agenda-ics (service role) para quem tem acesso a Rastreadores.
-- RLS ligado e SEM policies: o cliente nunca lê nem escreve esta tabela direto.
create table if not exists public.frotas_agenda_assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique,
  criado_em timestamptz not null default now(),
  renovado_em timestamptz,
  ultimo_acesso_em timestamptz,
  acessos integer not null default 0
);

alter table public.frotas_agenda_assinaturas enable row level security;
revoke all on public.frotas_agenda_assinaturas from anon, authenticated;

comment on table public.frotas_agenda_assinaturas is 'Link pessoal (token) do feed .ics da Agenda de Rastreadores. Só a Edge Function frotas-agenda-ics acessa.';
