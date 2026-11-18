CREATE OR REPLACE FUNCTION public.get_last_message_dates(contact_ids uuid[])
RETURNS TABLE(contact_id uuid, last_message_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    m.contact_id,
    MAX(m.created_at) AS last_message_at
  FROM public.messages m
  WHERE m.contact_id = ANY(contact_ids)
    AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
  GROUP BY m.contact_id;
$function$

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM authenticated

REVOKE EXECUTE ON FUNCTION public.get_own_lockout_status(text) FROM authenticated
