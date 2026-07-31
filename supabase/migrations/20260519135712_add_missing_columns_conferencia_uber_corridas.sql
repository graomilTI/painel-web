ALTER TABLE conferencia_uber_corridas
  ADD COLUMN IF NOT EXISTS distancia_km numeric,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS regional text,
  ADD COLUMN IF NOT EXISTS metodo_pagamento text,
  ADD COLUMN IF NOT EXISTS finalidade text;;
