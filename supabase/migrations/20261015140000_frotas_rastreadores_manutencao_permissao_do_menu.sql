-- Frotas · Rastreadores: manutenção segue a autorização do menu Rastreadores.
-- Antes a escrita (editar, finalizar, cancelar) exigia "pode editar" em frotas_rastreadores, enquanto
-- o menu e a leitura só pedem acesso. Resultado: 18 usuários abriam a aba e só 3 conseguiam mexer em
-- manutenção ("sem permissão para excluir"). Agora quem tem o menu Rastreadores também gerencia as
-- manutenções; a tabela de rastreadores e as observações já eram abertas assim.

drop policy if exists frotas_rastr_manut_write on public.frotas_rastreadores_manutencoes;
create policy frotas_rastr_manut_write on public.frotas_rastreadores_manutencoes
  for all to authenticated
  using (public.painel_has_module(array['frotas_rastreadores'], false))
  with check (public.painel_has_module(array['frotas_rastreadores'], false));
