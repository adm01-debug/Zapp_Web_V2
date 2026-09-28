-- E45: RPCs add_team_conversation_member e remove_team_conversation_member

CREATE OR REPLACE FUNCTION public.add_team_conversation_member(
  p_conversation_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verificar se caller e admin da conversa
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

  IF p_role NOT IN ('member', 'moderator', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role');
  END IF;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
  VALUES (p_conversation_id, p_user_id, p_role)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE SET member_role = p_role;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_team_conversation_member(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_target RECORD;
  v_admin_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Caller pode remover a si mesmo (leave) ou deve ser admin
  IF v_caller != p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = v_caller AND member_role = 'admin'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_permissions');
    END IF;
  END IF;

  SELECT * INTO v_target
  FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- Guard ultimo admin
  IF v_target.member_role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id AND member_role = 'admin' AND profile_id != p_user_id;

    IF v_admin_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_remove_last_admin');
    END IF;
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_team_conversation_member(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_team_conversation_member(UUID, UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_team_conversation_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_conversation_member(UUID, UUID) TO authenticated;
