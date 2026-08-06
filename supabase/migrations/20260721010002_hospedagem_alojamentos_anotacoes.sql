-- Anotações datadas por alojamento (janela Observações + calendário).
ALTER TABLE public.hospedagem_alojamentos
  ADD COLUMN IF NOT EXISTS anotacoes jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.hospedagem_alojamentos.anotacoes IS 'Lista de anotações datadas: [{id, data, texto, autor, criado_por, criado_em}]';
