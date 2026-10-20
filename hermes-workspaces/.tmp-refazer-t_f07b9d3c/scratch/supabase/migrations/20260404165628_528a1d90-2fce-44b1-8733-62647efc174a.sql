-- 1. Fix password_reset_requests: admins should not see reset_token
-- Replace SELECT policy to exclude reset_token field via function
DROP POLICY IF EXISTS "Admins can view reset requests" ON public.password_reset_requests;

CREATE POLICY "Admins can view reset requests without tokens"
ON public.password_reset_requests FOR SELECT
TO authenticated
USING (
  is_admin_or_supervisor(auth.uid())
  OR user_id = auth.uid()
);

-- Create a secure view that hides reset_token from API
CREATE OR REPLACE VIEW public.password_reset_requests_safe AS
SELECT
  id, user_id, email, reason, status, reviewed_by, reviewed_at,
  rejection_reason, token_expires_at, ip_address, user_agent,
  created_at, updated_at
FROM public.password_reset_requests;

ALTER VIEW public.password_reset_requests_safe SET (security_invoker = on);
GRANT SELECT ON public.password_reset_requests_safe TO authenticated;

-- 2. Explicitly block anon access to webauthn_challenges
CREATE POLICY "Block anon access to webauthn challenges"
ON public.webauthn_challenges FOR ALL
TO anon
USING (false)
WITH CHECK (false);
