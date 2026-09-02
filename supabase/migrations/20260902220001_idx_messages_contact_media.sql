-- Índice parcial para acelerar a query da galeria de mídia (filtra apenas mensagens com media_url)
CREATE INDEX IF NOT EXISTS idx_messages_contact_media
  ON public.messages (contact_id, created_at DESC)
  WHERE media_url IS NOT NULL;
