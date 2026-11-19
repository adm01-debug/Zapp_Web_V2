CREATE OR REPLACE FUNCTION public.complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_id' USING ERRCODE = '22023';
  END IF;

  SELECT dispatch.status
    INTO v_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'sending' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET status = (CASE
           WHEN dispatch.failed_count + dispatch.outcome_unknown_count > 0 THEN 'completed_with_failures'
           ELSE 'completed'
         END)::public.multiplix_dispatch_status,
         completed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE dispatch.id = p_dispatch_id
     AND dispatch.status = 'sending';

  RETURN FOUND;
END;
$function$
