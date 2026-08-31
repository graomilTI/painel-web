ALTER TABLE public.programacao_veiculo_proprio
  ADD COLUMN IF NOT EXISTS tarifa_km numeric(12,2) NOT NULL DEFAULT 1.20;

COMMENT ON COLUMN public.programacao_veiculo_proprio.tarifa_km IS 'Valor R$/km de reembolso para este colaborador (Conferência > Deslocamento > Configuração). Não é global; cada colaborador tem a sua.';
