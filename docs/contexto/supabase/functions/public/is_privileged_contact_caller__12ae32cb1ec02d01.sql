CREATE OR REPLACE FUNCTION public.is_privileged_contact_caller()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin']);
$function$
