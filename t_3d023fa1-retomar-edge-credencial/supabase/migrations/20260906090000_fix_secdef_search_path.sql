CREATE OR REPLACE FUNCTION public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_current TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  IF v_current = 'open'     AND p_next IN ('waiting','resolved','archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open','resolved','archived')    THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open','archived')               THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                             THEN v_allowed := TRUE; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
  END IF;

  UPDATE public.contacts
  SET conversation_status = p_next,
      conversation_status_changed_at = NOW()
  WHERE id = p_contact_id;

  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$
