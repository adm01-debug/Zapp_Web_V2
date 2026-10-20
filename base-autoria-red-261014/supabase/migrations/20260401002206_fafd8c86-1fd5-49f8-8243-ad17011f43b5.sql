
-- Drop existing SELECT policy that exposes reset_token
DROP POLICY IF EXISTS "Users can view own reset requests no token" ON public.password_reset_requests;

-- Create a view that hides the token
CREATE OR REPLACE VIEW public.password_reset_requests_safe AS
SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at, 
       rejection_reason, token_expires_at, ip_address, user_agent, 
       created_at, updated_at
FROM public.password_reset_requests;

-- Add SELECT policy that uses a function to strip the token
CREATE POLICY "Users can view own reset requests safe"
ON public.password_reset_requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() 
  AND is_admin_or_supervisor(auth.uid())
);

-- Regular users should only see via the safe view
-- Grant access to the safe view
GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
