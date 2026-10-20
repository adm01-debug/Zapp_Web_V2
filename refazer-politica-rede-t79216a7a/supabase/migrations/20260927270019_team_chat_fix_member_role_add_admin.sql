ALTER TABLE public.team_conversation_members
  DROP CONSTRAINT IF EXISTS team_conversation_members_member_role_check;
ALTER TABLE public.team_conversation_members
  ADD CONSTRAINT team_conversation_members_member_role_check
  CHECK (member_role IN ('owner', 'admin', 'member'));
