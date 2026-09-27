-- E15: Add is_pinned, is_archived, member_role to team_conversation_members
ALTER TABLE public.team_conversation_members
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'member';

ALTER TABLE public.team_conversation_members
  DROP CONSTRAINT IF EXISTS team_conversation_members_member_role_check;
ALTER TABLE public.team_conversation_members
  ADD CONSTRAINT team_conversation_members_member_role_check
  CHECK (member_role IN ('owner', 'admin', 'member'));
