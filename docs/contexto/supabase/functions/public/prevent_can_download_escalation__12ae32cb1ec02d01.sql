CREATE OR REPLACE FUNCTION public.prevent_can_download_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escalada boolean;
BEGIN
  v_escalada := (OLD.can_download IS DISTINCT FROM NEW.can_download);
  IF v_escalada AND NOT is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change the can_download flag';
  END IF;
  RETURN NEW;
END;
$function$
