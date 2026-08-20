drop policy if exists frotas_print_ocr_select on public.frotas_print_ocr_execucoes;
drop policy if exists frotas_print_ocr_insert on public.frotas_print_ocr_execucoes;
drop policy if exists frotas_print_ocr_update on public.frotas_print_ocr_execucoes;

create policy frotas_print_ocr_select on public.frotas_print_ocr_execucoes
  for select to authenticated
  using (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], false));
create policy frotas_print_ocr_insert on public.frotas_print_ocr_execucoes
  for insert to authenticated
  with check (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true)
    and (criado_por is null or criado_por = (select auth.uid())));
create policy frotas_print_ocr_update on public.frotas_print_ocr_execucoes
  for update to authenticated
  using (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true))
  with check (public.painel_has_module(array['frotas', 'frotas_excesso_velocidade', 'frotas_veiculos', 'frotas_rastreadores'], true));
