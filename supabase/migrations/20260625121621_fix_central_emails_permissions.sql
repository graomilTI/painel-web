grant select on public.email_accounts to anon, authenticated;

alter table public.email_mailbox_states enable row level security;

create policy email_mailbox_states_auth
  on public.email_mailbox_states
  for all
  to authenticated
  using (true)
  with check (true);;
