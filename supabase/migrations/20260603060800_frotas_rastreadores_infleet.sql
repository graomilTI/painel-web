-- Coluna infleet: status de cadastro no sistema Infleet
ALTER TABLE public.frotas_rastreadores
  ADD COLUMN IF NOT EXISTS infleet text CHECK (infleet IN ('OK','PENDENTE'));
