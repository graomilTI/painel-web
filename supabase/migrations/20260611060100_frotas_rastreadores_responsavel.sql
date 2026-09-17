-- Frotas Rastreadores: campo Responsável (quem está acompanhando o rastreador)
ALTER TABLE public.frotas_rastreadores
  ADD COLUMN IF NOT EXISTS responsavel text CHECK (responsavel IN ('Anderson','Cleverson'));

CREATE INDEX IF NOT EXISTS idx_frotas_rastreadores_responsavel ON public.frotas_rastreadores (responsavel);
