-- E26: message_type validation + COMMENT ON media_url
ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_type_media_check
    CHECK (message_type IN ('text','image','audio','video','file','sticker','system') OR media_url IS NULL);

COMMENT ON COLUMN public.team_messages.media_url IS
  'URL temporária; prefer media_bucket+media_path para acesso persistente';
