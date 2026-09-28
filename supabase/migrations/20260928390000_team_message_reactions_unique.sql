-- E25: UNIQUE em team_message_reactions (message_id, profile_id, emoji)
-- Previne reacoes duplicadas do mesmo usuario com o mesmo emoji

ALTER TABLE public.team_message_reactions
  DROP CONSTRAINT IF EXISTS team_message_reactions_unique_user_emoji;

ALTER TABLE public.team_message_reactions
  ADD CONSTRAINT team_message_reactions_unique_user_emoji
  UNIQUE (message_id, profile_id, emoji);
