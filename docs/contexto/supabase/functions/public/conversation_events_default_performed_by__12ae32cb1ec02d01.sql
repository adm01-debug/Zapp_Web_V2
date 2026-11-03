CREATE OR REPLACE FUNCTION public.conversation_events_default_performed_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.performed_by IS NULL THEN
    NEW.performed_by := public.current_profile_id();
  END IF;
  RETURN NEW;
END;
$function$
