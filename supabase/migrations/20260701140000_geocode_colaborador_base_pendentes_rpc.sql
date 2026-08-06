-- RPC de apoio para a Edge Function geocode-colaborador-base: identifica
-- colaboradores ativos sem linha em operacional_colaborador_base e já
-- devolve nome_chave calculado com a MESMA expressão do trigger
-- operacional_colaborador_base_set_updated_at() — evita reimplementar a
-- normalização em JS (deu incompatibilidade sutil de caracteres/colisões).
-- Já deduplica por nome_chave (1 linha por pessoa) e exclui quem colidiria
-- com um nome_chave já ocupado na tabela (ativo ou não, índice é global).
create or replace function public.geocode_colaborador_base_pendentes()
returns table (
  colaborador_id uuid,
  cpf text,
  nome text,
  nome_chave text,
  cep text,
  cidade text,
  estado text,
  endereco text,
  bairro text
)
language sql
stable
security definer
set search_path = public
as $$
  with ativos as (
    select
      c.id, regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') as cpf_norm,
      c.nome, c.cep, c.cidade, c.estado, c.endereco, c.bairro,
      upper(regexp_replace(translate(coalesce(c.nome, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+', ' ', 'g')) as nc
    from public.colaboradores c
    where upper(coalesce(c.situacao, '')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
      and coalesce(c.desligamento, '') = ''
      and regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') <> ''
  ),
  sem_base as (
    select a.* from ativos a
    where not exists (
      select 1 from public.operacional_colaborador_base b
      where b.ativo is true and regexp_replace(coalesce(b.cpf,''), '\D', '', 'g') = a.cpf_norm
    )
    and a.nc <> ''
    and not exists (
      select 1 from public.operacional_colaborador_base b2
      where b2.nome_chave = a.nc
    )
  ),
  com_dado_geo as (
    select * from sem_base
    where length(regexp_replace(coalesce(cep,''), '\D', '', 'g')) = 8
       or (coalesce(cidade,'') <> '' and coalesce(estado,'') <> '')
  ),
  dedup as (
    -- 1 linha por nome_chave (colaboradores duplicados/mesmo CPF em formatos
    -- diferentes) — mantém o cadastro mais recente.
    select distinct on (nc) *
    from com_dado_geo
    order by nc
  )
  select id, cpf_norm, nome, nc, cep, cidade, estado, endereco, bairro
  from dedup;
$$;
revoke execute on function public.geocode_colaborador_base_pendentes() from public, anon, authenticated;
grant execute on function public.geocode_colaborador_base_pendentes() to service_role;
