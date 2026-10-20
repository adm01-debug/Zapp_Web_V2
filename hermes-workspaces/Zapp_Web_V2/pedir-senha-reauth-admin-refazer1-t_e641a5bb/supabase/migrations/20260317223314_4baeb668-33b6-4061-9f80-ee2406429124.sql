
-- Profiles: All authenticated can view (team CRM requirement)
-- The prevent_role_escalation trigger already protects against privilege escalation via UPDATE
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
