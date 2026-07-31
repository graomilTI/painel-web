
ALTER TABLE logistica_abertura_os
  ADD COLUMN IF NOT EXISTS servico TEXT
    CHECK (servico IN ('FOB','CIF','AUDITORIA','CLASSIFICAÇÃO TRANSB. SAÍDA'));
;
