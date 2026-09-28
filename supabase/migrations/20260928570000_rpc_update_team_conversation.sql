-- E43: RPC update_team_conversation - atualiza nome/avatar/metadata de um grupo

CREATE OR REPLACE FUNCTION public.update_team_conversation(
  p_conversation_id UUID,
  p_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_conv RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar se e admin da conversa ou admin do sistema
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id
      AND profile_id = v_caller
      AND member_role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT * INTO v_conv FROM public.team_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'conversation_not_found');
  END IF;

  IF v_conv.type = 'direct' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_update_direct_conversation');
  END IF;

  UPDATE public.team_conversations
  SET
    name = COALESCE(p_name, name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    metadata = CASE WHEN p_metadata IS NOT NULL THEN metadata || p_metadata ELSE metadata END,
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_team_conversation(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_conversation(UUID, TEXT, TEXT, JSONB) TO authenticated;
