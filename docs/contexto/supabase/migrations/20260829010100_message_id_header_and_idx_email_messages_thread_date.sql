ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS message_id_header text

CREATE INDEX IF NOT EXISTS idx_email_messages_thread_date ON public.email_messages (thread_id, internal_date ASC)
