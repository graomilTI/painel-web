-- Código por PAGAMENTO de Compras (PAG-AAMM-NNN), pra o Financeiro não se perder:
-- um código só pro grupo de itens que o Financeiro paga de uma vez, visível na
-- lista de Pagamentos, no comprovante e na tela de Compras. O código antigo por
-- item (gerar_codigo_compra, ex.: OSET01) continua como está.
--
-- Contador atômico por mês, reaproveitando compras_codigo_contadores com
-- tipo = 'PAG'. Mês/ano em horário de Brasília.

alter table public.financeiro_pagamentos add column if not exists codigo text;
create unique index if not exists financeiro_pagamentos_codigo_uidx
  on public.financeiro_pagamentos (codigo) where codigo is not null;

alter table public.compras_itens add column if not exists codigo_pagamento text;
create index if not exists compras_itens_codigo_pagamento_idx
  on public.compras_itens (codigo_pagamento) where codigo_pagamento is not null;

create or replace function public.gerar_codigo_pagamento_compra(p_data timestamptz default now())
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_local timestamp := p_data at time zone 'America/Sao_Paulo';
  v_ano int := extract(year from v_local)::int;
  v_mes int := extract(month from v_local)::int;
  v_contador int;
begin
  insert into compras_codigo_contadores (tipo, ano, mes, contador)
  values ('PAG', v_ano, v_mes, 1)
  on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
  returning contador into v_contador;

  return 'PAG-' || lpad((v_ano % 100)::text, 2, '0') || lpad(v_mes::text, 2, '0') || '-' || lpad(v_contador::text, 3, '0');
end;
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_cod text;
begin
  -- 1) pagamentos reais de Compras, na ordem de criação
  for r in
    select id, created_at, compras_item_ids
    from financeiro_pagamentos
    where upper(coalesce(origem, '')) like 'COMPRA%' and codigo is null
    order by created_at, id
  loop
    v_cod := gerar_codigo_pagamento_compra(r.created_at);
    update financeiro_pagamentos set codigo = v_cod where id = r.id;
    if r.compras_item_ids is not null then
      update compras_itens set codigo_pagamento = v_cod
      where id = any (r.compras_item_ids) and codigo_pagamento is null;
    end if;
  end loop;

  -- 2) itens em aberto sem registro no Financeiro (aparecem agrupados na lista):
  --    um código por grupo, com a mesma chave usada pela tela.
  for r in
    select i.status, coalesce(i.forma_pagamento, '') forma, coalesce(i.dados_pagamento, '') dados,
           coalesce(s.solicitante, '') gestor, coalesce(s.coordenacao, '') coord,
           array_agg(i.id) ids, min(coalesce(i.updated_at, i.created_at)) dt
    from compras_itens i
    left join compras_solicitacoes s on s.id = i.solicitacao_id
    where i.status in ('pendente_pagamento', 'aguardando_nf') and i.codigo_pagamento is null
    group by 1, 2, 3, 4, 5
    order by 7
  loop
    v_cod := gerar_codigo_pagamento_compra(r.dt);
    update compras_itens set codigo_pagamento = v_cod where id = any (r.ids);
  end loop;
end;
$$;
