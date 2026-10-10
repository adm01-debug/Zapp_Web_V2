
-- 1. FIX user_service_accounts: Change policies from public to authenticated
DROP POLICY IF EXISTS "Only admins can delete service accounts" ON public.user_service_accounts;
DROP POLICY IF EXISTS "Only admins can insert service accounts" ON public.user_service_accounts;
DROP POLICY IF EXISTS "Only admins can update service accounts" ON public.user_service_accounts;

CREATE POLICY "Only admins can insert service accounts"
ON public.user_service_accounts
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Only admins can update service accounts"
ON public.user_service_accounts
FOR UPDATE
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Only admins can delete service accounts"
ON public.user_service_accounts
FOR DELETE
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- 2. FIX gmail_accounts: Remove owner SELECT policy (tokens exposed)
-- Owners should use gmail_accounts_safe view only
DROP POLICY IF EXISTS "Users can view own gmail account" ON public.gmail_accounts;

-- Create a SECURITY DEFINER function for owners to read safe fields only
CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email_address text,
  is_active boolean,
  sync_status text,
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid();
$$;
