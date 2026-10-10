-- Clean up duplicate policies on login_attempts
DROP POLICY IF EXISTS "Only service role can insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Authenticated users cannot insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Only admins can directly read login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;

-- Single clean INSERT policy: block all authenticated inserts (service role bypasses RLS)
CREATE POLICY "Block authenticated inserts on login_attempts"
ON public.login_attempts FOR INSERT TO authenticated
WITH CHECK (false);

-- Single clean SELECT policy: admins/supervisors only
CREATE POLICY "Admins can read login attempts"
ON public.login_attempts FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Block UPDATE for authenticated users
CREATE POLICY "Block authenticated updates on login_attempts"
ON public.login_attempts FOR UPDATE TO authenticated
USING (false);

-- Block DELETE for non-admins
CREATE POLICY "Only admins can delete login attempts"
ON public.login_attempts FOR DELETE TO authenticated
USING (is_admin_or_supervisor(auth.uid()));