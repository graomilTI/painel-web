-- Redireciona a view colaboradores_atuais de colaborador_snapshot (legado, parado
-- em 2026-06-18) para colaboradores (sincronizada por agentes-grm-sync).
--
-- DROP+CREATE (não CREATE OR REPLACE) pois a view antiga expunha colunas via
-- select * sobre colaborador_snapshot; sem objetos dependentes (checado via pg_depend).
--
-- cpf normalizado com regexp_replace: ~731 registros "Ativo" em colaboradores
-- chegam da GRM com CPF mascarado (XXX.XXX.XXX-XX); resto da base e consumidores
-- JS esperam dígitos limpos.
--
-- ativo derivado de situacao='Ativo'. data_referencia mantido (mesma data pra
-- todas as linhas) só pra não quebrar código legado que ainda faz reduce/filter
-- por ele (vira no-op).
--
-- Colunas whatsapp/email_pessoal/email_empresa/endereco/bairro/cidade/estado/cep
-- incluídas porque frotas-motoristas.js e a edge function update-bfleet-condutores
-- consultam a view diretamente por elas (fora do cache), não fazem parte do
-- conjunto que colaboradoresCache.js usa.
drop view if exists public.colaboradores_atuais;

create view public.colaboradores_atuais as
select
  id,
  nome,
  regexp_replace(coalesce(cpf, ''), '\D', '', 'g') as cpf,
  tipo,
  cargo,
  supervisao,
  coordenacao,
  empresa,
  situacao,
  (situacao = 'Ativo') as ativo,
  coalesce(sincronizado_em, updated_at, created_at)::date as data_referencia,
  whatsapp,
  email_pessoal,
  email_empresa,
  endereco,
  bairro,
  cidade,
  estado,
  cep
from public.colaboradores;

grant select on public.colaboradores_atuais to authenticated;;
