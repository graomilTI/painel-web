-- Corrige a base usada para localizar OS pelo campo Embarque da Lista de OS.
-- A Lista de OS vem no formato: UF - Cidade (Local).
-- O agente de Locais de Embarque traz as colunas: UF, Cidade, Local, Latitude e Longitude.

alter table public.operacional_pontos_embarque
  alter column uf type text using btrim(uf::text);
update public.operacional_pontos_embarque
set
  uf = upper(btrim(uf)),
  cidade = btrim(cidade),
  nome_local = btrim(nome_local),
  updated_at = now()
where true;
-- Evita falha ao criar a chave única caso já existam duplicados ativos.
-- Mantém ativo o registro mais recente por UF + Cidade + Local e inativa os repetidos.
with duplicados as (
  select
    id,
    row_number() over (
      partition by upper(btrim(uf)), upper(btrim(cidade)), upper(btrim(nome_local))
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.operacional_pontos_embarque
  where ativo = true
)
update public.operacional_pontos_embarque p
set ativo = false, updated_at = now()
from duplicados d
where p.id = d.id
  and d.rn > 1;
create unique index if not exists operacional_pontos_embarque_uf_cidade_local_uidx
on public.operacional_pontos_embarque (
  upper(btrim(uf)),
  upper(btrim(cidade)),
  upper(btrim(nome_local))
)
where ativo = true;
