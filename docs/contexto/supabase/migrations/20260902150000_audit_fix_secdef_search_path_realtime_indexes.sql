CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON public.contacts (updated_at DESC)

CREATE INDEX IF NOT EXISTS idx_messages_unread_contact ON public.messages (is_read, sender, contact_id) WHERE is_read = false AND sender = 'contact'
