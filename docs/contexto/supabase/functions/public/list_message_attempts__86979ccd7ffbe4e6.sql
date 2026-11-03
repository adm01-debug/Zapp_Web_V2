CREATE OR REPLACE FUNCTION public.list_message_attempts(p_message_id uuid)
 RETURNS TABLE(attempt_no integer, outcome text, error_code text, error_message text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messages AS m
    WHERE m.id = p_message_id
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.attempt_no, a.outcome, a.error_code, a.error_message, a.created_at
    FROM public.message_attempts AS a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at DESC, a.attempt_no DESC;
END;
$function$
