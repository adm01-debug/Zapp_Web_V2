CREATE OR REPLACE FUNCTION public.force_conversation_closure_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(auth.role(), '') IN ('authenticated', 'anon') THEN
      NEW.closed_by := OLD.closed_by;
    END IF;
    RETURN NEW;
  END IF;
  IF v_uid IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    NEW.closed_by := public.get_profile_id_for_user(v_uid);
  END IF;
  RETURN NEW;
END;
$function$
