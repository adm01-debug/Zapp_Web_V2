-- E20: Add team_conversation_members and team_message_receipts to realtime publication
-- team_messages already in publication; team_conversations intentionally excluded (list
-- invalidates via message events -- avoids unnecessary WAL traffic)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversation_members;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_message_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_receipts;
  END IF;
END $$;
