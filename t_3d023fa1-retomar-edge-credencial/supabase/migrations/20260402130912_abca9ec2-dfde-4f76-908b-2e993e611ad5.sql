
-- Team Conversations
CREATE TABLE public.team_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name TEXT,
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

-- Members
CREATE TABLE public.team_conversation_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  is_muted BOOLEAN DEFAULT false,
  UNIQUE(conversation_id, profile_id)
);

ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.team_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  reply_to_id UUID REFERENCES public.team_messages(id),
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_team_messages_conversation ON public.team_messages(conversation_id, created_at DESC);
CREATE INDEX idx_team_members_profile ON public.team_conversation_members(profile_id);
CREATE INDEX idx_team_members_conversation ON public.team_conversation_members(conversation_id);

-- Helper function: check membership
CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id UUID, _conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$$;

-- RLS: team_conversations
CREATE POLICY "Members can view their conversations"
  ON public.team_conversations FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create conversations"
  ON public.team_conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Creator can update conversation"
  ON public.team_conversations FOR UPDATE
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS: team_conversation_members
CREATE POLICY "Members can view conversation members"
  ON public.team_conversation_members FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Authenticated users can add members"
  ON public.team_conversation_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Members can update own membership"
  ON public.team_conversation_members FOR UPDATE
  USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Members can leave conversations"
  ON public.team_conversation_members FOR DELETE
  USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS: team_messages
CREATE POLICY "Members can view conversation messages"
  ON public.team_messages FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members can send messages"
  ON public.team_messages FOR INSERT
  WITH CHECK (
    public.is_team_conversation_member(auth.uid(), conversation_id)
    AND sender_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Senders can edit own messages"
  ON public.team_messages FOR UPDATE
  USING (sender_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Senders can delete own messages"
  ON public.team_messages FOR DELETE
  USING (sender_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Triggers
CREATE TRIGGER update_team_conversations_updated_at
  BEFORE UPDATE ON public.team_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_messages_updated_at
  BEFORE UPDATE ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversation_members;
