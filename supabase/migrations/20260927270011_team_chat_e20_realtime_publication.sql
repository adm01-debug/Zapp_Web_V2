-- E20: Add team_conversation_members and team_message_receipts to realtime publication
-- team_messages already in publication; team_conversations intentionally excluded (list
-- invalidates via message events — avoids unnecessary WAL traffic)
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_receipts;
