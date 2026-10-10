CREATE INDEX IF NOT EXISTS idx_email_threads_account_date
  ON public.email_threads (gmail_account_id, last_message_at DESC);
