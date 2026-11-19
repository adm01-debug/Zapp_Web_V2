CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_dedup
  ON public.messages (whatsapp_connection_id, external_id, sender)
  WHERE external_id IS NOT NULL
