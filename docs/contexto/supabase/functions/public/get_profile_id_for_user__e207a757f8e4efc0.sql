CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1;
$function$
