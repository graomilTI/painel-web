
ALTER TABLE envios_telegramas
  ADD COLUMN IF NOT EXISTS clinica_sst_id UUID REFERENCES rh_clinicas_sst(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS envios_telegramas_clinica_sst_idx ON envios_telegramas (clinica_sst_id);
;
