ALTER TABLE grm_adiantamentos_importacoes
  ADD COLUMN IF NOT EXISTS pendente_no_grm BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saiu_pendente_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_grm_adiantamentos_pendente_no_grm ON grm_adiantamentos_importacoes(pendente_no_grm);
;
