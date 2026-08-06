DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', fn.sig, 'public, pg_temp');
  END LOOP;
END $$;
;
