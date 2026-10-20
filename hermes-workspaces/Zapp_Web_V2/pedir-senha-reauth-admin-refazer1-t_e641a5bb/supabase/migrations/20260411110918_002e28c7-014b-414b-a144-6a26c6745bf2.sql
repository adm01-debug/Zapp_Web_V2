-- Drop plaintext token columns - encrypted versions are now used exclusively
ALTER TABLE public.gmail_accounts DROP COLUMN IF EXISTS access_token;
ALTER TABLE public.gmail_accounts DROP COLUMN IF EXISTS refresh_token;