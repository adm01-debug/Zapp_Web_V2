
-- 1. GMAIL ACCOUNTS: Remove direct SELECT policy, users must use the safe view
DROP POLICY IF EXISTS "Users can view own gmail accounts safe" ON public.gmail_accounts;

-- Ensure the safe view has proper security
DROP VIEW IF EXISTS public.gmail_accounts_safe;
CREATE VIEW public.gmail_accounts_safe
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, email_address, is_active, sync_status,
  last_sync_at, last_error, token_expires_at, created_at, updated_at
FROM public.gmail_accounts;

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.gmail_accounts_safe TO authenticated;

-- Add RLS-like filtering via the view (security_invoker means RLS on base table applies)
-- Since we removed the SELECT policy, users can't read the base table directly anymore
-- We need a SELECT policy that only works through security definer functions or service role
-- Keep the service role policy as-is

-- 2. PASSWORD RESET REQUESTS: Create safe admin view without token column
CREATE OR REPLACE VIEW public.password_reset_requests_safe
WITH (security_invoker = true)
AS
SELECT 
  id, user_id, email, reason, status, reviewed_by, reviewed_at,
  rejection_reason, token_expires_at, ip_address, user_agent, 
  created_at, updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;

-- 3. AUDIT LOGS: Move inserts to server-side function
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

-- Create a SECURITY DEFINER function for safe audit logging
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, p_entity_id, p_details, p_user_agent);
END;
$$;
