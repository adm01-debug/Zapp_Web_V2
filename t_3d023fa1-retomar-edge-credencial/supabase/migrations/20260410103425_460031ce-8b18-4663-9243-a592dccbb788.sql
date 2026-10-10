
-- Create a safe view that hides OAuth tokens
CREATE OR REPLACE VIEW public.gmail_accounts_safe AS
SELECT 
  id, user_id, email_address, is_active, sync_status,
  last_sync_at, last_error, token_expires_at, created_at, updated_at,
  (access_token IS NOT NULL) AS has_access_token,
  (refresh_token IS NOT NULL) AS has_refresh_token
FROM public.gmail_accounts;

-- Update the function to never return tokens
CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
RETURNS TABLE(
  id uuid, user_id uuid, email_address text, is_active boolean, 
  sync_status text, last_sync_at timestamptz, last_error text, 
  token_expires_at timestamptz, created_at timestamptz, updated_at timestamptz
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
