-- Colaborador readmitido (ex.: GABRIEL MARIANO DA SILVA, CPF 05671486025) fica
-- com `colaboradores_atuais.desligamento` preenchido com a data do desligamento
-- ANTERIOR à readmissão — o GRM não limpa esse campo quando a pessoa volta a
-- trabalhar, só atualiza `situacao` para 'Ativo'. As RPCs de candidatos da
-- Programação (Etapa 2) exigiam `desligamento is null`, então esse colaborador
-- ficava permanentemente fora do pool da própria supervisão mesmo já
-- readmitido e com supervisão correta — reportado pela usuária 28/08/2026.
-- Fix: só tratar `desligamento` como sinal de inatividade quando `situacao`
-- não for explicitamente 'Ativo' (mesma fonte de verdade que já define
-- `colaboradores_atuais.ativo`).

create or replace function public.programacao_colaboradores_supervisao(p_supervisao text)
 returns table(colaborador_id text, nome text, cargo text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
      coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_id,
      cs.nome,
      cs.cargo
    from colaboradores_atuais cs
    where cs.supervisao = p_supervisao
      and cs.ativo is distinct from false
      and (cs.desligamento is null or upper(coalesce(cs.situacao, '')) = 'ATIVO')
      and upper(coalesce(cs.situacao, '')) not in ('NAO ATIVO','NAO ATIVA','INATIVO','INATIVA','DESLIGADO','DESLIGADA','DEMITIDO','DEMITIDA')
    order by coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome)
  )
  select colaborador_id, nome, cargo
  from base
  order by nome;
$function$;

create or replace function public.programacao_etapa_b_candidatos(p_supervisao text, p_excluir_colaborador_ids text[], p_os jsonb)
 returns table(os_id uuid, colaborador_id text, nome text, cargo text, coordenacao text, supervisao text, tipo_contrato text, km numeric, auditorias_qtd integer, auditorias_peso numeric, veiculo_id uuid, veiculo_placa text, colab_lat numeric, colab_lng numeric, custo_total numeric, score numeric, score_contrato numeric, score_distancia numeric, score_auditoria numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
with colab as (
  select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g') as cpf_norm,
    cs.nome, cs.cargo, cs.coordenacao, cs.supervisao
  from colaboradores_atuais cs
  where cs.supervisao = p_supervisao
    and cs.ativo is distinct from false
    and (cs.desligamento is null or upper(coalesce(cs.situacao, '')) = 'ATIVO')
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
  select distinct on (cpf) cpf, tipo_contrato, latitude, longitude, auditorias_180d_qtd, auditorias_180d_peso, veiculo_id, veiculo_placa, salario
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
    cz.salario,
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
custos as (
  select
    p.*,
    case
      when p.km is null then null
      else
        (case when upper(coalesce(p.tipo_contrato, '')) like '%EFETIVO%' then 0 else coalesce(p.salario, 0) end)
        + (p.km * 2 / 10.0) * 7.0
    end as custo_total
  from pares p
),
ranqueado as (
  select
    c.*,
    rank() over (partition by c.os_id order by c.km asc nulls last) as km_rank,
    count(*) filter (where c.km is not null) over (partition by c.os_id) as km_total,
    rank() over (partition by c.os_id order by (case when c.auditorias_180d_qtd > 0 then c.auditorias_180d_peso end) desc nulls last) as aud_rank,
    count(*) filter (where c.auditorias_180d_qtd > 0) over (partition by c.os_id) as aud_total,
    rank() over (partition by c.os_id order by c.custo_total asc nulls last) as custo_rank,
    count(*) filter (where c.custo_total is not null) over (partition by c.os_id) as custo_count
  from custos c
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
    round(r.custo_total::numeric, 2) as custo_total,
    case
      when r.custo_total is null then 0
      when r.custo_count <= 1 then 1
      else 1 - (r.custo_rank - 1)::numeric / (r.custo_count - 1)
    end as score_contrato,
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
    f.km, f.auditorias_qtd, f.auditorias_peso, f.veiculo_id, f.veiculo_placa, f.colab_lat, f.colab_lng, f.custo_total,
    (0.5 * f.score_contrato + 0.3 * f.score_distancia + 0.2 * f.score_auditoria) as score,
    f.score_contrato, f.score_distancia, f.score_auditoria
  from final f
),
top8 as (
  select s.*, row_number() over (partition by s.os_id order by s.score desc, s.km asc nulls last) as rn
  from scored s
)
select os_id, colaborador_id, nome, cargo, coordenacao, supervisao, tipo_contrato,
       km, auditorias_qtd, auditorias_peso, veiculo_id, veiculo_placa, colab_lat, colab_lng, custo_total,
       score, score_contrato, score_distancia, score_auditoria
from top8
where rn <= 8
order by os_id, score desc, km asc nulls last
;
$function$;
