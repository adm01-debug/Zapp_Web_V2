ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_fetch_attempted_at timestamptz;
