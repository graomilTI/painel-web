create or replace view vw_grm_distribuicao_os_atual as
select distinct on (numero_os)
  numero_os,
  coordenacao,
  supervisao,
  funcionario,
  cliente,
  local_embarque,
  local_destino,
  lote,
  prod_dia,
  situacao,
  created_at
from (
  select
    trim(dados_json->>'__EMPTY_4') as numero_os,
    dados_json->>'__EMPTY' as coordenacao,
    dados_json->>'__EMPTY_1' as supervisao,
    dados_json->>'__EMPTY_2' as funcionario,
    dados_json->>'__EMPTY_5' as cliente,
    dados_json->>'__EMPTY_7' as local_embarque,
    dados_json->>'__EMPTY_8' as local_destino,
    case when dados_json->>'__EMPTY_9' ~ '^-?\d+(\.\d+)?$' then (dados_json->>'__EMPTY_9')::numeric end as lote,
    case when dados_json->>'__EMPTY_10' ~ '^-?\d+(\.\d+)?$' then (dados_json->>'__EMPTY_10')::numeric end as prod_dia,
    coalesce(dados_json->>'Embarques com Produção', dados_json->>'Embarques sem Produção') as situacao,
    created_at
  from grm_distribuicao_os_importacoes
  where created_at > now() - interval '36 hours'
    and dados_json->>'__EMPTY_4' ~ '^\d+$'
) base
order by numero_os, created_at desc;

comment on view vw_grm_distribuicao_os_atual is 'Última linha por O.S. do mapa de Distribuição de O.S. sincronizado pelos agentes, usada como fonte de "Tons Hoje" na comparação automática do FOB (substitui o upload manual do Mapa/Movimentação).';
;
