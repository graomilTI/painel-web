-- CORREÇÃO CRÍTICA: a migração anterior (fob_lote_recente_rpc,
-- 20260721000000) assumia que `id` (uuid v4, ALEATÓRIO por definição —
-- RFC4122, confirmado via gen_random_uuid()/nibble de versão '4') seria
-- ordenável por tempo. É falso: "order by id desc limit N" devolve uma
-- amostra essencialmente aleatória da tabela inteira, não as N linhas mais
-- recentes.
--
-- Sintoma real que expôs o bug (2026-07-21): usuária mostrou a O.S. 86792
-- com 20 cargas lançadas na Produção Diária de 20/07 (confirmado via query
-- direta), mas a tela FOB classificava como "Pendente" — a amostra por id
-- simplesmente não pegou aquela linha (o lote existia, só não foi sorteado
-- pelo "order by id desc limit 50000" na tabela de 7,8M linhas).
--
-- Fix de verdade: índices em created_at (grm_mapa_embarque_importacoes já
-- tinha; produção e NHE não tinham — por isso o código antigo evitava
-- ordenar por created_at, dava statement timeout) + filtrar DIRETO por
-- created_at (rápido: ~200-400ms mesmo em 192 mil linhas de produção, testado
-- via EXPLAIN ANALYZE). Índices já criados via CREATE INDEX CONCURRENTLY
-- (fora desta migração, que roda em transação e não permite CONCURRENTLY):
--   create index concurrently idx_grm_producao_diaria_importacoes_created_at
--     on public.grm_producao_diaria_importacoes using btree (created_at desc);
--   create index concurrently idx_grm_nhe_importacoes_created_at
--     on public.grm_nhe_importacoes using btree (created_at desc);

drop function if exists public.fob_lote_recente(text, int, int);
-- fob_lote_recente corrigido: filtro DIRETO por created_at. Só para
-- movimentação/NHE (volume pequeno — poucos milhares de linhas em 3 dias —
-- dá pra baixar a janela inteira e deixar o cliente escolher o lote).
-- Produção usa fob_producao_lote_vencedor (abaixo), volume grande demais.
create or replace function public.fob_lote_recente(
  p_table text,
  p_dias  int default 3
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
    when 'grm_mapa_embarque_importacoes' then p_table
    when 'grm_nhe_importacoes'           then p_table
    else null
  end;
  if v_table is null then
    raise exception 'Tabela nao permitida no fob_lote_recente: %', p_table;
  end if;

  p_dias := greatest(1, least(coalesce(p_dias, 3), 30));

  return query execute format($f$
    select t.id, t.dados_json, t.created_at
    from public.%I t
    where t.created_at >= now() - make_interval(days => $1)
    order by t.created_at desc
  $f$, v_table)
  using p_dias;
end;
$$;
revoke all on function public.fob_lote_recente(text, int) from public;
revoke all on function public.fob_lote_recente(text, int) from anon;
grant execute on function public.fob_lote_recente(text, int) to authenticated;
-- grm_producao_diaria_importacoes tem MILHÕES de linhas (7,8M) e lotes de
-- importação de ~10 mil linhas várias vezes por dia — mesmo só "últimos 3
-- dias" já são ~190 mil linhas, caro demais pra trazer inteiro toda vez que
-- a tela FOB carrega. Esta função faz a ESCOLHA DO LOTE no próprio servidor
-- (mesmo critério do chooseServiceBatch do cliente: o lote — agrupado por
-- gap de tempo entre importações — com mais linhas cuja "Data" bate com a
-- data de referência; empate resolvido pelo lote mais recente) usando só
-- created_at + o campo "Data" (leve, sem trazer o dados_json inteiro nessa
-- fase), e só então devolve as linhas COMPLETAS do lote vencedor (~10 mil,
-- não 190 mil). Validado: lotes reais duram ~30-40s e ficam horas separados
-- um do outro — 20min de gap (p_gap_minutos) é folga generosa que nunca
-- funde 2 lotes reais nem corta 1 no meio.
--
-- Nota: os OUT params de RETURNS TABLE viram variáveis PL/pgSQL implícitas —
-- por isso as colunas internas do CTE de escolha do lote usam "ca" em vez de
-- "created_at" (evita ambiguidade com o OUT param homônimo).
create or replace function public.fob_producao_lote_vencedor(
  p_referencia_ddmmyyyy text,
  p_dias        int default 3,
  p_gap_minutos int default 20
)
returns table(id uuid, dados_json jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lote_inicio timestamptz;
  v_lote_fim    timestamptz;
begin
  p_dias := greatest(1, least(coalesce(p_dias, 3), 14));
  p_gap_minutos := greatest(5, least(coalesce(p_gap_minutos, 20), 180));

  with linhas as (
    select t.created_at as ca, (t.dados_json->>'Data' = p_referencia_ddmmyyyy) as bate
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= now() - make_interval(days => p_dias)
  ),
  marcado as (
    select ca, bate, lag(ca) over (order by ca) as anterior
    from linhas
  ),
  ilhas as (
    select *,
      sum(case when anterior is null or ca - anterior > make_interval(mins => p_gap_minutos) then 1 else 0 end)
        over (order by ca) as lote_id
    from marcado
  )
  select min(ca), max(ca)
  into v_lote_inicio, v_lote_fim
  from ilhas
  group by lote_id
  having count(*) filter (where bate) > 0
  order by count(*) filter (where bate) desc, max(ca) desc
  limit 1;

  if v_lote_inicio is null then
    return; -- nenhum lote na janela bate a data de referência
  end if;

  return query
    select t.id, t.dados_json, t.created_at
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= v_lote_inicio and t.created_at <= v_lote_fim
    order by t.id desc;
end;
$$;
revoke all on function public.fob_producao_lote_vencedor(text, int, int) from public;
revoke all on function public.fob_producao_lote_vencedor(text, int, int) from anon;
grant execute on function public.fob_producao_lote_vencedor(text, int, int) to authenticated;
