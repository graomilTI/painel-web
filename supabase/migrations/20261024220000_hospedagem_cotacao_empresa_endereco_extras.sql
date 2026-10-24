-- Cotação por link do hotel: dados da empresa (as mesmas perguntas de Compras), endereço do hotel e extras inclusos na diária.
-- empresa_dados guarda { cnpj, razao_social, regime_tributario, endereco: { cep, logradouro, numero, complemento, bairro, cidade, uf } }
-- como veio na resposta (é o retrato daquela cotação; o cadastro do hotel só é preenchido onde estava vazio).
-- extras_outros guarda as chaves marcadas além de café/almoço/janta/estacionamento, que continuam nas colunas booleanas de sempre.

alter table public.hospedagem_cotacoes
  add column if not exists empresa_dados jsonb,
  add column if not exists extras_outros text[] not null default '{}',
  add column if not exists extras_outros_texto text;

alter table public.hospedagem_hoteis
  add column if not exists regime_tributario text;

comment on column public.hospedagem_cotacoes.empresa_dados is 'Empresa e endereço informados pelo hotel no link (cnpj, razao_social, regime_tributario, endereco{...}).';
comment on column public.hospedagem_cotacoes.extras_outros is 'Extras inclusos na diária além de café/almoço/janta/estacionamento (chaves de EXTRAS_OUTROS em cotacaoHotelRegras.js).';
comment on column public.hospedagem_hoteis.regime_tributario is 'simples_nacional | lucro_presumido | lucro_real, como o hotel informou na cotação por link.';
