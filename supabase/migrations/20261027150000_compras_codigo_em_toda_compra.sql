-- Toda compra efetivada (status "comprado") passa a ter código no padrão <tipo><MÊS><nº> (ex.: EOUT12, OOUT13),
-- seja qual for o fluxo que a marcou como comprada. Antes o código só saía em alguns caminhos do ADM e,
-- quando a chamada falhava (ou a compra vinha de outro fluxo), ficava "—".

-- 1) Daqui para frente: gatilho completa o código se o fluxo não tiver gerado.
create or replace function private.compras_itens_codigo_ao_comprar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'comprado' and coalesce(new.codigo, '') = '' then
    new.codigo := public.gerar_codigo_compra(coalesce(nullif(new.tipo, ''), 'Outros'));
  end if;
  return new;
end;
$$;

drop trigger if exists compras_itens_codigo_ao_comprar on public.compras_itens;
create trigger compras_itens_codigo_ao_comprar
  before insert or update of status, codigo on public.compras_itens
  for each row execute function private.compras_itens_codigo_ao_comprar();

-- 2) Retroativo: compras já efetivadas e sem código recebem o do mês em que foram compradas
--    (mesmo contador por tipo/mês da função gerar_codigo_compra, em ordem cronológica).
do $$
declare
  r record;
  v_tipo text; v_ano int; v_mes int; v_cont int; v_letra text;
begin
  for r in
    select id, tipo, coalesce(comprado_em, created_at) at time zone 'America/Sao_Paulo' as dt
      from public.compras_itens
     where coalesce(codigo, '') = ''
       and (status = 'comprado' or (status = 'concluido' and comprado_em is not null))
     order by coalesce(comprado_em, created_at), created_at, id
  loop
    v_tipo := coalesce(nullif(r.tipo, ''), 'Outros');
    v_ano := extract(year from r.dt)::int;
    v_mes := extract(month from r.dt)::int;
    insert into public.compras_codigo_contadores (tipo, ano, mes, contador)
    values (v_tipo, v_ano, v_mes, 1)
    on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
    returning contador into v_cont;
    v_letra := case v_tipo when 'Uniforme' then 'U' when 'Patrimonio' then 'P' when 'EPI' then 'E' else 'O' end;
    update public.compras_itens
       set codigo = v_letra || (array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes] || lpad(v_cont::text, 2, '0')
     where id = r.id;
  end loop;
end;
$$;
