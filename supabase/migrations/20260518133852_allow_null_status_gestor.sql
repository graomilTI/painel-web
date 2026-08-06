
ALTER TABLE operacional_os ALTER COLUMN status_gestor DROP NOT NULL;

UPDATE operacional_os
SET status_gestor  = NULL,
    configurada_em = NULL,
    updated_at     = now();
;
