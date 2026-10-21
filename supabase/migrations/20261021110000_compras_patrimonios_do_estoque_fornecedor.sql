-- Patrimônio que saiu do estoque do fornecedor também precisa de uma linha de cadastro (etiqueta) por unidade.
-- Baixas feitas antes de 21/10/2026 não criaram essas linhas; completa só os itens de patrimônio vinculados a uma
-- baixa do fornecedor que ainda não têm nenhuma linha.

insert into public.compras_patrimonios_cadastro (compra_item_id, material, marca, coordenacao, status)
select i.id, i.material, i.marca, s.coordenacao, 'aguardando_numero'
from public.compras_itens i
left join public.compras_solicitacoes s on s.id = i.solicitacao_id
cross join lateral generate_series(1, greatest(floor(i.quantidade)::int, 1))
where i.status = 'enviado_estoque'
  and lower(i.tipo) like '%patrimonio%'
  and exists (select 1 from public.compras_estoque_fornecedor_mov m where m.compras_item_id = i.id and m.tipo = 'baixa')
  and not exists (select 1 from public.compras_patrimonios_cadastro c where c.compra_item_id = i.id);
