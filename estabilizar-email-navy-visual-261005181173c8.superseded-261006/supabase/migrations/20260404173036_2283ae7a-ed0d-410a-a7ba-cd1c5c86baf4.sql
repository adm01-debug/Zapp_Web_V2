
-- 1. Login attempts: remove the is_admin_or_supervisor policy, keep admin-only
DROP POLICY IF EXISTS "Admins can read login attempts" ON public.login_attempts;

-- 2. Audit logs: restrict to admin-only
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Only admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Password reset requests: restrict to admin-only 
DROP POLICY IF EXISTS "Admins can view all reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Only admins can directly select reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Admins can update reset requests" ON public.password_reset_requests;

CREATE POLICY "Only admins can view reset requests"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

CREATE POLICY "Only admins can update reset requests"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
