-- E13: Add media_bucket and media_path columns to team_messages
-- Required to store permanent storage references instead of expiring signed URLs
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS media_bucket text,
  ADD COLUMN IF NOT EXISTS media_path text;
