-- E47: RPC get_department_members - lista membros de um departamento via conversas

CREATE OR REPLACE FUNCTION public.get_department_members(
  p_department_id UUID
)
RETURNS TABLE (
  profile_id UUID,
  member_role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  -- Caller deve ser membro ou admin
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversations tc
    JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
    WHERE tc.department_id = p_department_id
      AND tcm.profile_id = v_caller
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (tcm.profile_id)
    tcm.profile_id,
    tcm.member_role,
    tcm.joined_at
  FROM public.team_conversations tc
  JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
  WHERE tc.department_id = p_department_id
  ORDER BY tcm.profile_id, tcm.joined_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_department_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_members(UUID) TO authenticated;
