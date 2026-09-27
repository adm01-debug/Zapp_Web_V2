CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_team_messages_content_trgm ON public.team_messages USING gin (content extensions.gin_trgm_ops);
