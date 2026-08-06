
-- RPC do FOB: devolve só as linhas recentes (últimos p_dias dias) das tabelas
-- de importação, em vez de o cliente baixar 20-30k linhas por id. Escaneia as
-- últimas p_scan linhas por id (PK indexada, id é uuid ordenado por tempo — o
-- mesmo pressuposto que o cliente já usa) e filtra a janela de created_at
-- DENTRO desse scan (evita o statement timeout de ordenar created_at na tabela
-- inteira, que tem milhões de linhas). Correção garantida: um lote só pode
-- conter linhas da data de referência se foi criado nessa data ou depois — logo
-- todos os lotes candidatos estão nos últimos ~2 dias; 3 dias cobrem com folga.
-- O cliente segue rodando splitBatches/chooseBatch inalterado sobre o resultado.
create or replace function public.fob_lote_recente(
  p_table text,
  p_dias  int default 3,
  p_scan  int default 50000
)
returns table(id uuid, dados_json jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  v_table := case p_table
    when 'grm_mapa_embarque_importacoes'  then 'grm_mapa_embarque_importacoes'
    when 'grm_producao_diaria_importacoes' then 'grm_producao_diaria_importacoes'
    when 'grm_nhe_importacoes'            then 'grm_nhe_importacoes'
    else null
  end;
  if v_table is null then
    raise exception 'Tabela nao permitida no fob_lote_recente: %', p_table;
  end if;

  -- Limites defensivos nos parâmetros.
  p_dias := greatest(1, least(coalesce(p_dias, 3), 30));
  p_scan := greatest(1000, least(coalesce(p_scan, 50000), 200000));

  return query execute format($f$
    with scan as (
      select t.id, t.dados_json, t.created_at
      from public.%I t
      order by t.id desc
      limit $1
    ),
    lim as (select max(scan.created_at) as topo from scan)
    select scan.id, scan.dados_json, scan.created_at
    from scan, lim
    where scan.created_at >= lim.topo - make_interval(days => $2)
    order by scan.id desc
  $f$, v_table)
  using p_scan, p_dias;
end;
$$;

revoke all on function public.fob_lote_recente(text, int, int) from public;
revoke all on function public.fob_lote_recente(text, int, int) from anon;
grant execute on function public.fob_lote_recente(text, int, int) to authenticated;
;
