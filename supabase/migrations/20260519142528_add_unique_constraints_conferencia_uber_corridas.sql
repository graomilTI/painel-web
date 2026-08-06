ALTER TABLE conferencia_uber_corridas ADD CONSTRAINT conferencia_uber_external_id_unique UNIQUE (external_id);
ALTER TABLE conferencia_uber_corridas ADD CONSTRAINT conferencia_uber_import_hash_unique UNIQUE (import_hash);;
