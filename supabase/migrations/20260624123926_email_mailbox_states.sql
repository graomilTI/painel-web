-- Central de E-mails: checkpoint por pasta IMAP.
--
-- Em IMAP o UID e o UIDVALIDITY pertencem a cada mailbox. Usar apenas
-- email_accounts.ultima_uid fazia o worker ler somente uma pasta e ainda podia
-- confundir UIDs quando a conta tivesse filtros/pastas no cPanel.

create table if not exists public.email_mailbox_states (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  mailbox_path text not null,
  uid_validity text,
  ultima_uid bigint not null default 0,
  ultima_sync_em timestamptz,
  ultima_sync_status text,
  ultima_sync_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, mailbox_path)
);

create index if not exists idx_email_mailbox_states_account
  on public.email_mailbox_states(account_id);

alter table public.email_mailbox_states enable row level security;
