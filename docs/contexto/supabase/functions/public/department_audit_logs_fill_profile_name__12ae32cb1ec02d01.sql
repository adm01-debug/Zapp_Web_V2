CREATE OR REPLACE FUNCTION public.department_audit_logs_fill_profile_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.profile_id IS NOT NULL AND NEW.profile_name IS NULL THEN
    SELECT name INTO NEW.profile_name FROM public.profiles WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$function$
