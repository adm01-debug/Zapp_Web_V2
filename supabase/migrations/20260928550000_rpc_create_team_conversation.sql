-- E41: RPC create_team_conversation - cria conversa de grupo

CREATE OR REPLACE FUNCTION public.create_team_conversation(
  p_name TEXT,
  p_type TEXT DEFAULT 'group',
  p_avatar_url TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_initial_members UUID[] DEFAULT ARRAY[]::UUID[],
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_conv_id UUID;
  v_member UUID;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN ('group', 'department', 'announcement') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_type_use_get_or_create_for_direct');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'name_required');
  END IF;

  INSERT INTO public.team_conversations (
    name, type, avatar_url, department_id, created_by, metadata
  ) VALUES (
    trim(p_name), p_type, p_avatar_url, p_department_id, v_caller, COALESCE(p_metadata, '{}')
  ) RETURNING id INTO v_conv_id;

  -- Adicionar criador como admin
  INSERT INTO public.team_conversation_members (
    conversation_id, profile_id, member_role
  ) VALUES (v_conv_id, v_caller, 'admin');

  -- Adicionar membros iniciais
  FOREACH v_member IN ARRAY p_initial_members LOOP
    IF v_member != v_caller THEN
      INSERT INTO public.team_conversation_members (
        conversation_id, profile_id, member_role
      ) VALUES (v_conv_id, v_member, 'member')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'conversation_id', v_conv_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_team_conversation(TEXT, TEXT, TEXT, UUID, UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_conversation(TEXT, TEXT, TEXT, UUID, UUID[], JSONB) TO authenticated;
