
ALTER TABLE compras_solicitacoes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE compras_solicitacoes SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
;
