-- Compatibilidade de tipos para os lotes da conciliação de hotéis.
--
-- Em alguns lotes, valor_quadruplo contém somente NULL. Dentro de um bloco
-- VALUES, o PostgreSQL resolve uma coluna formada apenas por NULL como text.
-- A função principal recebe esse argumento como numeric, então a chamada era
-- procurada com a assinatura (..., numeric, numeric, numeric, numeric,
-- text, text, text) e falhava com SQLSTATE 42883.
--
-- Este overload mantém a função principal como fonte única da regra e converte
-- explicitamente o argumento textual para numeric. O timestamp posiciona esta
-- migration depois da criação da função e antes dos lotes 01–05.

begin;

create or replace function public.hospedagem_conciliar_hotel(
  p_nome text,
  p_cidade text,
  p_uf text,
  p_link_maps text,
  p_whatsapp text,
  p_endereco text,
  p_valor_padrao numeric,
  p_valor_individual numeric,
  p_valor_duplo numeric,
  p_valor_triplo numeric,
  p_valor_quadruplo text,
  p_prioridade text,
  p_observacoes text
)
returns text
language sql
as $$
  select public.hospedagem_conciliar_hotel(
    p_nome,
    p_cidade,
    p_uf,
    p_link_maps,
    p_whatsapp,
    p_endereco,
    p_valor_padrao,
    p_valor_individual,
    p_valor_duplo,
    p_valor_triplo,
    nullif(trim(p_valor_quadruplo), '')::numeric,
    p_prioridade,
    p_observacoes
  );
$$;

commit;
