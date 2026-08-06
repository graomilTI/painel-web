-- Tabelas do módulo Faturamento estavam com RLS habilitado e NENHUMA policy,
-- bloqueando 100% do acesso via API (o painel caía silenciosamente no modo localStorage).
-- Mesmo padrão de acesso authenticated usado no restante do sistema.

drop policy if exists faturamento_faturas_authenticated_all on public.faturamento_faturas;
create policy faturamento_faturas_authenticated_all on public.faturamento_faturas
  for all to authenticated using (true) with check (true);
drop policy if exists faturamento_clientes_authenticated_all on public.faturamento_clientes;
create policy faturamento_clientes_authenticated_all on public.faturamento_clientes
  for all to authenticated using (true) with check (true);
drop policy if exists faturamento_tarifas_authenticated_all on public.faturamento_tarifas;
create policy faturamento_tarifas_authenticated_all on public.faturamento_tarifas
  for all to authenticated using (true) with check (true);
drop policy if exists faturamento_documentos_authenticated_all on public.faturamento_documentos;
create policy faturamento_documentos_authenticated_all on public.faturamento_documentos
  for all to authenticated using (true) with check (true);
