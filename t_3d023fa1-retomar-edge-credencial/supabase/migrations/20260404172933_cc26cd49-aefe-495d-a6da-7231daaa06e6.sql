
-- ============================================
-- Fix team_conversations policies: public -> authenticated
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.team_conversations;
DROP POLICY IF EXISTS "Creator can update conversation" ON public.team_conversations;
DROP POLICY IF EXISTS "Members can view their conversations" ON public.team_conversations;

CREATE POLICY "Members can view their conversations"
ON public.team_conversations
FOR SELECT
TO authenticated
USING (
  public.is_team_conversation_member(auth.uid(), id)
  OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Authenticated users can create conversations"
ON public.team_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Creator can update conversation"
ON public.team_conversations
FOR UPDATE
TO authenticated
USING (
  created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

-- ============================================
-- Fix team_messages policies: public -> authenticated
-- ============================================

DROP POLICY IF EXISTS "Members can send messages" ON public.team_messages;
DROP POLICY IF EXISTS "Members can view conversation messages" ON public.team_messages;
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.team_messages;
DROP POLICY IF EXISTS "Senders can edit own messages" ON public.team_messages;

CREATE POLICY "Members can view conversation messages"
ON public.team_messages
FOR SELECT
TO authenticated
USING (public.is_team_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members can send messages"
ON public.team_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_team_conversation_member(auth.uid(), conversation_id)
  AND sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Senders can edit own messages"
ON public.team_messages
FOR UPDATE
TO authenticated
USING (
  sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Senders can delete own messages"
ON public.team_messages
FOR DELETE
TO authenticated
USING (
  sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);
