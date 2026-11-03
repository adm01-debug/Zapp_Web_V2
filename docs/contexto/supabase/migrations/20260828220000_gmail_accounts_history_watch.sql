ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS history_id text, ADD COLUMN IF NOT EXISTS watch_expiration timestamptz;
