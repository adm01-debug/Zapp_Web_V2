-- Drop dependent objects first
DROP VIEW IF EXISTS public.password_reset_requests_safe;
DROP POLICY IF EXISTS "Admins can view reset requests safely" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Users can request own password reset" ON public.password_reset_requests;
DROP TRIGGER IF EXISTS hash_reset_token ON public.password_reset_requests;
DROP TRIGGER IF EXISTS protect_reset_token_trigger ON public.password_reset_requests;

-- Now drop the column
ALTER TABLE public.password_reset_requests DROP COLUMN reset_token;

-- Recreate safe view without token
CREATE VIEW public.password_reset_requests_safe WITH (security_invoker = on) AS
SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
       rejection_reason, token_expires_at, ip_address, user_agent, created_at, updated_at
FROM public.password_reset_requests;

-- Recreate admin SELECT policy (no token filter needed since column is gone)
CREATE POLICY "Admins can view reset requests"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Recreate user INSERT policy (no token filter needed)
CREATE POLICY "Users can request own password reset"
ON public.password_reset_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Drop old functions
DROP FUNCTION IF EXISTS public.hash_reset_token();
DROP FUNCTION IF EXISTS public.protect_reset_token();