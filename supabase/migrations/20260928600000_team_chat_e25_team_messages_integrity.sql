-- Objetivo: Constraints de integridade em team_messages + índices de performance
-- Estado ao vivo antes: is_edited nullable, sem CHECK de conteúdo/media
-- Rollback: ALTER TABLE public.team_messages ALTER COLUMN is_edited DROP NOT NULL; DROP CONSTRAINT ...; DROP INDEX ...

ALTER TABLE public.team_messages ALTER COLUMN is_edited SET NOT NULL;
ALTER TABLE public.team_messages ALTER COLUMN is_edited SET DEFAULT false;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_content_not_empty
  CHECK (trim(content) <> '' OR media_url IS NOT NULL);

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_media_consistency
  CHECK ((media_url IS NULL) = (media_type IS NULL));

CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to
  ON public.team_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_messages_conv_created
  ON public.team_messages(conversation_id, created_at DESC);
