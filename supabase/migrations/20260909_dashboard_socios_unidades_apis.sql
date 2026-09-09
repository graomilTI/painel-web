-- Panorama da Empresa: fontes normalizadas a partir dos lotes atuais das APIs do GRM.
-- Notas emitidas passa a representar quantidade de NF; recebimentos usa o lote atual
-- de Contas a Receber, eliminando as lacunas do consolidado financeiro antigo.

create or replace view public.dashboard_socios_notas_emitidas_api
with (security_invoker = true)
as
with snapshot as (
  select max(created_at) as snapshot_at
  from public.grm_notas_fiscais_importacoes
), base as (
  select
    g.*,
    coalesce(nullif(trim(g.empresa), ''), nullif(trim(g.dados_json->>'Empresa'), '')) as empresa_api,
    coalesce(nullif(trim(g.fatura), ''), nullif(trim(g.dados_json->>'Fatura'), '')) as fatura_api,
    coalesce(nullif(trim(g.numero_nf), ''), nullif(trim(g.dados_json->>'Número NF'), '')) as numero_nf_api,
    coalesce(
      nullif(trim(g.cliente_nacional), ''),
      nullif(trim(g.dados_json->>'Cliente Nacional'), ''),
      nullif(trim(g.dados_json->>'Cliente'), '')
    ) as cliente_api,
    coalesce(
      g.data_nota_real,
      case
        when coalesce(g.dados_json->>'Data N.F.','') ~ '^\d{4}-\d{2}-\d{2}'
          then left(g.dados_json->>'Data N.F.',10)::date
        when coalesce(g.dados_json->>'Data N.F.','') ~ '^\d{1,2}/\d{1,2}/\d{4}'
          then to_date(left(g.dados_json->>'Data N.F.',10),'DD/MM/YYYY')
        when coalesce(g.dados_json->>'Data da Fatura','') ~ '^\d{4}-\d{2}-\d{2}'
          then left(g.dados_json->>'Data da Fatura',10)::date
        when coalesce(g.dados_json->>'Data da Fatura','') ~ '^\d{1,2}/\d{1,2}/\d{4}'
          then to_date(left(g.dados_json->>'Data da Fatura',10),'DD/MM/YYYY')
        else null
      end
    ) as data_api
  from public.grm_notas_fiscais_importacoes g
)
select
  b.data_api as data_nota_real,
  b.cliente_api as cliente_nacional,
  concat_ws(
    '|',
    coalesce(b.empresa_api,''),
    coalesce(b.numero_nf_api, 'FAT:' || coalesce(b.fatura_api,''))
  ) as numero_nf,
  1::numeric as valor_nota_real,
  1::numeric as valor_total,
  b.dados_json,
  s.snapshot_at as created_at
from base b
cross join snapshot s
where b.data_api is not null;

grant select on public.dashboard_socios_notas_emitidas_api to authenticated;

create or replace view public.dashboard_socios_recebimentos_api
with (security_invoker = true)
as
with dedup as (
  select distinct on (coalesce(nullif(trim(dados_json->>'rinCode'), ''), id::text))
    id,
    dados_json,
    created_at
  from public.grm_contas_receber_importacoes
  order by coalesce(nullif(trim(dados_json->>'rinCode'), ''), id::text), created_at desc
), normalized as (
  select
    trim(coalesce(dados_json->>'cliName','')) as cliente,
    concat_ws(
      '|',
      trim(coalesce(dados_json->>'scpName','')),
      coalesce(
        nullif(trim(dados_json->>'biiNumber'), ''),
        'FAT:' || trim(coalesce(dados_json->>'bilCode',''))
      )
    ) as numero_nf,
    case
      when nullif(trim(dados_json->>'rinTotalValue'), '') is not null
        then (dados_json->>'rinTotalValue')::numeric
      when nullif(trim(dados_json->>'rinValue'), '') is not null
        then (dados_json->>'rinValue')::numeric
      else 0::numeric
    end as valor_pago,
    case
      when coalesce(dados_json->>'rinPaidDate','') ~ '^\d{4}-\d{2}-\d{2}'
        then left(dados_json->>'rinPaidDate',10)::date
      when coalesce(dados_json->>'rinPaidDate','') ~ '^\d{1,2}/\d{1,2}/\d{4}'
        then to_date(left(dados_json->>'rinPaidDate',10),'DD/MM/YYYY')
      else null
    end as recebimento
  from dedup
)
select cliente, numero_nf, valor_pago, recebimento
from normalized
where recebimento is not null;

grant select on public.dashboard_socios_recebimentos_api to authenticated;
