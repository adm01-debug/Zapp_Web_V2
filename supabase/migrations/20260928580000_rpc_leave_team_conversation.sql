-- E44: RPC leave_team_conversation - sai de uma conversa

CREATE OR REPLACE FUNCTION public.leave_team_conversation(
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_member RECORD;
  v_admin_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_member
  FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = v_caller;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- Se for admin, verificar se ha outro admin
  IF v_member.member_role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id
      AND member_role = 'admin'
      AND profile_id != v_caller;

    IF v_admin_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'must_assign_admin_before_leaving');
    END IF;
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = v_caller;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_team_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team_conversation(UUID) TO authenticated;
