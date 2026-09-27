-- E19: Enable pg_trgm and create GIN index on team_messages.content for server-side search
-- Note: pg_trgm is already enabled; operator class lives in schema extensions on Supabase Cloud
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_team_messages_content_trgm
  ON public.team_messages USING gin (content extensions.gin_trgm_ops);
