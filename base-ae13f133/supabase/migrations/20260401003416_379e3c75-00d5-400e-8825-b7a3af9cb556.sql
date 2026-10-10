
-- Ensure RLS is enabled on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Remove duplicate INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert audit_logs" ON public.audit_logs;

-- Fix login_attempts: create a view that hides IP/user_agent
CREATE OR REPLACE VIEW public.login_attempts_safe
WITH (security_invoker = true) AS
SELECT id, email, attempt_count, locked_until, last_attempt_at, created_at, updated_at
FROM public.login_attempts;

GRANT SELECT ON public.login_attempts_safe TO authenticated;

-- Replace login_attempts SELECT: restrict direct access to admin only
DROP POLICY IF EXISTS "Users can view own login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Authenticated can view own login attempts" ON public.login_attempts;

CREATE POLICY "Only admins can directly read login attempts"
ON public.login_attempts FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));
