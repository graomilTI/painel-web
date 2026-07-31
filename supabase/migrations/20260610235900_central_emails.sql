-- Central de E-mails: leitura IMAP/SMTP cPanel + triagem por IA/regras

create extension if not exists pgcrypto;

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  provider text not null default 'CPANEL',
  imap_host text not null default 'mail.grao1000.com.br',
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  smtp_host text not null default 'mail.grao1000.com.br',
  smtp_port integer not null default 465,
  smtp_secure boolean not null default true,
  username text not null,
  password_cipher text not null,
  pasta_entrada text not null default 'INBOX',
  pasta_processados text,
  ativo boolean not null default true,
  auto_responder boolean not null default false,
  limite_por_sync integer not null default 30,
  ultima_uid bigint default 0,
  ultima_sync_em timestamptz,
  ultima_sync_status text,
  ultima_sync_erro text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  uid bigint,
  message_id text not null,
  in_reply_to text,
  references_header text,
  remetente_nome text,
  remetente_email text,
  destinatario text,
  cc text,
  assunto text,
  corpo_texto text,
  corpo_html text,
  data_recebimento timestamptz,
  regional text,
  categoria text,
  prioridade text not null default 'NORMAL' check (prioridade in ('BAIXA','NORMAL','ALTA','URGENTE')),
  resumo_ia text,
  dados_detectados jsonb not null default '{}'::jsonb,
  precisa_resposta boolean not null default false,
  resposta_sugerida text,
  status text not null default 'NOVO' check (status in ('NOVO','PENDENTE','RESPONDER','RESPONDIDO','RESOLVIDO','ARQUIVADO','IGNORADO','ERRO')),
  responsavel_id uuid,
  responsavel_nome text,
  classificado_por text default 'worker',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, message_id)
);

create index if not exists idx_email_messages_status on public.email_messages(status);
create index if not exists idx_email_messages_data on public.email_messages(data_recebimento desc);
create index if not exists idx_email_messages_account_uid on public.email_messages(account_id, uid desc);
create index if not exists idx_email_messages_regional_categoria on public.email_messages(regional, categoria);

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.email_messages(id) on delete cascade,
  nome_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  storage_bucket text not null default 'email-anexos',
  storage_path text,
  content_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references public.email_messages(id) on delete set null,
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  para text not null,
  cc text,
  bcc text,
  assunto text not null,
  corpo text not null,
  status text not null default 'PENDENTE' check (status in ('RASCUNHO','PENDENTE','ENVIANDO','ENVIADO','ERRO','CANCELADO')),
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  enviado_em timestamptz,
  smtp_message_id text,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_outbox_status on public.email_outbox(status, created_at);

