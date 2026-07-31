
ALTER TABLE logistica_abertura_os
  DROP CONSTRAINT IF EXISTS logistica_abertura_os_servico_check;

ALTER TABLE logistica_abertura_os
  ADD CONSTRAINT logistica_abertura_os_servico_check
  CHECK (servico IN (
    'FOB',
    'CIF',
    'AUDITORIA',
    'CLASSIFICAÇÃO TRANSB. SAÍDA',
    'ACOMPANHAMENTO DE EMBARQUE',
    'CLASSIFICAÇÃO TRANSB. ENTRADA'
  ));
;
