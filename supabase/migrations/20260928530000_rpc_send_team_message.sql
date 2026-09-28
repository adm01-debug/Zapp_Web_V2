-- E39: RPC send_team_message - envia mensagem e atualiza updated_at da conversa

CREATE OR REPLACE FUNCTION public.send_team_message(
  p_conversation_id UUID,
  p_content TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'text',
  p_reply_to_id UUID DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL,
  p_media_bucket TEXT DEFAULT NULL,
  p_media_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_msg_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar membership
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id AND profile_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- Validar que text tem content ou media
  IF p_message_type = 'text' AND (p_content IS NULL OR trim(p_content) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'content_required_for_text');
  END IF;

  INSERT INTO public.team_messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    reply_to_id,
    media_url,
    media_type,
    media_bucket,
    media_path,
    status,
    is_edited
  ) VALUES (
    p_conversation_id,
    v_caller,
    p_content,
    p_message_type,
    p_reply_to_id,
    p_media_url,
    p_media_type,
    p_media_bucket,
    p_media_path,
    'sent',
    false
  ) RETURNING id INTO v_msg_id;

  -- Atualizar updated_at da conversa
  UPDATE public.team_conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_team_message(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_team_message(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
