CREATE OR REPLACE FUNCTION public.trg_revoke_sessions_on_profile_deactivate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active = false THEN
    PERFORM public.revoke_auth_sessions('global', NULL, NEW.user_id, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$function$
