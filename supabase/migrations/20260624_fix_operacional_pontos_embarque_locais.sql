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

create unique index if not exists operacional_pontos_embarque_uf_cidade_local_uidx
on public.operacional_pontos_embarque (
  upper(btrim(uf)),
  upper(btrim(cidade)),
  upper(btrim(nome_local))
)
where ativo = true;
