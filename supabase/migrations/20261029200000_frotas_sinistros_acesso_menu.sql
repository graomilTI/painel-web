-- Frotas > Sinistros: quem tem acesso ao menu (Sinistros ou Manutenção) pode registrar e operar sinistros.
-- Antes a escrita exigia permissão de edição (painel_has_module(..., true)), e quem só via o menu não conseguia criar.
-- Leitura continua como estava (inclui os perfis de Frotas e do dashboard do sócio).

do $$
declare
  t text;
begin
  foreach t in array array['frotas_sinistros', 'frotas_sinistro_terceiros', 'frotas_sinistro_checklist_modelo',
                           'frotas_sinistro_marcas', 'frotas_sinistro_anexos', 'frotas_sinistro_historico']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using ((select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], false)))
      with check ((select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], false)))$p$, t || '_write', t);
  end loop;
end $$;

drop policy if exists frotas_sinistros_obj_insert on storage.objects;
create policy frotas_sinistros_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'frotas-sinistros' and (select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], false)));
drop policy if exists frotas_sinistros_obj_delete on storage.objects;
create policy frotas_sinistros_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'frotas-sinistros' and (select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], false)));
