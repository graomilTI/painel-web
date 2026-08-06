CREATE OR REPLACE FUNCTION public.limpar_patrimonios_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  truncate table public.patrimonios_snapshot;
end;
$function$;;
