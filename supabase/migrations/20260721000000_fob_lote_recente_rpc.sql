-- RPC do FOB: devolve só as linhas recentes (últimos p_dias dias) das tabelas
-- de importação, em vez de o cliente baixar 20-30k linhas por id.
--
-- Contexto: a tela FOB (logistica-fob-page-v9.js) baixava as últimas
-- MAX_*_ROWS (20-30k) linhas de grm_mapa_embarque_importacoes /
-- grm_producao_diaria_importacoes (7,8M linhas!) / grm_nhe_importacoes e
-- filtrava o lote do dia no cliente. Ordenar/filtrar por created_at na tabela
-- inteira dá statement timeout, por isso o cliente pagina por id (uuid ordenado
-- por tempo, PK indexada).
--
-- Esta RPC faz o mesmo scan por id (rápido, PK) mas corta a janela de created_at
-- DENTRO do scan e devolve só isso (~5-30x menos linhas). Correção garantida:
-- um lote só pode conter linhas da data de referência se foi criado nessa data
-- ou depois — logo todos os lotes candidatos estão nos últimos ~2 dias; 3 dias
-- cobrem com folga. O cliente segue rodando splitBatches/chooseBatch inalterado
-- sobre o resultado (mesma seleção de lote/data de antes).

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
  -- Whitelist explícita da tabela (o nome entra em SQL dinâmico via %I).
  v_table := case p_table
    when 'grm_mapa_embarque_importacoes'   then 'grm_mapa_embarque_importacoes'
    when 'grm_producao_diaria_importacoes' then 'grm_producao_diaria_importacoes'
    when 'grm_nhe_importacoes'             then 'grm_nhe_importacoes'
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
