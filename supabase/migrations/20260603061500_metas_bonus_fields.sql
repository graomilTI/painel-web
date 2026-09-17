-- Colunas de bônus no fechamento de metas
ALTER TABLE metas_producao
  ADD COLUMN IF NOT EXISTS gestor                TEXT,
  ADD COLUMN IF NOT EXISTS salario               NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS bonus_percentual_minimo NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS bonus_producao        NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS qualifica_bonus       BOOLEAN DEFAULT FALSE;
