-- Controle estruturado de alojamentos: contrato, endereço e serviços.
ALTER TABLE public.hospedagem_alojamentos
  ADD COLUMN IF NOT EXISTS contrato_url text,
  ADD COLUMN IF NOT EXISTS contrato_inicio date,
  ADD COLUMN IF NOT EXISTS contrato_fim date,
  ADD COLUMN IF NOT EXISTS endereco_logradouro text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS link_localizacao text,
  ADD COLUMN IF NOT EXISTS agua_inclusa boolean,
  ADD COLUMN IF NOT EXISTS agua_matricula text,
  ADD COLUMN IF NOT EXISTS energia_inclusa boolean,
  ADD COLUMN IF NOT EXISTS energia_matricula text,
  ADD COLUMN IF NOT EXISTS internet_inclusa boolean,
  ADD COLUMN IF NOT EXISTS internet_matricula text,
  ADD COLUMN IF NOT EXISTS gas_forma_pagamento text;
COMMENT ON COLUMN public.hospedagem_alojamentos.contrato_url IS 'URL do contrato vigente do alojamento';
COMMENT ON COLUMN public.hospedagem_alojamentos.link_localizacao IS 'URL compartilhável da localização no mapa';
COMMENT ON COLUMN public.hospedagem_alojamentos.agua_inclusa IS 'true quando a água está inclusa no aluguel; false quando paga separadamente';
COMMENT ON COLUMN public.hospedagem_alojamentos.energia_inclusa IS 'true quando a energia está inclusa no aluguel; false quando paga separadamente';
COMMENT ON COLUMN public.hospedagem_alojamentos.internet_inclusa IS 'true quando a internet está inclusa no aluguel; false quando paga separadamente';
