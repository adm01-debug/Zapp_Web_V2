CREATE OR REPLACE FUNCTION public.guard_conversation_event_closure_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (
       (TG_OP = 'INSERT' AND NEW.closure_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.closure_id IS DISTINCT FROM OLD.closure_id)
     ) THEN
    RAISE EXCEPTION 'event_closure_id_internal_field_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
