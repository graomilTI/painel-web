-- Etapa B: inclui as coordenadas do colaborador (colab_lat/colab_lng) no
-- retorno da RPC, usadas pelo front para desenhar uma linha de preview
-- colaborador->embarque no mapa sem precisar de outra consulta.

create or replace function public.programacao_etapa_b_candidatos(
  p_supervisao text,
  p_excluir_colaborador_ids text[],
  p_os jsonb
)
returns table (
  os_id uuid,
  colaborador_id text,
  nome text,
  cargo text,
  coordenacao text,
  supervisao text,
  tipo_contrato text,
  km numeric,
  auditorias_qtd integer,
  auditorias_peso numeric,
  veiculo_id uuid,
  veiculo_placa text,
  colab_lat numeric,
  colab_lng numeric,
  score numeric,
  score_contrato numeric,
  score_distancia numeric,
  score_auditoria numeric
)
language sql
stable
security definer
set search_path = public
as $$
with ref as (
  select max(data_referencia) as data_referencia from colaborador_snapshot
),
colab as (
  select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g') as cpf_norm,
    cs.nome, cs.cargo, cs.coordenacao, cs.supervisao
  from colaborador_snapshot cs, ref
  where cs.data_referencia = ref.data_referencia
    and cs.supervisao = p_supervisao
    and cs.ativo is distinct from false
    and cs.desligamento is null
    and upper(coalesce(cs.situacao, '')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
  order by coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome)
),
elegiveis as (
  select c.* from colab c
  where not (c.colaborador_key = any(coalesce(p_excluir_colaborador_ids, array[]::text[])))
),
osinfo as (
  select
    (item->>'os_id')::uuid as os_id,
    (item->>'lat')::numeric as lat,
    (item->>'lng')::numeric as lng
  from jsonb_array_elements(p_os) item
),
cz_best as (
  select distinct on (cpf) cpf, tipo_contrato, latitude, longitude, auditorias_180d_qtd, auditorias_180d_peso, veiculo_id, veiculo_placa
  from colaborador_cruzamento
  where cpf <> ''
  order by cpf, atualizado_em desc
),
pares as (
  select
    o.os_id,
    e.colaborador_key,
    e.nome,
    e.cargo,
    e.coordenacao,
    e.supervisao,
    cz.tipo_contrato,
    cz.auditorias_180d_qtd,
    cz.auditorias_180d_peso,
    cz.veiculo_id,
    cz.veiculo_placa,
    cz.latitude as colab_lat,
    cz.longitude as colab_lng,
    case
      when o.lat is not null and o.lng is not null and cz.latitude is not null and cz.longitude is not null then
        2 * 6371 * asin(sqrt(
          sin(radians(cz.latitude - o.lat) / 2) ^ 2 +
          cos(radians(o.lat)) * cos(radians(cz.latitude)) * sin(radians(cz.longitude - o.lng) / 2) ^ 2
        ))
      else null
    end as km
  from osinfo o
  cross join elegiveis e
  left join cz_best cz
    on cz.cpf = e.cpf_norm and e.cpf_norm <> ''
),
ranqueado as (
  select
    p.*,
    case
      when upper(coalesce(p.tipo_contrato, '')) like '%EFETIVO%' then 1
      when upper(coalesce(p.tipo_contrato, '')) like '%INTERMITENTE%' then 0.6
      when upper(coalesce(p.tipo_contrato, '')) like '%DIARISTA%' then 0.3
      else 0.5
    end as score_contrato,
    rank() over (partition by p.os_id order by p.km asc nulls last) as km_rank,
    count(*) filter (where p.km is not null) over (partition by p.os_id) as km_total,
    rank() over (partition by p.os_id order by (case when p.auditorias_180d_qtd > 0 then p.auditorias_180d_peso end) desc nulls last) as aud_rank,
    count(*) filter (where p.auditorias_180d_qtd > 0) over (partition by p.os_id) as aud_total
  from pares p
),
final as (
  select
    r.os_id,
    r.colaborador_key as colaborador_id,
    r.nome,
    r.cargo,
    r.coordenacao,
    r.supervisao,
    r.tipo_contrato,
    round(r.km::numeric, 1) as km,
    r.auditorias_180d_qtd as auditorias_qtd,
    r.auditorias_180d_peso as auditorias_peso,
    r.veiculo_id,
    r.veiculo_placa,
    r.colab_lat,
    r.colab_lng,
    r.score_contrato,
    case
      when r.km is null then 0
      when r.km_total <= 1 then 1
      else 1 - (r.km_rank - 1)::numeric / (r.km_total - 1)
    end as score_distancia,
    case
      when r.auditorias_180d_qtd is null or r.auditorias_180d_qtd <= 0 then 0
      when r.aud_total <= 1 then 1
      else 1 - (r.aud_rank - 1)::numeric / (r.aud_total - 1)
    end as score_auditoria
  from ranqueado r
),
scored as (
  select
    f.os_id, f.colaborador_id, f.nome, f.cargo, f.coordenacao, f.supervisao, f.tipo_contrato,
    f.km, f.auditorias_qtd, f.auditorias_peso, f.veiculo_id, f.veiculo_placa, f.colab_lat, f.colab_lng,
    (0.5 * f.score_contrato + 0.3 * f.score_distancia + 0.2 * f.score_auditoria) as score,
    f.score_contrato, f.score_distancia, f.score_auditoria
  from final f
),
top8 as (
  select s.*, row_number() over (partition by s.os_id order by s.score desc, s.km asc nulls last) as rn
  from scored s
)
select os_id, colaborador_id, nome, cargo, coordenacao, supervisao, tipo_contrato,
       km, auditorias_qtd, auditorias_peso, veiculo_id, veiculo_placa, colab_lat, colab_lng,
       score, score_contrato, score_distancia, score_auditoria
from top8
where rn <= 8
order by os_id, score desc, km asc nulls last
;
$$;

grant execute on function public.programacao_etapa_b_candidatos(text, text[], jsonb) to authenticated;
