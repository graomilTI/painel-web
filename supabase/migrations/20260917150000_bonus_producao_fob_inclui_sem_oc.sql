-- Bônus > Produção contava só as O.S. com Serviço EXATAMENTE "Classificação
-- FOB", perdendo qualquer O.S. classificada como "Classificação FOB S/ OC"
-- (sem Ordem de Compra vinculada) -- mesmo trabalho de classificação FOB, só
-- sem OC linkada no GRM. Relato do usuário 17/09: Luana Oliveira da Silva
-- tinha 675,31t somadas no relatório de Produção de agosto/2026, mas a tela
-- de Bônus mostrava só 32,40t -- exatamente a única O.S. do mês com o rótulo
-- "Classificação FOB" sem sufixo, enquanto as outras 4 (S/ OC) ficavam de
-- fora do bônus.
create or replace function public.bonus_producao_competencia_calcular(p_competencia date)
 returns table(colaborador text, tons numeric, valor numeric, status text, motivo text, patrimonio_dias integer, inapto_auditoria boolean)
 language sql
 set search_path to 'public'
as $function$
  with parametros as (
    select
      date_trunc('month', coalesce(p_competencia, current_date))::date as inicio,
      (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month')::date as fim
  ),
  producao_raw as (
    select trim(ps.funcionario) as colaborador_raw,
           sum(coalesce(ps.tons,0))::numeric as tons
    from public.producao_snapshot ps
    cross join parametros p
    where ps.data >= p.inicio
      and ps.data < p.fim
      and ps.servico like 'Classificação FOB%'
      and nullif(trim(ps.funcionario),'') is not null
    group by trim(ps.funcionario)
  ),
  producao as (
    select public.bonus_normalizar_nome(pr.colaborador_raw) as nome_key,
           min(pr.colaborador_raw) as colaborador,
           sum(pr.tons)::numeric as tons
    from producao_raw pr
    where public.bonus_normalizar_nome(pr.colaborador_raw) <> ''
    group by public.bonus_normalizar_nome(pr.colaborador_raw)
  ),
  patrimonio_raw as (
    select trim(pat.funcionario) as funcionario_raw,
           max(pat.dias_sem_leitura) as max_dias
    from public.patrimonios_snapshot pat
    where nullif(trim(pat.funcionario),'') is not null
    group by trim(pat.funcionario)
  ),
  patrimonio as (
    select public.bonus_normalizar_nome(pr.funcionario_raw) as nome_key,
           max(pr.max_dias) as max_dias
    from patrimonio_raw pr
    where public.bonus_normalizar_nome(pr.funcionario_raw) <> ''
    group by public.bonus_normalizar_nome(pr.funcionario_raw)
  ),
  auditoria as (
    select bai.nome_normalizado as nome_key
    from public.bonus_auditoria_inaptos bai
    cross join parametros p
    where bai.competencia = p.inicio
  )
  select
    prod.colaborador,
    round(prod.tons,2) as tons,
    round(prod.tons*0.03,2) as valor,
    case when aud.nome_key is not null or coalesce(pat.max_dias,0)>10 then 'Inapto' else 'Apto' end as status,
    concat_ws(
      ' · ',
      case when aud.nome_key is not null then 'Auditoria' end,
      case when coalesce(pat.max_dias,0)>10 then 'Patrimônio: '||pat.max_dias||' dias sem leitura' end
    ) as motivo,
    pat.max_dias as patrimonio_dias,
    (aud.nome_key is not null) as inapto_auditoria
  from producao prod
  left join patrimonio pat on pat.nome_key=prod.nome_key
  left join auditoria aud on aud.nome_key=prod.nome_key
  order by prod.colaborador;
$function$
;

-- Índice parcial existia só pra servico = 'Classificação FOB'; acompanha o
-- novo predicado (LIKE) pra continuar acelerando a mesma consulta.
drop index if exists public.producao_snapshot_bonus_fob_data_func_idx;
create index producao_snapshot_bonus_fob_data_func_idx
  on public.producao_snapshot using btree (data, funcionario) include (tons)
  where (servico like 'Classificação FOB%');

-- Recalcula na hora as competências já em cache (as fechadas nem entram,
-- bonus_producao_cache_refresh sai cedo pra elas) pra não esperar o TTL de
-- 2min do refresh normal.
do $$
declare
  r record;
begin
  for r in select competencia from public.bonus_producao_cache_meta loop
    perform public.bonus_producao_cache_refresh(r.competencia, true);
  end loop;
end $$;
