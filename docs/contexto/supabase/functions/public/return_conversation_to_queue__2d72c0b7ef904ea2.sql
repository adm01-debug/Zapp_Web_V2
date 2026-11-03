CREATE OR REPLACE FUNCTION public.return_conversation_to_queue(p_contact_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_profile_id uuid;
  v_contact    record;
  v_expected   uuid;
  v_is_admin   boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_user_id);
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin_or_supervisor(v_user_id);

  SELECT id, assigned_to, queue_id, conversation_status
    INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id;

  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_contact.conversation_status IN ('resolved', 'archived') THEN
    RAISE EXCEPTION 'conversation_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- Devolver a fila tambem e restrito a fila: nem admin/supervisor atua fora
  -- das suas filas, e contato sem fila nao pode ser devolvido "a fila".
  IF v_contact.queue_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.queue_members qm
        WHERE qm.queue_id = v_contact.queue_id
          AND qm.profile_id = v_profile_id
          AND qm.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotente para usuario autorizado da fila: sem responsavel, ja esta na fila.
  IF v_contact.assigned_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'contact_id', p_contact_id,
      'assigned_to', NULL,
      'queue_id', v_contact.queue_id,
      'conversation_status', v_contact.conversation_status
    );
  END IF;

  -- So o responsavel atual ou admin/supervisor (ja validado na fila) devolvem a fila.
  IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_expected := v_contact.assigned_to;

  UPDATE public.contacts
     SET assigned_to = NULL,
         conversation_status = 'waiting',
         conversation_status_changed_at = now()
   WHERE id = p_contact_id
     AND assigned_to = v_expected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'conversation_returned_to_queue',
    'contact',
    p_contact_id,
    jsonb_build_object(
      'queue_id', v_contact.queue_id,
      'previous_assigned_to', v_expected,
      'reason', p_reason,
      'previous_status', v_contact.conversation_status,
      'status', 'waiting'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'assigned_to', NULL,
    'queue_id', v_contact.queue_id,
    'conversation_status', 'waiting'
  );
END;
$function$
