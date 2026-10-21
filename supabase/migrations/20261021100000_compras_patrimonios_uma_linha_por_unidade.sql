-- Patrimônio comprado precisa de uma linha de cadastro por unidade (etiqueta de cada uma).
-- Até aqui criava-se uma linha por item, mesmo com quantidade > 1. Completa os itens que ainda não
-- tiveram NENHUM número informado (nada já etiquetado é alterado) com as linhas que faltam.

insert into public.compras_patrimonios_cadastro (compra_item_id, material, marca, coordenacao, status, created_at)
select i.id, c.material, c.marca, c.coordenacao, 'aguardando_numero', c.created_at
from public.compras_itens i
join lateral (
  select * from public.compras_patrimonios_cadastro where compra_item_id = i.id order by created_at limit 1
) c on true
cross join lateral generate_series(
  1,
  greatest(floor(i.quantidade)::int, 1) - (select count(*) from public.compras_patrimonios_cadastro where compra_item_id = i.id)::int
)
where not exists (
  select 1 from public.compras_patrimonios_cadastro x where x.compra_item_id = i.id and x.numero_patrimonio is not null
);
