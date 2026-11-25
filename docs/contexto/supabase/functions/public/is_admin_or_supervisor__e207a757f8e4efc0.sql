CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'supervisor'::public.app_role)
    )
  END;
$function$
