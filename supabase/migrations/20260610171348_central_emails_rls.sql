alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_attachments enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_regras enable row level security;
alter table public.email_historico enable row level security;

create policy "email_accounts_auth" on public.email_accounts
  for all to authenticated using (true) with check (true);

create policy "email_messages_auth" on public.email_messages
  for all to authenticated using (true) with check (true);

create policy "email_attachments_auth" on public.email_attachments
  for all to authenticated using (true) with check (true);

create policy "email_outbox_auth" on public.email_outbox
  for all to authenticated using (true) with check (true);

create policy "email_regras_auth" on public.email_regras
  for all to authenticated using (true) with check (true);

create policy "email_historico_auth" on public.email_historico
  for all to authenticated using (true) with check (true);
;
