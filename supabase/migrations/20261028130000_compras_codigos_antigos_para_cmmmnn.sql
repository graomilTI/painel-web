-- Renumera os códigos de compra já emitidos (<letra do tipo><MÊS><nº>: OOUT13, EOUT11...) para CMMMNN (COUT01...),
-- sequência única por mês, em ordem cronológica de compra (mês/ano em America/Sao_Paulo). Nenhuma outra tabela guarda
-- esses códigos (conferido em financeiro_pagamentos e compras_aprovacoes). Contador do mês ('C') fica no último número.
do $$
declare
  r record;
  v_ym text; v_ano int; v_mes int; v_seq int := 0; v_ult_ym text := '';
  v_abrev text[] := array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
begin
  for r in
    select id, to_char(coalesce(comprado_em, created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM') as ym
      from public.compras_itens
     where coalesce(codigo, '') <> ''
       and codigo ~ '^[OEPU](JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[0-9]{2,}$'
     order by to_char(coalesce(comprado_em, created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM'),
              coalesce(comprado_em, created_at), created_at, id
  loop
    v_ym := r.ym;
    if v_ym <> v_ult_ym then
      v_ult_ym := v_ym; v_seq := 0;
      v_ano := split_part(v_ym, '-', 1)::int; v_mes := split_part(v_ym, '-', 2)::int;
      -- continua depois de códigos 'C' já emitidos no mês, se houver
      select coalesce(max(contador), 0) into v_seq from public.compras_codigo_contadores where tipo = 'C' and ano = v_ano and mes = v_mes;
    end if;
    v_seq := v_seq + 1;
    update public.compras_itens set codigo = 'C' || v_abrev[v_mes] || lpad(v_seq::text, 2, '0') where id = r.id;
    insert into public.compras_codigo_contadores (tipo, ano, mes, contador) values ('C', v_ano, v_mes, v_seq)
    on conflict (tipo, ano, mes) do update set contador = excluded.contador;
  end loop;
end;
$$;
