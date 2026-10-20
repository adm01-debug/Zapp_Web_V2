-- Drop existing admin SELECT policy that exposes reset_token
DROP POLICY IF EXISTS "Admins can view reset requests" ON public.password_reset_requests;

-- Create a restrictive policy that hides reset_token via a security definer function
CREATE OR REPLACE FUNCTION public.get_reset_requests_safe()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email text,
  reason text,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  has_token boolean,
  token_expires_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    prr.id, prr.user_id, prr.email, prr.reason, prr.status,
    prr.reviewed_by, prr.reviewed_at, prr.rejection_reason,
    (prr.reset_token IS NOT NULL) AS has_token,
    prr.token_expires_at, prr.ip_address, prr.user_agent,
    prr.created_at, prr.updated_at
  FROM public.password_reset_requests prr;
$$;

-- Re-create a safe admin SELECT policy that prevents reading reset_token directly
-- The policy allows SELECT but the function above should be used for listing
CREATE POLICY "Admins can view reset requests safely"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND reset_token IS NULL -- Only rows where token has already been consumed/cleared
);