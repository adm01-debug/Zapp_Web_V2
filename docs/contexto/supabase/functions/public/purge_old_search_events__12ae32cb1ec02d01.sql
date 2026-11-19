CREATE OR REPLACE FUNCTION public.purge_old_search_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c_retention constant interval := interval '90 days'; v_removed integer;
BEGIN
  DELETE FROM public.search_events WHERE created_at < now()-c_retention;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$function$
