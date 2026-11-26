CREATE OR REPLACE FUNCTION public.remind_me_about_message(p_message_id uuid, p_remind_at timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_profile_id uuid;
  v_contact_id uuid;
  v_title      text;
  v_task_id    uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  -- Janela do lembrete: futuro e no maximo 90 dias.
  IF p_remind_at IS NULL OR p_remind_at <= now() THEN
    RAISE EXCEPTION 'remind_at_in_past' USING ERRCODE = '22023';
  END IF;
  IF p_remind_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'remind_at_too_far' USING ERRCODE = '22023';
  END IF;

  -- So o contato da mensagem e lido, nunca o texto (PII fora de log).
  SELECT m.contact_id INTO v_contact_id
  FROM public.messages AS m
  WHERE m.id = p_message_id;

  -- Mensagem inexistente e contato oculto respondem o MESMO erro.
  IF v_contact_id IS NULL
     OR NOT public.is_contact_visible_to_user(v_contact_id, v_caller) THEN
    RAISE EXCEPTION 'message_not_visible' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  v_title := COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), 'Responder depois');

  INSERT INTO public.conversation_tasks
    (title, description, remind_at, contact_id, message_id, created_by, status)
  VALUES
    (v_title, NULL, p_remind_at, v_contact_id, p_message_id, v_profile_id, 'todo')
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$function$
