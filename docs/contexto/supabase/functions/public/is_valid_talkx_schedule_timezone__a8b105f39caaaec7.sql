CREATE OR REPLACE FUNCTION public.is_valid_talkx_schedule_timezone(p_timezone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_timezone IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_timezone_names AS timezone
       WHERE timezone.name = p_timezone
     );
$function$
