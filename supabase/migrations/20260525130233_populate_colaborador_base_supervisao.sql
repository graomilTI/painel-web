
UPDATE operacional_colaborador_base ocb
SET
  supervisao    = c.supervisao,
  coordenacao   = c.coordenacao,
  cpf           = REGEXP_REPLACE(c.cpf, '[^0-9]', '', 'g'),
  colaborador_id = c.id
FROM colaboradores c
WHERE UPPER(TRIM(c.nome)) = UPPER(TRIM(ocb.nome));
;