create table if not exists public.email_regras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  prioridade integer not null default 100,
  palavras_chave text[] not null default '{}',
  remetente_contem text,
  assunto_contem text,
  regional text,
  categoria text,
  prioridade_email text check (prioridade_email is null or prioridade_email in ('BAIXA','NORMAL','ALTA','URGENTE')),
  precisa_resposta boolean,
  resposta_modelo text,
  auto_responder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_historico (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references public.email_messages(id) on delete cascade,
  outbox_id uuid references public.email_outbox(id) on delete set null,
  usuario_id uuid,
  usuario_nome text,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.email_regras (nome, prioridade, palavras_chave, categoria, prioridade_email, precisa_resposta, resposta_modelo)
values
  ('Notas fiscais e XML', 10, array['nf-e','nfe','nfs-e','nfse','xml','danfe','nota fiscal','chave de acesso'], 'NOTAS FISCAIS', 'NORMAL', true, 'Bom dia! Recebemos a documentação fiscal e vamos realizar a conferência interna. Retornaremos caso seja necessário algum ajuste.'),
  ('Financeiro / comprovantes', 20, array['boleto','pagamento','comprovante','pix','vencimento','cobrança','cobranca'], 'FINANCEIRO', 'NORMAL', true, 'Bom dia! Recebemos sua mensagem e vamos conferir as informações de pagamento. Retornaremos em caso de divergência.'),
  ('Logística / OS / contrato', 30, array['os','o.s','ordem de serviço','contrato','embarque','carga','btg','p33004','programação','programacao'], 'LOGÍSTICA', 'ALTA', true, 'Bom dia! Recebemos a solicitação e vamos conferir as informações de logística/OS. Assim que validado internamente, retornaremos com a confirmação.'),
  ('Frotas / multas / placa', 40, array['multa','infração','infracao','detran','placa','veículo','veiculo','renavam'], 'FROTAS', 'ALTA', true, 'Bom dia! Recebemos a solicitação referente a frotas e vamos realizar a conferência interna.'),
  ('RH', 50, array['atestado','admissão','admissao','rescisão','rescisao','holerite','funcionário','funcionario','colaborador'], 'RH', 'ALTA', true, 'Bom dia! Recebemos sua solicitação e vamos encaminhar para conferência do RH.')
on conflict do nothing;

insert into public.modules (code, name, area, active)
values ('emails', 'Central de E-mails', 'TI', true)
on conflict (code) do update set name = excluded.name, area = excluded.area, active = true;

insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
values ('emails', 'Central de E-mails', 'TI', 'mail', 'emails', 65, true)
on conflict (codigo) do update set nome = excluded.nome, categoria = excluded.categoria, rota = excluded.rota, ativo = true, updated_at = now();

-- Libera para perfis administrativos já existentes. Ajuste manualmente em Usuários e Acessos se necessário.
insert into public.user_modules (user_id, module_code, can_view, can_edit)
select p.id, 'emails', true, p.is_master or p.can_manage_settings or p.can_manage_modules
from public.profiles p
where p.is_master = true or p.can_manage_settings = true or p.can_manage_modules = true
on conflict (user_id, module_code) do nothing;

-- Bucket privado para anexos dos e-mails.
insert into storage.buckets (id, name, public)
values ('email-anexos', 'email-anexos', false)
on conflict (id) do nothing;

create or replace view public.email_accounts_public as
select
  id, nome, email, provider,
  imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure,
  username, pasta_entrada, pasta_processados,
  ativo, auto_responder, limite_por_sync,
  ultima_uid, ultima_sync_em, ultima_sync_status, ultima_sync_erro,
  criado_por, criado_por_nome, created_at, updated_at
from public.email_accounts;

-- Evita expor a senha via API pública. O painel usa a view acima para leitura.
revoke select on table public.email_accounts from anon, authenticated;
grant select on public.email_accounts_public to anon, authenticated;
grant insert, update on public.email_accounts to authenticated;

-- Garantia extra para aparecer no sidebar/permissões do painel novo (app_*).
insert into public.app_perfil_modulo (perfil_id, modulo_id, pode_ver, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select p.id, m.id, true, true, true, false, false
from public.app_perfis p
cross join public.app_modulos m
where m.codigo = 'emails'
  and upper(coalesce(p.codigo, p.nome)) in ('MASTER', 'ADMIN', 'ADM', 'TI')
  and not exists (
    select 1
    from public.app_perfil_modulo apm
    where apm.perfil_id = p.id
      and apm.modulo_id = m.id
  );

insert into public.app_usuario_modulos (usuario_id, modulo_id)
select u.id, m.id
from public.app_usuarios u
cross join public.app_modulos m
where m.codigo = 'emails'
  and (
    upper(coalesce(u.setor, '')) = 'TI'
    or exists (
      select 1
      from public.app_perfis p
      where p.id = u.perfil_id
        and upper(coalesce(p.codigo, p.nome)) in ('MASTER', 'ADMIN', 'ADM', 'TI')
    )
  )
  and not exists (
    select 1
    from public.app_usuario_modulos aum
    where aum.usuario_id = u.id
      and aum.modulo_id = m.id
  );
