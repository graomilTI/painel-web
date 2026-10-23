-- O código do pedido de aprovação usa sempre C (Compras), independente do setor do usuário que pediu.
-- O setor real de quem pediu continua guardado em setor_solicitante. Pedidos já criados com outra inicial passam para C.

create or replace function public.compras_solicitar_aprovacao(p_item_ids uuid[], p_setor text default null, p_nome text default null)
returns table (out_id uuid, out_codigo text, out_solicitante text, out_itens int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_letra text := 'C'; -- o pedido nasce sempre em Compras: o código usa C, qualquer que seja o setor de quem pede
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_ano int := extract(year from v_local)::int;
  v_mes int := extract(month from v_local)::int;
  v_mes_abrev text := (array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes];
  g record;
  v_contador int;
  v_cod text;
  v_id uuid;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'Nenhum item informado.';
  end if;
  if exists (select 1 from compras_itens where id = any (p_item_ids) and status not in ('pendente', 'em_cotacao')) then
    raise exception 'Só itens em cotação podem ser enviados para aprovação.';
  end if;
  if exists (select 1 from compras_aprovacao_itens ai join compras_aprovacoes a on a.id = ai.aprovacao_id
             where ai.compra_item_id = any (p_item_ids) and a.status = 'pendente') then
    raise exception 'Algum item já está aguardando aprovação.';
  end if;

  for g in
    select coalesce(nullif(trim(s.solicitante), ''), 'Gestor') as nome, array_agg(i.id order by i.created_at, i.id) as ids
    from compras_itens i
    join compras_solicitacoes s on s.id = i.solicitacao_id
    where i.id = any (p_item_ids)
    group by 1
    order by 1
  loop
    insert into compras_codigo_contadores (tipo, ano, mes, contador)
    values ('APR-' || v_letra, v_ano, v_mes, 1)
    on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
    returning contador into v_contador;
    v_cod := v_letra || v_mes_abrev || lpad(v_contador::text, 2, '0');

    insert into compras_aprovacoes (codigo, setor_inicial, ano, mes, sequencia, solicitante, solicitado_por_nome, setor_solicitante)
    values (v_cod, v_letra, v_ano, v_mes, v_contador, g.nome, p_nome, p_setor)
    returning id into v_id;

    insert into compras_aprovacao_itens (aprovacao_id, compra_item_id) select v_id, unnest(g.ids);
    update compras_itens set status = 'em_analise' where id = any (g.ids);

    out_id := v_id; out_codigo := v_cod; out_solicitante := g.nome; out_itens := cardinality(g.ids);
    return next;
  end loop;
end;
$$;

update public.compras_aprovacoes a
   set codigo = 'C' || substr(a.codigo, 2), setor_inicial = 'C'
 where a.setor_inicial <> 'C'
   and not exists (select 1 from public.compras_aprovacoes x where x.ano = a.ano and x.mes = a.mes and x.codigo = 'C' || substr(a.codigo, 2));

update public.compras_codigo_contadores c
   set tipo = 'APR-C'
 where c.tipo like 'APR-%' and c.tipo <> 'APR-C'
   and not exists (select 1 from public.compras_codigo_contadores d where d.tipo = 'APR-C' and d.ano = c.ano and d.mes = c.mes);

revoke all on function public.compras_solicitar_aprovacao(uuid[], text, text) from public, anon;
grant execute on function public.compras_solicitar_aprovacao(uuid[], text, text) to authenticated;
