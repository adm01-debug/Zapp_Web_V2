-- E22: Drop redundant indexes on team_* tables
-- idx_team_conversation_members_conversation_id: covered by unique (conversation_id, profile_id)
-- idx_team_messages_conversation_id: covered by idx_team_messages_conversation (conversation_id, created_at DESC)
-- idx_team_message_reactions_message_id: covered by unique (message_id, profile_id, emoji)
DROP INDEX IF EXISTS public.idx_team_conversation_members_conversation_id;
DROP INDEX IF EXISTS public.idx_team_messages_conversation_id;
DROP INDEX IF EXISTS public.idx_team_message_reactions_message_id;
