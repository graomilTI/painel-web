-- Fix: data_referencia estava usando sincronizado_em/updated_at POR LINHA, mas
-- esses campos refletem "última vez que ESSE registro individual mudou", não uma
-- foto uniforme. Como upsert só toca linhas alteradas, a maioria dos colaboradores
-- tem sincronizado_em de dias/semanas atrás — código legado que faz
-- "reduce pra achar a data máxima, depois filtra só essa data" (ex.: hospedagem.js)
-- descartaria ~70% dos colaboradores por engano.
--
-- Fix: data_referencia agora é current_date, igual pra todas as linhas — qualquer
-- filtro "pega só a data mais recente" vira no-op inofensivo, já que não há mais
-- dimensão histórica real nessa tabela.
create or replace view public.colaboradores_atuais as
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
  current_date as data_referencia,
  whatsapp,
  email_pessoal,
  email_empresa,
  endereco,
  bairro,
  cidade,
  estado,
  cep
from public.colaboradores;;
