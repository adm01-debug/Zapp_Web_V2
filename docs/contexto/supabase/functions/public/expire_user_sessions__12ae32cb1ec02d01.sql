CREATE OR REPLACE FUNCTION public.expire_user_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_sessions
     SET is_active = false,
         ended_at = COALESCE(ended_at, now())
   WHERE is_active IS TRUE
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
