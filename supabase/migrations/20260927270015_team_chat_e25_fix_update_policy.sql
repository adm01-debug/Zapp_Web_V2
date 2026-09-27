-- E25: Security fix -- narrow UPDATE column privileges on team_conversation_members
-- Replaces broad table-level UPDATE with column-level grants for preference columns only.
-- Role changes go through set_team_member_role() SECURITY DEFINER function.

-- Revoke table-level UPDATE from authenticated (was granted by E09)
REVOKE UPDATE ON public.team_conversation_members FROM authenticated;

-- Grant UPDATE only on preference columns
GRANT UPDATE (last_read_at, is_muted, is_pinned, is_archived)
  ON public.team_conversation_members TO authenticated;

-- Split the over-broad E09 policy into two targeted ones
DROP POLICY IF EXISTS "Members can update own row admins can update any" ON public.team_conversation_members;
DROP POLICY IF EXISTS "Members can update own preferences" ON public.team_conversation_members;
DROP POLICY IF EXISTS "Admins can update any member row" ON public.team_conversation_members;

CREATE POLICY "Members can update own preferences"
  ON public.team_conversation_members FOR UPDATE
  USING (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can update any member row"
  ON public.team_conversation_members FOR UPDATE
  USING (
    is_admin_or_supervisor(auth.uid())
  );

-- SECURITY DEFINER function so owners/admins can change member_role without
-- needing direct UPDATE on the member_role column
CREATE OR REPLACE FUNCTION public.set_team_member_role(
  p_conversation_id uuid,
  p_profile_id     uuid,
  p_new_role       text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;
  -- Caller must be admin/supervisor OR owner of this conversation
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND member_role = 'owner'
    ) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;
  UPDATE public.team_conversation_members
     SET member_role = p_new_role
   WHERE conversation_id = p_conversation_id
     AND profile_id = p_profile_id;
END; $$;
