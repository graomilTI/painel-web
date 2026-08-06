
UPDATE operacional_colaborador_base ocb
SET ativo = CASE WHEN c.situacao = 'Ativo' THEN true ELSE false END
FROM colaboradores c
WHERE c.id = ocb.colaborador_id;
;
