-- E14: Create team_message_receipts table for per-member delivery/read receipts
CREATE TABLE IF NOT EXISTS public.team_message_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'delivered',
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT team_message_receipts_status_check CHECK (status IN ('delivered', 'read')),
  CONSTRAINT team_message_receipts_message_profile_unique UNIQUE (message_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_team_message_receipts_message_id
  ON public.team_message_receipts (message_id);

CREATE INDEX IF NOT EXISTS idx_team_message_receipts_unread
  ON public.team_message_receipts (message_id)
  WHERE status <> 'read';

ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;

-- Members of the conversation can see receipts for messages in that conversation
CREATE POLICY "Conversation members can read receipts"
  ON public.team_message_receipts FOR SELECT
  USING (
    is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Each member can only insert/update their own receipt
CREATE POLICY "Members can insert own receipts"
  ON public.team_message_receipts FOR INSERT
  WITH CHECK (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can update own receipts"
  ON public.team_message_receipts FOR UPDATE
  USING (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );
