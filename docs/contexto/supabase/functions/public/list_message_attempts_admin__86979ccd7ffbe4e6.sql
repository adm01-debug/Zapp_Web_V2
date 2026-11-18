CREATE OR REPLACE FUNCTION public.list_message_attempts_admin(p_message_id uuid)
 RETURNS TABLE(attempt_no integer, outcome text, error_code text, error_message text, provider_response jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT a.attempt_no, a.outcome, a.error_code, a.error_message,
           a.provider_response, a.created_at
    FROM public.message_attempts AS a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at DESC, a.attempt_no DESC;
END;
$function$
