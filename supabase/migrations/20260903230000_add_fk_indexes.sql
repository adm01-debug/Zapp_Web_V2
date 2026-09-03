-- PERF: add indexes on 6 unindexed FK columns
-- Without these, DELETE/UPDATE on parent tables triggers sequential scans on child tables.
-- Verified via correct pg_index first-column check (not ILIKE pattern matching).

-- department_invitations.department_id → departments
CREATE INDEX IF NOT EXISTS idx_dept_invitations_dept_id
  ON public.department_invitations (department_id);

-- messages.audio_meme_id → audio_memes
CREATE INDEX IF NOT EXISTS idx_messages_audio_meme_id
  ON public.messages (audio_meme_id)
  WHERE audio_meme_id IS NOT NULL;

-- messages.channel_connection_id → channel_connections
CREATE INDEX IF NOT EXISTS idx_messages_channel_connection_id
  ON public.messages (channel_connection_id)
  WHERE channel_connection_id IS NOT NULL;

-- profiles.department_id → departments
CREATE INDEX IF NOT EXISTS idx_profiles_dept_id
  ON public.profiles (department_id)
  WHERE department_id IS NOT NULL;

-- team_conversations.department_id → departments
CREATE INDEX IF NOT EXISTS idx_team_conversations_dept_id
  ON public.team_conversations (department_id)
  WHERE department_id IS NOT NULL;

-- team_message_reactions.profile_id → profiles
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_profile_id
  ON public.team_message_reactions (profile_id);
