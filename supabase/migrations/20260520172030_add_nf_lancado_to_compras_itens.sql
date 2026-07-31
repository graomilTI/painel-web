
ALTER TABLE compras_itens
  ADD COLUMN IF NOT EXISTS nf_lancado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nf_lancado_em timestamptz;
;
