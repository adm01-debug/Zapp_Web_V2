CREATE OR REPLACE FUNCTION public.set_scheduled_report_config_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.get_profile_id_for_user(auth.uid());
  END IF;
  RETURN NEW;
END;
$function$
