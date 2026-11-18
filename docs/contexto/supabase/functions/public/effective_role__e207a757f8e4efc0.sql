CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    ELSE 'agent'::app_role
  END
  FROM public.user_roles
  WHERE user_id = _user_id
$function$
