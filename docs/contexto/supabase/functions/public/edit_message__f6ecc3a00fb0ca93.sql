CREATE OR REPLACE FUNCTION public.edit_message(p_message_id uuid, p_new_content text)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_content text;
  v_message public.messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_edit' USING ERRCODE = '22023';
  END IF;

  v_content := btrim(p_new_content);
  IF v_content IS NULL OR v_content = '' THEN
    RAISE EXCEPTION 'invalid_message_edit_content' USING ERRCODE = '22023';
  END IF;
  IF length(v_content) > 4096 THEN
    RAISE EXCEPTION 'message_edit_content_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages
  WHERE id = p_message_id
  FOR UPDATE;

  -- Mesmo erro para "nao existe" e "nao pode ver": nao vira oraculo de
  -- existencia de mensagem para quem nao tem visibilidade do contato.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found_or_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF public.is_contact_visible_to_user(v_message.contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_not_found_or_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  -- Só mensagem enviada pelo agente, ja com id do provedor, e viva.
  IF v_message.sender <> 'agent'
     OR v_message.external_id IS NULL
     OR v_message.is_deleted IS TRUE THEN
    RAISE EXCEPTION 'message_not_editable' USING ERRCODE = '42501';
  END IF;

  IF v_message.created_at < statement_timestamp() - interval '15 minutes' THEN
    RAISE EXCEPTION 'message_edit_window_expired' USING ERRCODE = '22023';
  END IF;

  -- Marca de sessao lida pela guarda; so o dono (postgres) a carrega.
  PERFORM set_config('app.edit_message_rpc', 'on', true);

  UPDATE public.messages
  SET content = v_content,
      is_edited = true,
      updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'message_edited',
    'message',
    p_message_id,
    jsonb_build_object('contact_id', v_message.contact_id)
  );

  RETURN v_message;
END;
$function$
