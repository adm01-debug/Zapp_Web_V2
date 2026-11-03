CREATE OR REPLACE FUNCTION public.guard_conversation_closure_request_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (
       (TG_OP = 'INSERT' AND NEW.client_request_id IS NOT NULL)
       OR (TG_OP = 'UPDATE'
           AND NEW.client_request_id IS DISTINCT FROM OLD.client_request_id)
     ) THEN
    RAISE EXCEPTION 'closure_request_id_internal_field_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
