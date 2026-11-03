CREATE OR REPLACE FUNCTION public.assume_conversation(p_contact_id uuid)
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

  -- Assumir conversa resolved reabre o atendimento; archived continua bloqueado.
  IF v_contact.conversation_status = 'archived' THEN
    RAISE EXCEPTION 'conversation_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- Quem pode assumir: qualquer papel precisa pertencer ativamente a fila do contato.
  -- Admin/supervisor podem tomar por cima, mas nao fora das suas filas nem sem fila.
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

  -- Ja tem responsavel e nao sou eu: so admin/supervisor assume por cima.
  v_expected := v_contact.assigned_to;
  IF v_expected IS NOT NULL AND v_expected <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'already_assigned' USING ERRCODE = 'P0001';
  END IF;

  -- Concorrencia otimista: so grava se o responsavel ainda for o que li.
  UPDATE public.contacts
     SET assigned_to = v_profile_id,
         conversation_status = 'open',
         conversation_status_changed_at = now()
   WHERE id = p_contact_id
     AND assigned_to IS NOT DISTINCT FROM v_expected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_assignment' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'conversation_assumed',
    'contact',
    p_contact_id,
    jsonb_build_object(
      'queue_id', v_contact.queue_id,
      'previous_assigned_to', v_expected,
      'assigned_to', v_profile_id,
      'previous_status', v_contact.conversation_status,
      'status', 'open'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'assigned_to', v_profile_id,
    'queue_id', v_contact.queue_id,
    'conversation_status', 'open'
  );
END;
$function$
