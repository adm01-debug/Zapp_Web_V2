-- E34: drift mirror — add metadata jsonb columns + register in realtime publication
ALTER TABLE public.team_conversations
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversation_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_receipts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
