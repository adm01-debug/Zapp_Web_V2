
-- Fix: Recreate view with SECURITY INVOKER (default, safe)
DROP VIEW IF EXISTS public.gmail_accounts_safe;

CREATE VIEW public.gmail_accounts_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  email_address,
  is_active,
  sync_status,
  last_sync_at,
  last_error,
  token_expires_at,
  created_at,
  updated_at
FROM public.gmail_accounts;

-- Users need to read their own gmail accounts via the safe view
-- The view queries the underlying table, so we need a SELECT policy that allows own-row access
DROP POLICY IF EXISTS "Block authenticated gmail reads" ON public.gmail_accounts;

CREATE POLICY "Users can view own gmail accounts safe"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
