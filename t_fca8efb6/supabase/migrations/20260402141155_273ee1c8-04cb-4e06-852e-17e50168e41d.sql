-- The current SELECT policy only allows members to view conversations,
-- but when creating, the user isn't a member yet (members are inserted after).
-- The .insert().select().single() call needs the creator to see the row.

-- Drop and recreate the SELECT policy to also allow the creator
DROP POLICY IF EXISTS "Members can view their conversations" ON public.team_conversations;

CREATE POLICY "Members can view their conversations"
ON public.team_conversations
FOR SELECT
USING (
  is_team_conversation_member(auth.uid(), id)
  OR created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
);