CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$function$
