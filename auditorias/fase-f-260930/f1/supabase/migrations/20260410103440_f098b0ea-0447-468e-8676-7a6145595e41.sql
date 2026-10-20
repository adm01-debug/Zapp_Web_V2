
-- Fix: recreate view without SECURITY DEFINER (use SECURITY INVOKER which is default)
DROP VIEW IF EXISTS public.gmail_accounts_safe;

CREATE VIEW public.gmail_accounts_safe
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, email_address, is_active, sync_status,
  last_sync_at, last_error, token_expires_at, created_at, updated_at,
  (access_token IS NOT NULL) AS has_access_token,
  (refresh_token IS NOT NULL) AS has_refresh_token
FROM public.gmail_accounts;
