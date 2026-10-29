-- Frotas · Preventiva: a lista (frotas_preventiva_painel → view frotas_manutencao_vencimentos_v, security_invoker) lê
-- frotas_veiculos_leituras_km (~1.400 linhas). A política de leitura chamava painel_has_module() por linha (~4 ms cada): 5,7 s para quem
-- está logado, perto do statement_timeout de 8 s, e a tela ficava em "Carregando vencimentos...". Com (select ...) a função roda uma
-- vez por consulta (initplan). Mesma regra de acesso, só mais rápida.
drop policy if exists frotas_leituras_km_select on public.frotas_veiculos_leituras_km;
create policy frotas_leituras_km_select on public.frotas_veiculos_leituras_km
  for select to authenticated
  using ((select public.painel_has_module(array['frotas_manutencao', 'frotas_veiculos', 'frotas'], false)));
