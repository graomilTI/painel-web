-- Backfill emergencial para destravar Programação.
-- A tela de Programação usa ponto1_latitude/ponto1_longitude da OS antes de tentar resolver pelo texto.
-- Este SQL preenche a coordenada da OS usando UF + Cidade extraídos do campo embarque.

alter table public.operacional_os
  add column if not exists ponto1_latitude numeric;

alter table public.operacional_os
  add column if not exists ponto1_longitude numeric;

alter table public.operacional_os
  add column if not exists ponto1_nome text;

with os_parse as (
  select
    o.id,
    upper(btrim(m[1])) as uf,
    translate(
      upper(btrim(m[2])),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ) as cidade_norm
  from public.operacional_os o
  cross join lateral regexp_match(
    coalesce(o.embarque, o.local_embarque, ''),
    '^\s*([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\((.*)\))?\s*$'
  ) as m
  where coalesce(o.embarque, o.local_embarque, '') <> ''
),
pontos_rank as (
  select
    p.id,
    p.uf,
    p.cidade,
    p.nome_local,
    p.latitude,
    p.longitude,
    translate(
      upper(btrim(p.cidade)),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ) as cidade_norm,
    row_number() over (
      partition by upper(btrim(p.uf)), translate(upper(btrim(p.cidade)), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.operacional_pontos_embarque p
  where p.ativo = true
    and p.latitude is not null
    and p.longitude is not null
),
match_cidade as (
  select
    o.id as os_id,
    p.latitude,
    p.longitude,
    p.nome_local,
    p.cidade,
    p.uf
  from os_parse o
  join pontos_rank p
    on upper(btrim(p.uf)) = o.uf
   and p.cidade_norm = o.cidade_norm
   and p.rn = 1
)
update public.operacional_os o
set
  ponto1_latitude = m.latitude,
  ponto1_longitude = m.longitude,
  ponto1_nome = concat_ws(' · ', m.nome_local, concat(m.cidade, '/', m.uf)),
  updated_at = now()
from match_cidade m
where o.id = m.os_id
  and (
    o.ponto1_latitude is null
    or o.ponto1_longitude is null
    or o.ponto1_nome is null
  );
