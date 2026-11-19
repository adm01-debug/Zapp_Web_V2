CREATE OR REPLACE FUNCTION public.message_sender_atual(_message_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT m.sender
  FROM public.messages m
  WHERE m.id = _message_id
    AND (
      is_admin_or_supervisor(auth.uid())
      OR m.contact_id IN (
        SELECT c.id FROM contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
      OR EXISTS (
        SELECT 1 FROM contacts c
        JOIN queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = m.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
$function$
