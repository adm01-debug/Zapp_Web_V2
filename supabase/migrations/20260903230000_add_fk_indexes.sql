CREATE INDEX IF NOT EXISTS idx_dept_invitations_dept_id ON public.department_invitations (department_id);
CREATE INDEX IF NOT EXISTS idx_messages_audio_meme_id ON public.messages (audio_meme_id) WHERE audio_meme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_channel_connection_id ON public.messages (channel_connection_id) WHERE channel_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_dept_id ON public.profiles (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_conversations_dept_id ON public.team_conversations (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_profile_id ON public.team_message_reactions (profile_id);
