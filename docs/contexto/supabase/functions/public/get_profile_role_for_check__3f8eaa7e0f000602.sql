CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
 RETURNS TABLE(role text, access_level text, permissions jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))
  LIMIT 1;
$function$
