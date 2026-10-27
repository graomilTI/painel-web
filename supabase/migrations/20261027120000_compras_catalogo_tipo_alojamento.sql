-- Catálogo de Compras: itens de alojamento ganham tipo próprio ("Alojamento"), em vez de lista fixa no código
-- e de itens soltos em "Outros". A aba Alojamento da solicitação passa a ler daqui.
alter table public.compras_catalogo drop constraint compras_catalogo_tipo_check;
alter table public.compras_catalogo add constraint compras_catalogo_tipo_check
  check (tipo in ('Uniforme','Patrimonio','EPI','Alojamento','Outros'));

-- Já cadastrados em "Outros": passam para Alojamento.
update public.compras_catalogo set tipo = 'Alojamento'
 where tipo = 'Outros' and upper(material) in ('BELICHE','CAMA','COLCHÃO','LENÇOL');

-- Os demais da lista que estava fixa no código.
insert into public.compras_catalogo (material, tipo)
select m, 'Alojamento'
  from unnest(array['FRONHA','TRAVESSEIRO','COBERTOR','ARMÁRIO','PRATELEIRA','MESA','CADEIRA','VENTILADOR','CORTINA','VARAL','UTENSÍLIOS DE COZINHA']) m
 where not exists (select 1 from public.compras_catalogo c where lower(c.material) = lower(m) and c.tipo = 'Alojamento');

