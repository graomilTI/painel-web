
ALTER TABLE operacional_os
  DROP CONSTRAINT operacional_os_status_gestor_check,
  ADD CONSTRAINT operacional_os_status_gestor_check
    CHECK (status_gestor = ANY (ARRAY['AGUARDAR','ATENDER','FINALIZAR','AJUSTAR']));
;
