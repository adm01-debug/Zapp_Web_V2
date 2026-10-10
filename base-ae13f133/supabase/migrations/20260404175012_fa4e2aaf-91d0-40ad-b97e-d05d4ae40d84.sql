
-- 1. Safe view excluding token columns
CREATE OR REPLACE VIEW public.gmail_accounts_safe AS
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

-- 2. Drop old SELECT policy that exposed tokens
DROP POLICY IF EXISTS "Users can view own gmail accounts" ON public.gmail_accounts;

-- 3. Block all direct authenticated reads - tokens only via service_role
CREATE POLICY "Block authenticated gmail reads"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (false);
