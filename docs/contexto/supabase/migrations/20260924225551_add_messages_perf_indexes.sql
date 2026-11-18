CREATE INDEX IF NOT EXISTS idx_messages_contact_read_sender
  ON public.messages (contact_id, is_read, sender)

CREATE INDEX IF NOT EXISTS idx_messages_read_sender
  ON public.messages (is_read, sender)
