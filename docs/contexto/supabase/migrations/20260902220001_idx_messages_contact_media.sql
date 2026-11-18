CREATE INDEX IF NOT EXISTS idx_messages_contact_media ON public.messages (contact_id, created_at DESC) WHERE media_url IS NOT NULL
