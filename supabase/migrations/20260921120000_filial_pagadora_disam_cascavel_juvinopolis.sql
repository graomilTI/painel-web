-- Filial DISAM - CASCAVEL/JUVINOPOLIS (cód. GRM 2251, CNPJ 76.154.749/0029-56)
-- existe no GRM mas não estava no cadastro mestre, então não aparecia em
-- "Filial pagadora" na Abertura de O.S.
insert into public.logistica_clientes_filiais_pagadoras (cliente_nacional, filial_pagadora, origem, ativo)
values ('DISAM DISTRIBUIDORA DE INSUMOS AGRICOLAS SUL AMERICA LTDA', 'DISAM - CASCAVEL/JUVINOPOLIS', 'cadastro_manual', true)
on conflict (cliente_nacional, filial_pagadora) do update set ativo = true, updated_at = now();
