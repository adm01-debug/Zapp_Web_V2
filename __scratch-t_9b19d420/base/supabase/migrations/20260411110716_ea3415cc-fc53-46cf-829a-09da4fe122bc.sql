-- Remove sensitive tables from Realtime publication to prevent unauthorized broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.agent_stats;
ALTER PUBLICATION supabase_realtime DROP TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.team_conversation_members;
ALTER PUBLICATION supabase_realtime DROP TABLE public.team_messages;