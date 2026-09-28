-- E49: RPC toggle_team_message_reaction - adiciona ou remove reacao

CREATE OR REPLACE FUNCTION public.toggle_team_message_reaction(
  p_message_id UUID,
  p_emoji TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_conv_id UUID;
  v_existing_id UUID;
  v_action TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Buscar conversation_id da mensagem
  SELECT conversation_id INTO v_conv_id
  FROM public.team_messages WHERE id = p_message_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found');
  END IF;

  -- Verificar membership
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
    WHERE conversation_id = v_conv_id AND profile_id = v_caller
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- Toggle: se ja existe, remove; se nao existe, adiciona
  SELECT id INTO v_existing_id
  FROM public.team_message_reactions
  WHERE message_id = p_message_id AND profile_id = v_caller AND emoji = p_emoji;

  IF FOUND THEN
    DELETE FROM public.team_message_reactions WHERE id = v_existing_id;
    v_action := 'removed';
  ELSE
    INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id)
    VALUES (p_message_id, v_caller, p_emoji, v_conv_id);
    v_action := 'added';
  END IF;

  RETURN jsonb_build_object('success', true, 'action', v_action);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_team_message_reaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_team_message_reaction(UUID, TEXT) TO authenticated;
