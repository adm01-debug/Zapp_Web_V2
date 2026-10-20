
-- 1. Fix privilege escalation: restrict user_roles management to admin only
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Keep SELECT for all authenticated (so users can check their own role)
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

-- 2. Fix profile update policy: add WITH CHECK to prevent supervisors from changing role fields
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()))
WITH CHECK (
  -- Admins can do anything
  public.has_role(auth.uid(), 'admin')
  -- Supervisors can update, but the trigger prevent_profile_privilege_escalation blocks role changes
  OR public.has_role(auth.uid(), 'supervisor')
);

-- 3. Warroom alerts: allow all authenticated users to read
DROP POLICY IF EXISTS "Admins and supervisors can view alerts" ON public.warroom_alerts;

CREATE POLICY "All authenticated users can view alerts"
ON public.warroom_alerts
FOR SELECT
TO authenticated
USING (true);
