-- Código da compra passa a ser CMMMNN: "C" (Compras) + sigla do mês + sequência do mês (ex.: COUT01).
-- Antes: <letra do tipo><MÊS><nº> (OOUT13, EOUT11...), com um contador por tipo. Como a letra deixa de separar os
-- tipos, o contador também passa a ser um só por mês (linha tipo = 'C' em compras_codigo_contadores); com contador por
-- tipo, EPI e Outros gerariam o mesmo COUT01.
-- O parâmetro p_tipo continua existindo (as chamadas do painel e o gatilho não mudam), mas não influencia o código.
-- Códigos já emitidos não são alterados.

create or replace function public.gerar_codigo_compra(p_tipo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_ano int := extract(year from v_agora)::int;
  v_mes int := extract(month from v_agora)::int;
  v_contador int;
begin
  insert into compras_codigo_contadores (tipo, ano, mes, contador)
  values ('C', v_ano, v_mes, 1)
  on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
  returning contador into v_contador;

  return 'C'
    || (array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes]
    || lpad(v_contador::text, 2, '0');
end;
$$;
