CREATE OR REPLACE FUNCTION public.close_conversation_atomic(p_contact_id uuid, p_client_request_id uuid, p_close_reason text, p_outcome text DEFAULT NULL::text, p_classification text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(closure_id uuid, event_id uuid, contact_id uuid, conversation_status text, conversation_status_changed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := COALESCE(auth.role(), '');
  v_profile_id uuid;
  v_current_status text;
  v_existing public.conversation_closures%ROWTYPE;
  v_closure_id uuid;
  v_event_id uuid;
  v_changed_at timestamptz;
BEGIN
  IF v_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_client_request_id IS NULL
     OR p_close_reason IS NULL OR p_close_reason NOT IN (
       'resolved', 'no_response', 'transferred', 'spam', 'duplicate',
       'self_resolved', 'other', 'inactivity'
     )
     OR (p_outcome IS NOT NULL AND p_outcome NOT IN (
       'sale', 'lead_qualified', 'support_resolved', 'follow_up', 'lost',
       'no_outcome', 'auto_closed'
     ))
     OR (p_classification IS NOT NULL AND p_classification NOT IN (
       'sales', 'support', 'billing', 'complaint', 'information', 'feedback'
     ))
     OR length(COALESCE(p_notes, '')) > 4000 THEN
    RAISE EXCEPTION 'invalid_conversation_closure' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'authenticated' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT contact.conversation_status INTO v_current_status
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    IF v_role = 'authenticated' THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'authenticated' THEN
    SELECT profile.id INTO v_profile_id
    FROM public.profiles AS profile
    WHERE profile.user_id = auth.uid() AND profile.is_active = true
    LIMIT 1
    FOR SHARE;
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
    END IF;
    IF public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.conversation_closures AS closure
  WHERE closure.contact_id = p_contact_id
    AND closure.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.closed_by IS DISTINCT FROM v_profile_id
       OR v_existing.close_reason IS DISTINCT FROM p_close_reason
       OR v_existing.outcome IS DISTINCT FROM p_outcome
       OR v_existing.classification IS DISTINCT FROM p_classification
       OR v_existing.notes IS DISTINCT FROM p_notes THEN
      RAISE EXCEPTION 'closure_request_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
    SELECT event.id INTO v_event_id
    FROM public.conversation_events AS event
    WHERE event.closure_id = v_existing.id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'closure_event_invariant_broken' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_event_id, p_contact_id,
      'resolved'::text, v_existing.created_at;
    RETURN;
  END IF;

  IF v_current_status NOT IN ('open', 'waiting') THEN
    RAISE EXCEPTION 'invalid_transition % -> resolved', v_current_status
      USING ERRCODE = '23514';
  END IF;

  -- The canonical FSM trigger also writes NOW() (transaction timestamp).
  -- Use the same clock so the persisted contact value and replay payload stay
  -- identical even when the transaction began before this statement.
  v_changed_at := transaction_timestamp();

  INSERT INTO public.conversation_closures (
    contact_id, closed_by, close_reason, outcome, classification, notes,
    client_request_id, created_at
  ) VALUES (
    p_contact_id, v_profile_id, p_close_reason, p_outcome, p_classification,
    p_notes, p_client_request_id, v_changed_at
  ) RETURNING id INTO v_closure_id;

  UPDATE public.contacts
  SET conversation_status = 'resolved',
      conversation_status_changed_at = v_changed_at
  WHERE id = p_contact_id
  RETURNING contacts.conversation_status_changed_at INTO v_changed_at;

  INSERT INTO public.conversation_events (
    contact_id, event_type, performed_by, closure_id, metadata
  ) VALUES (
    p_contact_id, 'close', v_profile_id, v_closure_id,
    jsonb_strip_nulls(jsonb_build_object(
      'close_reason', p_close_reason,
      'outcome', p_outcome,
      'classification', p_classification
    ))
  ) RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_closure_id, v_event_id, p_contact_id,
    'resolved'::text, v_changed_at;
END;
$function$
