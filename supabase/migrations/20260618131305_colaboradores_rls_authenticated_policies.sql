create policy colaboradores_select_authenticated on public.colaboradores
  for select to authenticated using (true);
create policy colaboradores_insert_authenticated on public.colaboradores
  for insert to authenticated with check (true);
create policy colaboradores_update_authenticated on public.colaboradores
  for update to authenticated using (true) with check (true);;
