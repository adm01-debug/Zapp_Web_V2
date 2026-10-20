-- Drop and recreate the safe view with correct column order
DROP VIEW IF EXISTS public.gmail_accounts_safe;

CREATE VIEW public.gmail_accounts_safe WITH (security_invoker = on) AS
SELECT id, user_id, email_address, is_active, sync_status,
       last_sync_at, last_error, token_expires_at, created_at, updated_at
FROM public.gmail_accounts;